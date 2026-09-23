import { describe, expect, it } from "vitest";
import { decodeIngredientMeta } from "../../src/application/ingredient-meta";
import {
  createRecipeInLogseq,
  markExistingRecipeInLogseq,
} from "../../src/logseq/authoring";

function fakeHost(
  initialProperties: Record<string, unknown> = {},
  existingPages: Record<string, unknown> = {},
) {
  const writes: Array<{ id: string; key: string; value: unknown }> = [];
  const appended: Array<{ page: string; title: string; uuid: string }> = [];
  const inserted: Array<{ parentId: string; title: string; uuid: string }> = [];
  const createPageCalls: string[] = [];
  const libraryBlocks: Array<{ id: number; uuid: string; title: string }> = [];
  const properties = new Map<string, unknown>(
    Object.entries(initialProperties),
  );
  let next = 1;
  let nextInserted = 1;

  return {
    writes,
    appended,
    inserted,
    createPageCalls,
    properties,
    host: {
      getPage: async (id: string) =>
        id === "Recipe Library" && createPageCalls.includes(id)
          ? { id: 100, uuid: "library-page", title: id }
          : (existingPages[id] ?? null),
      createPage: async (title: string) => {
        createPageCalls.push(title);
        return { id: 100, uuid: "library-page", title };
      },
      appendBlockInPage: async (page: string, title: string) => {
        const uuid =
          title === "Recipes" ? "recipes-section" : "archived-section";
        const block = { id: next++, uuid, title };
        appended.push({ page, title, uuid: block.uuid });
        libraryBlocks.push(block);
        return block;
      },
      insertBlock: async (parentId: string, title: string) => {
        const block = {
          id: nextInserted,
          uuid: `inserted-${nextInserted++}`,
          title,
        };
        inserted.push({ parentId, title, uuid: block.uuid });
        return block;
      },
      moveBlock: async () => undefined,
      getBlockProperty: async (id: string, key: string) =>
        properties.get(`${id}:${key}`),
      upsertBlockProperty: async (id: string, key: string, value: unknown) => {
        writes.push({ id, key, value });
        properties.set(`${id}:${key}`, value);
      },
      removeBlockProperty: async (id: string, key: string) => {
        properties.delete(`${id}:${key}`);
      },
      getPageBlocksTree: async (page: string) =>
        page === "Recipe Library" ? libraryBlocks : [],
      removeBlock: async () => undefined,
      restorePage: async () => true,
    },
  };
}

