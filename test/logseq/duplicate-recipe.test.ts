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

  function addActiveRecipe(title: string): FakeBlock {
    const block = makeBlock(title);
    properties.set(`${block.uuid}:recipe_marker`, true);
    properties.set(`${block.uuid}:base_yield`, 8);
    return block;
  }

  function addArchivedRecipe(title: string): FakeBlock {
    const block = makeBlock(title);
    properties.set(`${block.uuid}:recipe_archived`, true);
    properties.set(`${block.uuid}:base_yield`, 8);
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
    isPageBlock: (_entity: unknown) => false,
    getBlock: async (id: string) => blocksByUuid.get(id) ?? null,
    getPage: async (id: string) => pagesByTitle.get(id) ?? null,
    getPageBlocksTree: async (id: string) =>
      pagesByTitle.get(id)?.children ?? [],
    // A page property reads back as its pages, as in Logseq.
    getBlockProperty: async (id: string, key: string) => {
      const value = properties.get(`${id}:${key}`);
      return Array.isArray(value)
        ? value.map((pageId) =>
            [...pagesByTitle.values()].find((page) => page.id === pageId),
          )
        : value;
    },
    upsertBlockProperty: async (id: string, key: string, value: unknown) => {
      writes.push({ id, key, value });
      properties.set(`${id}:${key}`, value);
    },
    removeBlockProperty: async (id: string, key: string) => {
      properties.delete(`${id}:${key}`);
    },
    getProperty: async (key: string) => ({
      ident: `:plugin.property.logseq-recipe/${key}`,
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
        datascriptQuery: async <T = unknown>(query: string) =>
          [...blocksByUuid.values()]
            .filter((block) =>
              query.includes("/recipe_archived")
                ? properties.get(`${block.uuid}:recipe_archived`) === true
                : properties.get(`${block.uuid}:recipe_marker`) === true,
            )
            .map((block) => [{ uuid: block.uuid, title: block.title }]) as T,
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
    addActiveRecipe,
    addArchivedRecipe,
  };
}

const settings = {
  uiLanguage: "en" as const,
  defaultParserLocale: "auto" as const,
  defaultMeasurementSystem: "metric" as const,
};

describe("a recipe's categories and tags", () => {
  const repositoryFor = (fake: ReturnType<typeof fakeHost>) =>
    createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: {
        coverReference: "asset-path",
        taxonomyProperties: true,
      },
    });
  const pageIds = async (
    fake: ReturnType<typeof fakeHost>,
    names: string[],
  ) => {
    const ids: number[] = [];
    for (const name of names) {
      const page =
        fake.pagesByTitle.get(name) ??
        ((await fake.host.editor.createPage(name)) as { id: number });
      ids.push(page.id);
    }
    return ids;
  };

  it("merge the JSON with the properties until the plugin has moved them", async () => {
    const fake = fakeHost();
    fake.properties.set(
      `${fake.root.uuid}:recipe_categories`,
      await pageIds(fake, ["Baking"]),
    );
    const recipe = await repositoryFor(fake).getRecipe(fake.root.uuid);
    expect(recipe?.categories).toEqual(["Dessert", "Baking"]);
    expect(recipe?.tags).toEqual(["Quick"]);
  });

  it("come from the properties alone once moved, edits in Logseq included", async () => {
    const fake = fakeHost();
    const meta = JSON.parse(
      fake.properties.get(`${fake.root.uuid}:recipe_meta`) as string,
    );
    fake.properties.set(
      `${fake.root.uuid}:recipe_meta`,
      JSON.stringify({ ...meta, taxonomyInProperties: true }),
    );
    // In Logseq: Baking added to the categories, every tag removed.
    fake.properties.set(
      `${fake.root.uuid}:recipe_categories`,
      await pageIds(fake, ["Baking", "Dessert"]),
    );
    const repository = repositoryFor(fake);

    const recipe = await repository.getRecipe(fake.root.uuid);
    expect(recipe?.categories).toEqual(["Dessert", "Baking"]);
    expect(recipe?.tags).toEqual([]);
    const [summary] = await repository.listRecipeSummaries();
    expect(summary.categories).toEqual(["Dessert", "Baking"]);
  });
});

