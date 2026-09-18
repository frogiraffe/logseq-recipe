import { describe, expect, it } from "vitest";
import { decodeIngredientMeta } from "../../src/application/ingredient-meta";
import { createDraftRecipeRepository } from "../../src/logseq/repository";

interface FakeBlock {
  id: number;
  uuid: string;
  title: string;
  children: FakeBlock[];
}

function fakeHost() {
  let nextId = 100;
  const blocksByUuid = new Map<string, FakeBlock>();
  const pagesByTitle = new Map<string, FakeBlock>();
  const properties = new Map<string, unknown>();
  const insertedBlocks: Array<{ parentId: string; content: string }> = [];
  const createPageCalls: string[] = [];
  const writes: Array<{ id: string; key: string; value: unknown }> = [];

  function makeBlock(title: string): FakeBlock {
    const block: FakeBlock = {
      id: nextId,
      uuid: `block-${nextId}`,
      title,
      children: [],
    };
    nextId += 1;
    blocksByUuid.set(block.uuid, block);
    return block;
  }

  const root = makeBlock("Cookie");
  pagesByTitle.set("Cookie", root);
  const ingredientsSection = makeBlock("Ingredients");
  const stepsSection = makeBlock("Steps");
  const notesSection = makeBlock("Notes");
  root.children.push(ingredientsSection, stepsSection, notesSection);

  const ingredient1 = makeBlock("2 eggs");
  const ingredient2 = makeBlock("1 cup flour");
  ingredientsSection.children.push(ingredient1, ingredient2);
  stepsSection.children.push(makeBlock("Bake for 10 minutes."));
  notesSection.children.push(makeBlock("Best served warm."));

  properties.set(`${root.uuid}:recipe_marker`, true);
  properties.set(`${root.uuid}:base_yield`, 8);
  properties.set(`${root.uuid}:yield_unit`, "cookies");
  properties.set(`${root.uuid}:schema_version`, 1);
  properties.set(`${root.uuid}:prep_minutes`, 15);
  properties.set(`${root.uuid}:cook_minutes`, 20);
  properties.set(`${root.uuid}:cover_ref`, "assets/cookie.png");
  properties.set(
    `${root.uuid}:recipe_meta`,
    JSON.stringify({
      categories: ["Dessert"],
      tags: ["Quick"],
      parserLocale: "en",
      sourceMeasurementSystem: "us",
      ingredientConversionOverrides: [],
    }),
  );
  properties.set(`${ingredientsSection.uuid}:section_role`, "ingredients");
  properties.set(`${stepsSection.uuid}:section_role`, "steps");
  properties.set(`${notesSection.uuid}:section_role`, "notes");

  const editor = {
    getBlock: async (id: string) => blocksByUuid.get(id) ?? null,
    getPage: async (id: string) => pagesByTitle.get(id) ?? null,
    getPageBlocksTree: async (_id: string) => [] as unknown[],
    getBlockProperty: async (id: string, key: string) =>
      properties.get(`${id}:${key}`),
    upsertBlockProperty: async (id: string, key: string, value: unknown) => {
      writes.push({ id, key, value });
      properties.set(`${id}:${key}`, value);
    },
    removeBlockProperty: async (id: string, key: string) => {
      properties.delete(`${id}:${key}`);
    },
    getProperty: async (_key: string) => ({
      ident: ":plugin.property.logseq-recipe/recipe_marker",
    }),
    updateBlock: async (_id: string, _content: string) => undefined,
    removeBlock: async (_id: string) => undefined,
    insertBlock: async (parentId: string, content: string) => {
      insertedBlocks.push({ parentId, content });
      const parent = blocksByUuid.get(parentId);
      const block = makeBlock(content);
      parent?.children.push(block);
      return block;
    },
    renamePage: async (_from: string, _to: string) => undefined,
    deletePage: async (_name: string) => undefined,
    createPage: async (title: string) => {
      createPageCalls.push(title);
      const block = makeBlock(title);
      pagesByTitle.set(title, block);
      return block;
    },
    appendBlockInPage: async (page: string, title: string) => {
      const pageRoot = pagesByTitle.get(page);
      if (!pageRoot) throw new Error(`Unknown page: ${page}`);
      const block = makeBlock(title);
      pageRoot.children.push(block);
      return block;
    },
    restorePage: async (_page: string) => undefined,
    moveBlock: async (
      _srcBlock: string,
      _targetBlock: string,
      _options?: { before?: boolean; children?: boolean },
    ) => undefined,
    upsertProperty: async (
      _key: string,
      _schema: {
        type: string;
        cardinality: "one" | "many";
        hide: boolean;
        public: boolean;
      },
    ) => undefined,
  };

  return {
    host: {
      editor,
      db: {
        datascriptQuery: async <T = unknown>() => [] as T,
        onChanged: () => () => undefined,
      },
      app: { getUserConfigs: async () => ({}) },
    },
    root,
    ingredient1,
    ingredient2,
    insertedBlocks,
    createPageCalls,
    writes,
    pagesByTitle,
    properties,
  };
}