describe("recipe authoring", () => {
  it("creates a readable recipe block tree under Recipe Library", async () => {
    const fake = fakeHost();
    const result = await createRecipeInLogseq(
      fake.host,
      {
        title: "Cookie",
        baseYield: 8,
        yieldUnit: "cookies",
        locale: "en",
        sourceMeasurementSystem: "us",
      },
      { jsonProperty: false },
    );

    expect(result.rootId).toBe("inserted-1");
    expect(fake.inserted.map((item) => [item.parentId, item.title])).toEqual([
      ["recipes-section", "Cookie"],
      ["inserted-1", "Ingredients"],
      ["inserted-1", "Steps"],
      ["inserted-1", "Notes"],
    ]);
    expect(fake.createPageCalls).toEqual(["Recipe Library"]);
    expect(fake.writes.at(-1)).toEqual({
      id: "inserted-1",
      key: "recipe_marker",
      value: true,
    });
    expect(
      fake.writes.some(
        (write) => write.key === "base_yield" && write.value === 8,
      ),
    ).toBe(true);
    expect(fake.writes.some((write) => write.key === "amount")).toBe(false);
    expect(fake.writes.some((write) => write.key === "unit")).toBe(false);
  });

  it("writes the recipe marker only after every other structural write, so a partial failure stays undiscoverable", async () => {
    const fake = fakeHost();

    await createRecipeInLogseq(
      fake.host,
      { title: "Cookie", baseYield: 8, yieldUnit: "cookies", locale: "en" },
      { jsonProperty: false },
    );

    const markerIndex = fake.writes.findIndex(
      (write) => write.key === "recipe_marker",
    );
    expect(markerIndex).toBe(fake.writes.length - 1);
  });

  it("leaves an unrelated same-title page untouched", async () => {
    const fake = fakeHost({}, { Cookie: { id: 55, uuid: "existing-cookie" } });

    const result = await createRecipeInLogseq(
      fake.host,
      {
        title: "Cookie",
        baseYield: 8,
        locale: "en",
        sourceMeasurementSystem: "us",
      },
      { jsonProperty: false },
    );

    expect(result.rootId).toBe("inserted-1");
    expect(fake.createPageCalls).toEqual(["Recipe Library"]);
    expect(fake.writes.every((write) => write.id !== "existing-cookie")).toBe(
      true,
    );
  });

  it("marks an existing subtree without rewriting visible block text", async () => {
    const fake = fakeHost();
    await markExistingRecipeInLogseq(
      fake.host,
      {
        rootId: "existing-root",
        locale: "tr",
        sourceMeasurementSystem: "metric",
        sectionRoles: [
          { blockId: "ingredients", role: "ingredients" },
          { blockId: "steps", role: "steps" },
        ],
      },
      { jsonProperty: false },
    );

    expect(fake.appended).toHaveLength(0);
    expect(fake.writes).toEqual(
      expect.arrayContaining([
        { id: "existing-root", key: "recipe_marker", value: true },
        { id: "ingredients", key: "section_role", value: "ingredients" },
        { id: "steps", key: "section_role", value: "steps" },
      ]),
    );
  });

  it("writes the recipe marker only after section roles and ingredient metadata during conversion", async () => {
    const fake = fakeHost();
    await markExistingRecipeInLogseq(
      fake.host,
      {
        rootId: "existing-root",
        locale: "en",
        sourceMeasurementSystem: "us",
        sectionRoles: [
          { blockId: "ingredients", role: "ingredients" },
          { blockId: "steps", role: "steps" },
        ],
        ingredientMetadata: [
          {
            blockId: "ingredient-1",
            parsed: {
              rawText: "1 cup flour",
              amount: { kind: "exact", value: 1 },
              unit: "cup_us",
              ingredientText: "flour",
              confidence: "exact",
            },
          },
        ],
      },
      { jsonProperty: false },
    );

    const markerIndex = fake.writes.findIndex(
      (write) => write.id === "existing-root" && write.key === "recipe_marker",
    );
    expect(markerIndex).toBe(fake.writes.length - 1);
  });

  it("writes one hidden canonical ingredient payload during conversion", async () => {
    const fake = fakeHost();
    await markExistingRecipeInLogseq(
      fake.host,
      {
        rootId: "existing-root",
        locale: "en",
        sourceMeasurementSystem: "us",
        baseYield: 4,
        sectionRoles: [
          { blockId: "ingredients", role: "ingredients" },
          { blockId: "steps", role: "steps" },
        ],
        ingredientMetadata: [
          {
            blockId: "ingredient-1",
            parsed: {
              rawText: "1 cup flour",
              amount: { kind: "exact", value: 1 },
              unit: "cup_us",
              ingredientText: "flour",
              confidence: "exact",
            },
          },
        ],
      },
      { jsonProperty: false },
    );

    const stored = decodeIngredientMeta(
      fake.properties.get("ingredient-1:ingredient_meta"),
    );
    expect(stored).toMatchObject({
      version: 1,
      locale: "en",
      sourceMeasurementSystem: "us",
      parsed: {
        rawText: "1 cup flour",
        unit: "cup_us",
        ingredientText: "flour",
      },
    });
    expect(fake.writes.some((write) => write.key === "amount")).toBe(false);
    expect(fake.writes.some((write) => write.key === "unit")).toBe(false);
  });

  it("preserves user metadata when an existing recipe is converted again", async () => {
    const fake = fakeHost({
      "existing-root:recipe_meta": JSON.stringify({
        categories: ["Dessert"],
        tags: ["Chocolate"],
        measurementSystemOverride: "us",
        ingredientConversionOverrides: [
          {
            ingredientKey: "butter",
            massUnit: "g",
            volumeUnit: "tbsp_us",
            gramsPerVolumeUnit: 14.2,
          },
        ],
      }),
    });

    await markExistingRecipeInLogseq(
      fake.host,
      {
        rootId: "existing-root",
        locale: "tr",
        sourceMeasurementSystem: "metric",
        sectionRoles: [
          { blockId: "ingredients", role: "ingredients" },
          { blockId: "steps", role: "steps" },
        ],
      },
      { jsonProperty: false },
    );

    const metaWrite = fake.writes.find(
      (write) => write.id === "existing-root" && write.key === "recipe_meta",
    );
    expect(typeof metaWrite?.value).toBe("string");
    expect(JSON.parse(String(metaWrite?.value))).toEqual({
      categories: ["Dessert"],
      tags: ["Chocolate"],
      measurementSystemOverride: "us",
      ingredientConversionOverrides: [
        {
          ingredientKey: "butter",
          massUnit: "g",
          volumeUnit: "tbsp_us",
          gramsPerVolumeUnit: 14.2,
        },
      ],
      parserLocale: "tr",
      sourceMeasurementSystem: "metric",
    });
  });

  it("refuses to convert content carrying a newer recipe schema", async () => {
    const fake = fakeHost({ "existing-root:schema_version": 2 });

    await expect(
      markExistingRecipeInLogseq(
        fake.host,
        {
          rootId: "existing-root",
          locale: "en",
          sectionRoles: [{ blockId: "ingredients", role: "ingredients" }],
        },
        { jsonProperty: false },
      ),
    ).rejects.toThrow(/schema 2 is newer than supported schema 1/i);

    expect(fake.writes).toHaveLength(0);
  });
});