describe("duplicateRecipe", () => {
  it("gives the copy its category and tag properties when the graph has them", async () => {
    const pagesOf = (fake: ReturnType<typeof fakeHost>, id: string) =>
      ["recipe_categories", "recipe_tags"].map((key) =>
        (
          (fake.properties.get(`${id}:${key}`) as number[] | undefined) ?? []
        ).map(
          (pageId) =>
            [...fake.pagesByTitle.values()].find((page) => page.id === pageId)
              ?.title,
        ),
      );

    const withProperties = fakeHost();
    const copy = await createDraftRecipeRepository(withProperties.host, {
      settings,
      schemaCapabilities: {
        coverReference: "asset-path",
        taxonomyProperties: true,
      },
    }).duplicateRecipe(withProperties.root.uuid);
    expect(pagesOf(withProperties, copy.id)).toEqual([["Dessert"], ["Quick"]]);

    const without = fakeHost();
    const plain = await createDraftRecipeRepository(without.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    }).duplicateRecipe(without.root.uuid);
    expect(pagesOf(without, plain.id)).toEqual([[], []]);
  });

  it("copies content, structured ingredient metadata, and root metadata into a library block", async () => {
    const fake = fakeHost();
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
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
    expect(fake.writes.at(-1)).toEqual({
      id: duplicated.id,
      key: "recipe_marker",
      value: true,
    });
    expect(
      (await repository.listRecipeSummaries()).map((recipe) => recipe.title),
    ).toEqual(["Cookie", "Cookie (copy)"]);

    expect(fake.createPageCalls).toEqual(["Recipe Library"]);
    expect(fake.insertedBlocks.map((b) => b.content)).toEqual([
      "Cookie (copy)",
      "Ingredients",
      "Steps",
      "Notes",
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

  it("keeps ingredient groups and step notes", async () => {
    const fake = fakeHost();
    const ingredients = fake.root.children[0];
    const steps = fake.root.children[1];
    const group = {
      id: 500,
      uuid: "group-dough",
      title: "For the dough:",
      children: [
        { id: 501, uuid: "dough-flour", title: "200 g flour", children: [] },
      ],
    };
    ingredients.children.unshift(group);
    steps.children[0].children.push({
      id: 502,
      uuid: "step-note",
      title: "Until golden.",
      children: [],
    });
    // Moves blocks for real, so the copy's structure can be read back.
    const blocks = () => {
      const all: Array<{ uuid: string; children: unknown[] }> = [];
      const walk = (block: { uuid: string; children: unknown[] }) => {
        all.push(block);
        for (const child of block.children) walk(child as typeof block);
      };
      for (const page of fake.pagesByTitle.values()) walk(page);
      return all;
    };
    fake.host.editor.moveBlock = async (src, target, options) => {
      const all = blocks();
      const parent = all.find((block) =>
        block.children.some(
          (child) => (child as { uuid: string }).uuid === src,
        ),
      );
      if (!parent) return undefined;
      const index = parent.children.findIndex(
        (child) => (child as { uuid: string }).uuid === src,
      );
      const [moved] = parent.children.splice(index, 1);
      if (options?.children) {
        all.find((block) => block.uuid === target)?.children.push(moved);
        return undefined;
      }
      const targetParent = all.find((block) =>
        block.children.some(
          (child) => (child as { uuid: string }).uuid === target,
        ),
      );
      const at = targetParent?.children.findIndex(
        (child) => (child as { uuid: string }).uuid === target,
      );
      if (targetParent && at !== undefined) {
        targetParent.children.splice(at + 1, 0, moved);
      }
      return undefined;
    };
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    });

    const duplicated = await repository.duplicateRecipe(fake.root.uuid);

    expect(
      duplicated.ingredients.map((i) => [i.rawText, i.group?.title ?? null]),
    ).toEqual([
      ["200 g flour", "For the dough:"],
      ["2 eggs", null],
      ["1 cup flour", null],
    ]);
    expect(duplicated.steps[0].children?.map((child) => child.text)).toEqual([
      "Until golden.",
    ]);
  });

  it("keeps the lines under an ingredient and a step note nested as written", async () => {
    const fake = fakeHost();
    // Unmeasured, with a note under its note: copied flat, it would read
    // back as a group heading over two ingredients.
    fake.ingredient1.title = "Salt to taste";
    fake.ingredient1.children.push({
      id: 510,
      uuid: "salt-note",
      title: "preferably flaky",
      children: [
        { id: 511, uuid: "salt-subnote", title: "or kosher", children: [] },
      ],
    });
    fake.root.children[1].children[0].children.push({
      id: 512,
      uuid: "step-note",
      title: "Until golden.",
      children: [
        {
          id: 513,
          uuid: "step-subnote",
          title: "About 12 minutes in a small oven.",
          children: [],
        },
      ],
    });
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    });

    const duplicated = await repository.duplicateRecipe(fake.root.uuid);

    expect(
      duplicated.ingredients.map((i) => [i.rawText, i.group, i.details]),
    ).toEqual([
      ["Salt to taste", undefined, ["preferably flaky", "or kosher"]],
      ["1 cup flour", undefined, undefined],
    ]);
    const step = (await fake.host.editor.getBlock(
      duplicated.steps[0].id,
    )) as FakeBlock;
    expect(
      step.children.map((note) => [
        note.title,
        note.children.map((line) => line.title),
      ]),
    ).toEqual([["Until golden.", ["About 12 minutes in a small oven."]]]);
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
      schemaCapabilities: { coverReference: "asset-path" },
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
    fake.addActiveRecipe("COOKIE (copy)");
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    });

    const duplicated = await repository.duplicateRecipe(fake.root.uuid);

    expect(duplicated.title).toBe("Cookie (copy 2)");
  });

  it("reserves an archived recipe title when duplicating", async () => {
    const fake = fakeHost();
    fake.addArchivedRecipe("Cookie (copy)");
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    });

    expect((await repository.duplicateRecipe(fake.root.uuid)).title).toBe(
      "Cookie (copy 2)",
    );
  });

  it("ignores an unrelated page when choosing a duplicate title", async () => {
    const fake = fakeHost();
    fake.pagesByTitle.set("Cookie (copy)", {
      id: 1,
      uuid: "unrelated-page",
      title: "Cookie (copy)",
      children: [],
    });
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    });

    expect((await repository.duplicateRecipe(fake.root.uuid)).title).toBe(
      "Cookie (copy)",
    );
  });

  it("refuses renaming a recipe to another recipe's title, but keeps its own", async () => {
    const fake = fakeHost();
    fake.addActiveRecipe("Pasta");
    fake.addArchivedRecipe("Old Pie");
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    });

    await expect(
      repository.validateRename(fake.root.uuid, "pasta"),
    ).rejects.toMatchObject({ code: "title-taken", detail: "pasta" });
    await expect(
      repository.validateRename(fake.root.uuid, "OLD PIE"),
    ).rejects.toMatchObject({ code: "title-taken" });
    await expect(
      repository.validateRename(fake.root.uuid, "cookie"),
    ).resolves.toBeUndefined();
  });

  it("rejects creating another active recipe with the same title", async () => {
    const fake = fakeHost();
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    });

    await expect(
      repository.createRecipe({
        title: " cookie ",
        baseYield: 8,
        locale: "en",
      }),
    ).rejects.toThrow(/already exists/i);
    expect(fake.createPageCalls).toHaveLength(0);
  });

  it("rejects creating a recipe with an archived title", async () => {
    const fake = fakeHost();
    fake.addArchivedRecipe("Soup");
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    });

    await expect(
      repository.createRecipe({ title: " soup ", baseYield: 4, locale: "en" }),
    ).rejects.toThrow(/already exists/i);
    expect(fake.createPageCalls).toHaveLength(0);
  });

  it("keeps a failed duplicate undiscoverable and preserves the original error", async () => {
    const fake = fakeHost();
    const failure = new Error("Could not copy a step");
    const insertBlock = fake.host.editor.insertBlock;
    fake.host.editor.insertBlock = async (parentId, content) => {
      if (content === "Bake for 10 minutes.") throw failure;
      return insertBlock(parentId, content);
    };
    const repository = createDraftRecipeRepository(fake.host, {
      settings,
      schemaCapabilities: { coverReference: "asset-path" },
    });

    await expect(repository.duplicateRecipe(fake.root.uuid)).rejects.toBe(
      failure,
    );

    const library = fake.pagesByTitle.get("Recipe Library");
    const copy = library?.children[0]?.children[0];
    expect(copy?.title).toBe("Cookie (copy)");
    expect(fake.properties.get(`${copy?.uuid}:recipe_marker`)).toBeUndefined();
    expect(fake.properties.get(`${fake.root.uuid}:recipe_marker`)).toBe(true);
    expect(
      (await repository.listRecipeSummaries()).map((recipe) => recipe.title),
    ).toEqual(["Cookie"]);
  });
});