const settings = {
  uiLanguage: "en" as const,
  defaultParserLocale: "auto" as const,
  defaultMeasurementSystem: "metric" as const,
};

describe("duplicateRecipe", () => {
  it("copies content, structured ingredient metadata, and root metadata into a new page", async () => {
    const fake = fakeHost();
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { jsonProperty: false, coverReference: "asset-path" },
    });

    const duplicated = await repository.duplicateRecipe(fake.root.uuid);

    expect(duplicated.title).toBe("Cookie (copy)");
    expect(duplicated.baseYield).toBe(8);
    expect(duplicated.yieldUnit).toBe("cookies");
    expect(duplicated.prepMinutes).toBe(15);
    expect(duplicated.cookMinutes).toBe(20);
    expect(duplicated.categories).toEqual(["Dessert"]);
    expect(duplicated.tags).toEqual(["Quick"]);
    expect(duplicated.cover).toEqual({
      kind: "asset-path",
      value: "assets/cookie.png",
    });
    expect(duplicated.ingredients.map((i) => i.rawText)).toEqual([
      "2 eggs",
      "1 cup flour",
    ]);
    expect(duplicated.steps.map((s) => s.rawText)).toEqual([
      "Bake for 10 minutes.",
    ]);
    expect(duplicated.notes.map((n) => n.text)).toEqual(["Best served warm."]);

    expect(fake.createPageCalls).toEqual(["Cookie (copy)"]);
    expect(fake.insertedBlocks.map((b) => b.content)).toEqual([
      "2 eggs",
      "1 cup flour",
      "Bake for 10 minutes.",
      "Best served warm.",
    ]);

    const newIngredientIds = new Set(duplicated.ingredients.map((i) => i.id));
    const ingredientMetaWrites = fake.writes.filter(
      (write) =>
        write.key === "ingredient_meta" && newIngredientIds.has(write.id),
    );
    expect(ingredientMetaWrites).toHaveLength(2);
    const decoded = ingredientMetaWrites.map((write) =>
      decodeIngredientMeta(write.value),
    );
    expect(decoded.map((d) => d?.parsed.rawText)).toEqual([
      "2 eggs",
      "1 cup flour",
    ]);

    // The original recipe is untouched.
    expect(fake.root.children).toHaveLength(3);
  });

  it("preserves a manually corrected ingredient's canonical structure instead of reparsing raw text", async () => {
    const fake = fakeHost();
    // The parser alone could never derive this from "a pinch of salt" - it's
    // exactly the kind of correction Convert Preview lets a user apply.
    fake.properties.set(
      `${fake.ingredient1.uuid}:ingredient_meta`,
      JSON.stringify({
        version: 1,
        locale: "en",
        sourceMeasurementSystem: "us",
        parsed: {
          rawText: "2 eggs",
          amount: { kind: "exact", value: 3 },
          unit: "egg",
          ingredientText: "large eggs, corrected",
          confidence: "exact",
        },
      }),
    );
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { jsonProperty: false, coverReference: "asset-path" },
    });

    const duplicated = await repository.duplicateRecipe(fake.root.uuid);

    const correctedIngredient = duplicated.ingredients.find(
      (i) => i.rawText === "2 eggs",
    );
    expect(correctedIngredient).toMatchObject({
      amount: { kind: "exact", value: 3 },
      unit: "egg",
      ingredientText: "large eggs, corrected",
    });
  });

  it("avoids a title collision by appending an incrementing suffix", async () => {
    const fake = fakeHost();
    fake.pagesByTitle.set("Cookie (copy)", {
      id: 1,
      uuid: "existing-copy",
      title: "Cookie (copy)",
      children: [],
    });
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { jsonProperty: false, coverReference: "asset-path" },
    });

    const duplicated = await repository.duplicateRecipe(fake.root.uuid);

    expect(duplicated.title).toBe("Cookie (copy 2)");
  });
});
