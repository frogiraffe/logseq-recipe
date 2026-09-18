import { describe, expect, it } from "vitest";
import { decodeIngredientMeta } from "../../src/application/ingredient-meta";
import {
  createRecipeInLogseq,
  markExistingRecipeInLogseq,
} from "../../src/logseq/authoring";

function fakeHost(
  initialProperties: Record<string, unknown> = {},
  existingPages: Record<string, unknown> = {},
  existingChildren: Record<string, Array<{ uuid: string }>> = {},
) {
  const writes: Array<{ id: string; key: string; value: unknown }> = [];
  const appended: Array<{ page: string; title: string; uuid: string }> = [];
  const removed: string[] = [];
  const restored: string[] = [];
  const createPageCalls: string[] = [];
  const properties = new Map<string, unknown>(
    Object.entries(initialProperties),
  );
  let next = 1;

  return {
    writes,
    appended,
    removed,
    restored,
    createPageCalls,
    properties,
    host: {
      getPage: async (id: string) => existingPages[id] ?? null,
      createPage: async (title: string) => {
        createPageCalls.push(title);
        return { id: 100, uuid: "recipe-root", title };
      },
      appendBlockInPage: async (page: string, title: string) => {
        const block = { id: next, uuid: `block-${next++}`, title };
        appended.push({ page, title, uuid: block.uuid });
        return block;
      },
      getBlockProperty: async (id: string, key: string) =>
        properties.get(`${id}:${key}`),
      upsertBlockProperty: async (id: string, key: string, value: unknown) => {
        writes.push({ id, key, value });
        properties.set(`${id}:${key}`, value);
      },
      getPageBlocksTree: async (page: string) => existingChildren[page] ?? [],
      removeBlock: async (id: string) => {
        removed.push(id);
      },
      restorePage: async (page: string) => {
        restored.push(page);
        return true;
      },
    },
  };
}

describe("recipe authoring", () => {
  it("creates a readable recipe skeleton through the page append API", async () => {
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

    expect(result.rootId).toBe("recipe-root");
    expect(fake.appended.map((item) => [item.page, item.title])).toEqual([
      ["Cookie", "Ingredients"],
      ["Cookie", "Steps"],
      ["Cookie", "Notes"],
    ]);
    expect(
      fake.writes.some(
        (write) => write.key === "recipe_marker" && write.value === true,
      ),
    ).toBe(true);
    expect(
      fake.writes.some(
        (write) => write.key === "base_yield" && write.value === 8,
      ),
    ).toBe(true);
    expect(fake.writes.some((write) => write.key === "amount")).toBe(false);
    expect(fake.writes.some((write) => write.key === "unit")).toBe(false);
  });

  it("refuses to mutate a pre-existing page with the requested recipe title", async () => {
    const fake = fakeHost({}, { Cookie: { id: 55, uuid: "existing-cookie" } });

    await expect(
      createRecipeInLogseq(
        fake.host,
        {
          title: "Cookie",
          baseYield: 8,
          locale: "en",
          sourceMeasurementSystem: "us",
        },
        { jsonProperty: false },
      ),
    ).rejects.toThrow(/already exists/i);

    expect(fake.appended).toHaveLength(0);
    expect(fake.writes).toHaveLength(0);
  });

  it("restores a recycled page with the requested title through restorePage, never createPage", async () => {
    const fake = fakeHost(
      {},
      {
        Cookie: {
          id: 55,
          uuid: "recycled-cookie",
          ":logseq.property/deleted-at": 1_789_000_000_000,
        },
      },
    );

    await expect(
      createRecipeInLogseq(
        fake.host,
        {
          title: "Cookie",
          baseYield: 8,
          locale: "en",
          sourceMeasurementSystem: "us",
        },
        { jsonProperty: false },
      ),
    ).resolves.toMatchObject({ rootId: "recycled-cookie" });

    expect(fake.restored).toEqual(["Cookie"]);
    expect(fake.createPageCalls).toHaveLength(0);
    expect(fake.appended).toHaveLength(3);
  });

  it("purges every leftover child when reusing a recycled page's title, so old content can never resurface", async () => {
    const fake = fakeHost(
      {},
      {
        Cookie: {
          id: 55,
          uuid: "recycled-cookie",
          ":logseq.property/deleted-at": 1_789_000_000_000,
        },
      },
      {
        Cookie: [
          { uuid: "old-ingredients-section" },
          { uuid: "old-steps-section" },
          { uuid: "old-notes-section" },
        ],
      },
    );

    await createRecipeInLogseq(
      fake.host,
      {
        title: "Cookie",
        baseYield: 8,
        locale: "en",
        sourceMeasurementSystem: "us",
      },
      { jsonProperty: false },
    );

    expect(fake.removed.sort()).toEqual([
      "old-ingredients-section",
      "old-notes-section",
      "old-steps-section",
    ]);
  });

  it("never touches existing children when creating a genuinely fresh page", async () => {
    const fake = fakeHost();

    await createRecipeInLogseq(
      fake.host,
      {
        title: "Brand New Cookie",
        baseYield: 8,
        locale: "en",
        sourceMeasurementSystem: "us",
      },
      { jsonProperty: false },
    );

    expect(fake.removed).toHaveLength(0);
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
});
