import { describe, expect, it, vi } from "vitest";
import { decodeIngredientMeta } from "../../src/application/ingredient-meta";
import { createLogseqRecipeRepository } from "../../src/logseq/logseq-recipe-repository";
import { PROPERTY_KEYS } from "../../src/logseq/property-keys";

const ROOT_TEMPLATE = {
  id: 1,
  uuid: "recipe-1",
  title: "Cookie",
  children: [
    {
      id: 2,
      uuid: "ingredients-section",
      title: "Malzemeler",
      children: [
        { id: 3, uuid: "ingredient-1", title: "120 g tereyağı", children: [] },
        { id: 4, uuid: "ingredient-2", title: "2 yumurta", children: [] },
      ],
    },
    {
      id: 5,
      uuid: "steps-section",
      title: "Yapılış",
      children: [
        {
          id: 6,
          uuid: "step-1",
          title: "180°C'de 10-12 dakika pişir.",
          children: [],
        },
      ],
    },
    {
      id: 7,
      uuid: "notes-section",
      title: "Notlar",
      children: [
        { id: 8, uuid: "note-1", title: "Ilık servis et.", children: [] },
      ],
    },
  ],
};

type ChangePayload = { blocks?: unknown[]; txData?: unknown[] };

function recipeMeta(
  parserLocale = "tr",
  sourceMeasurementSystem = "metric",
): string {
  return JSON.stringify({
    categories: ["Tatlı"],
    tags: ["Chocolate"],
    parserLocale,
    sourceMeasurementSystem,
    ingredientConversionOverrides: [],
  });
}

function fakeHost() {
  const tree = structuredClone(ROOT_TEMPLATE);
  const values = new Map<string, unknown>([
    ["recipe-1:recipe_marker", true],
    ["recipe-1:base_yield", 8],
    ["recipe-1:yield_unit", "cookies"],
    ["recipe-1:schema_version", 1],
    ["recipe-1:recipe_meta", recipeMeta()],
    ["ingredients-section:section_role", "ingredients"],
    ["steps-section:section_role", "steps"],
    ["notes-section:section_role", "notes"],
  ]);
  const writes: Array<{ id: string; key: string; value: unknown }> = [];
  const blockUpdates: Array<{ id: string; content: string }> = [];
  const blockRemovals: string[] = [];
  const insertedBlocks: Array<{ parentId: string; content: string }> = [];
  const pageRenames: Array<{ from: string; to: string }> = [];
  const pageDeletions: string[] = [];
  let pageEntity: unknown = null;

  return {
    tree,
    values,
    writes,
    blockUpdates,
    blockRemovals,
    insertedBlocks,
    pageRenames,
    pageDeletions,
    setPageEntity(entity: unknown) {
      pageEntity = entity;
    },
    editor: {
      getBlock: async (id: string) => (id === "recipe-1" ? tree : null),
      getPage: async (_id: string) => pageEntity,
      getPageBlocksTree: async (_id: string) => [] as unknown[],
      getBlockProperty: async (id: string, key: string) =>
        values.get(`${id}:${key}`),
      upsertBlockProperty: async (id: string, key: string, value: unknown) => {
        writes.push({ id, key, value });
        values.set(`${id}:${key}`, value);
      },
      getProperty: async (_key: string) => ({
        ident: ":plugin.property.lockstack-recipe/recipe_marker",
      }),
      updateBlock: async (id: string, content: string) => {
        blockUpdates.push({ id, content });
      },
      removeBlock: async (id: string) => {
        blockRemovals.push(id);
      },
      insertBlock: async (parentId: string, content: string) => {
        insertedBlocks.push({ parentId, content });
        return {
          id: 99,
          uuid: `new-${insertedBlocks.length}`,
          title: content,
        };
      },
      renamePage: async (from: string, to: string) => {
        pageRenames.push({ from, to });
      },
      deletePage: async (name: string) => {
        pageDeletions.push(name);
      },
    },
    db: {
      datascriptQuery: async (_query: string) => [
        [{ id: 1, uuid: "recipe-1", title: "Cookie" }],
      ],
      onChanged: (_callback: (payload: ChangePayload) => void) => () =>
        undefined,
    },
    app: {
      getUserConfigs: async () => ({ preferredLanguage: "tr" }),
    },
  };
}

function repositoryFor(host: ReturnType<typeof fakeHost>) {
  return createLogseqRecipeRepository(host as never, {
    settings: {
      uiLanguage: "tr",
      defaultParserLocale: "auto",
      defaultMeasurementSystem: "metric",
    },
  });
}

describe("Logseq recipe repository", () => {
  it("loads readable block text and persists canonical ingredient metadata", async () => {
    const host = fakeHost();
    const repository = repositoryFor(host);

    const recipe = await repository.getRecipe("recipe-1");
    expect(recipe?.title).toBe("Cookie");
    expect(recipe?.ingredients[0]).toMatchObject({
      rawText: "120 g tereyağı",
      ingredientText: "tereyağı",
      unit: "g",
      amount: { kind: "exact", value: 120 },
    });
    expect(recipe?.steps[0].temperatures[0]).toMatchObject({
      value: 180,
      unit: "celsius",
    });
    expect(recipe?.steps[0].durations[0].value).toEqual({
      kind: "range",
      min: 10,
      max: 12,
    });
    expect(recipe?.notes).toEqual([{ id: "note-1", text: "Ilık servis et." }]);

    const ingredientWrites = host.writes.filter(
      (write) => write.key === "ingredient_meta",
    );
    expect(ingredientWrites).toHaveLength(2);
    expect(
      decodeIngredientMeta(host.values.get("ingredient-1:ingredient_meta"))
        ?.parsed,
    ).toMatchObject({
      rawText: "120 g tereyağı",
      amount: { kind: "exact", value: 120 },
      unit: "g",
      ingredientText: "tereyağı",
    });

    await repository.getRecipe("recipe-1");
    expect(
      host.writes.filter((write) => write.key === "ingredient_meta"),
    ).toHaveLength(2);
  });

  it("excludes a ref-property's own hidden value-carrier block from a section's content (e.g. section_role's own value block)", async () => {
    const host = fakeHost();
    host.tree.children[0].children.push({
      id: 98,
      uuid: "ingredients-section-value-block",
      title: "ingredients",
      "created-from-property": { id: 209 },
      children: [],
    } as never);
    const repository = repositoryFor(host);

    const recipe = await repository.getRecipe("recipe-1");

    expect(recipe?.ingredients).toHaveLength(2);
    expect(
      recipe?.ingredients.some(
        (ingredient) => ingredient.id === "ingredients-section-value-block",
      ),
    ).toBe(false);
  });

  it("excludes a nested/duplicate section marker from a section's content, even if its own text collides with the section name", async () => {
    const host = fakeHost();
    host.tree.children[0].children.push({
      id: 99,
      uuid: "duplicate-ingredients-marker",
      title: "ingredients",
      children: [],
    });
    host.values.set("duplicate-ingredients-marker:section_role", "ingredients");
    const repository = repositoryFor(host);

    const recipe = await repository.getRecipe("recipe-1");

    expect(recipe?.ingredients).toHaveLength(2);
    expect(
      recipe?.ingredients.some(
        (ingredient) => ingredient.id === "duplicate-ingredients-marker",
      ),
    ).toBe(false);
  });

  it("reparses and replaces canonical metadata after a visible ingredient edit", async () => {
    const host = fakeHost();
    const repository = repositoryFor(host);
    await repository.getRecipe("recipe-1");

    host.tree.children[0].children[0].title = "150 g tereyağı";
    const recipe = await repository.getRecipe("recipe-1");

    expect(recipe?.ingredients[0].amount).toEqual({
      kind: "exact",
      value: 150,
    });
    expect(
      decodeIngredientMeta(host.values.get("ingredient-1:ingredient_meta"))
        ?.parsed.amount,
    ).toEqual({ kind: "exact", value: 150 });
  });

  it("replaces an old confident amount with unparsed metadata when visible text becomes qualitative", async () => {
    const host = fakeHost();
    const repository = repositoryFor(host);
    await repository.getRecipe("recipe-1");

    host.tree.children[0].children[0].title = "damak zevkine göre tereyağı";
    const recipe = await repository.getRecipe("recipe-1");
    const stored = decodeIngredientMeta(
      host.values.get("ingredient-1:ingredient_meta"),
    );

    expect(recipe?.ingredients[0].amount).toBeUndefined();
    expect(recipe?.ingredients[0].rawText).toBe("damak zevkine göre tereyağı");
    expect(stored?.parsed.amount).toBeUndefined();
    expect(stored?.parsed.confidence).toBe("unparsed");
    expect(stored?.parsed.rawText).toBe("damak zevkine göre tereyağı");
  });

  it("invalidates stored metadata when source measurement system changes", async () => {
    const host = fakeHost();
    host.tree.children[0].children[0].title = "1 cup flour";
    host.values.set("recipe-1:recipe_meta", recipeMeta("en", "us"));
    const repository = repositoryFor(host);

    const usRecipe = await repository.getRecipe("recipe-1");
    expect(usRecipe?.ingredients[0].unit).toBe("cup_us");
    expect(
      decodeIngredientMeta(host.values.get("ingredient-1:ingredient_meta"))
        ?.sourceMeasurementSystem,
    ).toBe("us");

    host.values.set("recipe-1:recipe_meta", recipeMeta("en", "metric"));
    const metricRecipe = await repository.getRecipe("recipe-1");
    const stored = decodeIngredientMeta(
      host.values.get("ingredient-1:ingredient_meta"),
    );

    expect(metricRecipe?.ingredients[0].unit).toBe("cup_metric");
    expect(stored?.sourceMeasurementSystem).toBe("metric");
    expect(stored?.parsed.unit).toBe("cup_metric");
  });

  it("does not bulk-write ingredient metadata while merely browsing summaries", async () => {
    const host = fakeHost();
    const repository = repositoryFor(host);

    const summaries = await repository.listRecipeSummaries();
    expect(summaries).toHaveLength(1);
    expect(
      host.writes.filter((write) => write.key === "ingredient_meta"),
    ).toEqual([]);
  });

  it("does not synchronize ingredient metadata while validating a future schema", async () => {
    const host = fakeHost();
    host.values.set("recipe-1:schema_version", 99);
    const repository = repositoryFor(host);

    const result = await repository.validateRecipe("recipe-1");

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "future-schema" }),
    );
    expect(
      host.writes.filter((write) => write.key === "ingredient_meta"),
    ).toEqual([]);
  });

  it("loads page-root recipes through the public page tree API", async () => {
    const host = fakeHost();
    let pageTreeCalls = 0;
    host.editor.getBlock = async () => null;
    host.editor.getPage = async (id: string) =>
      id === "recipe-1"
        ? { id: host.tree.id, uuid: host.tree.uuid, name: host.tree.title }
        : null;
    host.editor.getPageBlocksTree = async (id: string) => {
      if (id !== "recipe-1") return [];
      pageTreeCalls += 1;
      return host.tree.children;
    };

    const repository = repositoryFor(host);
    const recipe = await repository.getRecipe("recipe-1");
    expect(pageTreeCalls).toBe(1);
    expect(recipe?.title).toBe("Cookie");
    expect(recipe?.ingredients).toHaveLength(2);
    expect(recipe?.steps).toHaveLength(1);
    expect(recipe?.notes).toEqual([{ id: "note-1", text: "Ilık servis et." }]);
  });

  it("refreshes when a newly created block has a known recipe parent", async () => {
    const host = fakeHost();
    let onChanged: ((payload: ChangePayload) => void) | undefined;
    host.db.onChanged = (callback: (payload: ChangePayload) => void) => {
      onChanged = callback;
      return () => undefined;
    };

    const repository = repositoryFor(host);
    await repository.getRecipe("recipe-1");

    const listener = vi.fn();
    repository.watchRecipe("recipe-1", listener);
    onChanged?.({
      blocks: [
        {
          id: 99,
          uuid: "new-ingredient",
          parent: { id: 2 },
          title: "50 g kakao",
        },
      ],
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("refreshes when a known recipe entity is removed and only txData remains", async () => {
    const host = fakeHost();
    let onChanged: ((payload: ChangePayload) => void) | undefined;
    host.db.onChanged = (callback: (payload: ChangePayload) => void) => {
      onChanged = callback;
      return () => undefined;
    };

    const repository = repositoryFor(host);
    await repository.getRecipe("recipe-1");

    const listener = vi.fn();
    repository.watchRecipe("recipe-1", listener);
    onChanged?.({
      blocks: [],
      txData: [[3, ":block/title", "120 g tereyağı", 100, false]],
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("refreshes when txData adds a new child under a known recipe parent", async () => {
    const host = fakeHost();
    let onChanged: ((payload: ChangePayload) => void) | undefined;
    host.db.onChanged = (callback: (payload: ChangePayload) => void) => {
      onChanged = callback;
      return () => undefined;
    };

    const repository = repositoryFor(host);
    await repository.getRecipe("recipe-1");

    const listener = vi.fn();
    repository.watchRecipe("recipe-1", listener);
    onChanged?.({
      blocks: [],
      txData: [[99, ":block/parent", 2, 101, true]],
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("discovers active recipes through the hidden marker property", async () => {
    const host = fakeHost();
    let query = "";
    host.db.datascriptQuery = async (value: string) => {
      query = value;
      return [[{ id: 1, uuid: "recipe-1", title: "Cookie" }]];
    };

    const repository = repositoryFor(host);
    const summaries = await repository.listRecipeSummaries();
    expect(summaries).toHaveLength(1);
    expect(query).toContain(":plugin.property.lockstack-recipe/recipe_marker");
    expect(query).toContain(":logseq.property/deleted-at");
    expect(query).toContain("(not");
    expect(query.toLowerCase()).not.toContain("cookie");
  });

  describe("discovery against a modeled real Datascript representation", () => {
    const MARKER_IDENT = ":plugin.property.lockstack-recipe/recipe_marker";

    interface FakeDatom {
      entity: string;
      attr: string;
    }

    interface FakeEntity {
      id: number;
      uuid: string;
      title: string;
    }

    // A tiny, targeted evaluator for the exact discovery query shape this
    // repository emits - not a general Datalog engine. It only proves the
    // *matching semantics* the production query relies on: presence of the
    // marker attribute (any value, since the query no longer requires a
    // literal `true`) and exclusion via `(not [?r :logseq.property/deleted-at
    // _])`. This is what a hand-rolled `datascriptQuery` mock that always
    // returns a canned row can never catch.
    function evaluateDiscoveryQuery(
      query: string,
      entities: readonly FakeEntity[],
      datoms: readonly FakeDatom[],
    ): FakeEntity[][] {
      const markerClause = query.match(/\[\?r (\S+) \?marker\]/);
      if (!markerClause) {
        throw new Error(`Query does not bind a marker attribute: ${query}`);
      }
      const attr = markerClause[1];
      expect(query).toContain("(not [?r :logseq.property/deleted-at _])");

      const deleted = new Set(
        datoms
          .filter((d) => d.attr === ":logseq.property/deleted-at")
          .map((d) => d.entity),
      );
      const marked = new Set(
        datoms.filter((d) => d.attr === attr).map((d) => d.entity),
      );

      return entities
        .filter(
          (entity) => marked.has(entity.uuid) && !deleted.has(entity.uuid),
        )
        .map((entity) => [
          { id: entity.id, uuid: entity.uuid, title: entity.title },
        ]);
    }

    function fakeHostWithGraph(
      entities: readonly FakeEntity[],
      datoms: readonly FakeDatom[],
      blockPropertyValues: ReadonlyMap<string, unknown>,
    ) {
      const host = fakeHost();
      host.editor.getBlock = async (id: string) => {
        const entity = entities.find((e) => e.uuid === id);
        return entity
          ? {
              id: entity.id,
              uuid: entity.uuid,
              title: entity.title,
              children: [],
            }
          : null;
      };
      host.editor.getBlockProperty = async (id: string, key: string) => {
        if (key === PROPERTY_KEYS.recipeMarker) {
          return blockPropertyValues.get(id);
        }
        return host.values.get(`${id}:${key}`);
      };
      host.db.datascriptQuery = async (query: string) =>
        evaluateDiscoveryQuery(query, entities, datoms);
      return host;
    }

    it("finds a newly created recipe via presence of the marker attribute", async () => {
      const host = fakeHostWithGraph(
        [{ id: 1, uuid: "recipe-1", title: "Cookie" }],
        [{ entity: "recipe-1", attr: MARKER_IDENT }],
        new Map([["recipe-1", true]]),
      );
      const repository = repositoryFor(host);

      const summaries = await repository.listRecipeSummaries();
      expect(summaries.map((s) => s.id)).toEqual(["recipe-1"]);
    });

    it("finds a converted recipe alongside a created one, and lists both on reopen", async () => {
      const host = fakeHostWithGraph(
        [
          { id: 1, uuid: "recipe-1", title: "Cookie" },
          { id: 9, uuid: "recipe-2", title: "Soup" },
        ],
        [
          { entity: "recipe-1", attr: MARKER_IDENT },
          { entity: "recipe-2", attr: MARKER_IDENT },
        ],
        new Map([
          ["recipe-1", true],
          ["recipe-2", true],
        ]),
      );
      const repository = repositoryFor(host);

      const first = await repository.listRecipeSummaries();
      const second = await repository.listRecipeSummaries();
      expect(first.map((s) => s.id).sort()).toEqual(["recipe-1", "recipe-2"]);
      expect(second.map((s) => s.id).sort()).toEqual(["recipe-1", "recipe-2"]);
    });

    it("excludes a recycled/deleted recipe even though the marker attribute is still present", async () => {
      const host = fakeHostWithGraph(
        [
          { id: 1, uuid: "recipe-1", title: "Cookie" },
          { id: 2, uuid: "recipe-2", title: "Old soup" },
        ],
        [
          { entity: "recipe-1", attr: MARKER_IDENT },
          { entity: "recipe-2", attr: MARKER_IDENT },
          { entity: "recipe-2", attr: ":logseq.property/deleted-at" },
        ],
        new Map([
          ["recipe-1", true],
          ["recipe-2", true],
        ]),
      );
      const repository = repositoryFor(host);

      const summaries = await repository.listRecipeSummaries();
      expect(summaries.map((s) => s.id)).toEqual(["recipe-1"]);
    });

    it("still discovers a recipe when the marker value round-trips as a wrapped property-value entity rather than a bare boolean", async () => {
      const host = fakeHostWithGraph(
        [{ id: 1, uuid: "recipe-1", title: "Cookie" }],
        [{ entity: "recipe-1", attr: MARKER_IDENT }],
        new Map([["recipe-1", { value: true }]]),
      );
      const repository = repositoryFor(host);

      const summaries = await repository.listRecipeSummaries();
      expect(summaries.map((s) => s.id)).toEqual(["recipe-1"]);
    });

    it("does not surface a page whose marker property reads back as explicitly false", async () => {
      const host = fakeHostWithGraph(
        [{ id: 1, uuid: "recipe-1", title: "Not a recipe" }],
        [{ entity: "recipe-1", attr: MARKER_IDENT }],
        new Map([["recipe-1", false]]),
      );
      const repository = repositoryFor(host);

      const summaries = await repository.listRecipeSummaries();
      expect(summaries).toEqual([]);
    });
  });

  describe("content editing and delete", () => {
    it("renames a block-root recipe via updateBlock, never renamePage", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.renameRecipe("recipe-1", "  New Title  ");

      expect(host.blockUpdates).toEqual([
        { id: "recipe-1", content: "New Title" },
      ]);
      expect(host.pageRenames).toEqual([]);
    });

    it("renames a page-root recipe via renamePage, never updateBlock", async () => {
      const host = fakeHost();
      host.setPageEntity({ originalName: "Cookie" });
      const repository = repositoryFor(host);

      await repository.renameRecipe("recipe-1", "New Title");

      expect(host.pageRenames).toEqual([{ from: "Cookie", to: "New Title" }]);
      expect(host.blockUpdates).toEqual([]);
    });

    it("rejects a blank rename", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);
      await expect(
        repository.renameRecipe("recipe-1", "   "),
      ).rejects.toThrow();
    });

    it("writes base yield and yield unit as separate optional property updates", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.updateRecipeYield("recipe-1", {
        baseYield: 12,
        yieldUnit: "muffins",
      });

      expect(host.writes).toContainEqual({
        id: "recipe-1",
        key: "base_yield",
        value: 12,
      });
      expect(host.writes).toContainEqual({
        id: "recipe-1",
        key: "yield_unit",
        value: "muffins",
      });
    });

    it("rejects a non-positive base yield", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);
      await expect(
        repository.updateRecipeYield("recipe-1", { baseYield: 0 }),
      ).rejects.toThrow();
    });

    it("appends a new item under the resolved section block", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      const newId = await repository.addSectionItem(
        "recipe-1",
        "ingredients",
        "  250 ml milk  ",
      );

      expect(host.insertedBlocks).toEqual([
        { parentId: "ingredients-section", content: "250 ml milk" },
      ]);
      expect(newId).toBe("new-1");
    });

    it("rejects an empty added item without inserting a block", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);
      await expect(
        repository.addSectionItem("recipe-1", "steps", "   "),
      ).rejects.toThrow();
      expect(host.insertedBlocks).toEqual([]);
    });

    it("updates an existing item's block content directly by id", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.updateSectionItem("ingredient-1", "  130 g butter  ");

      expect(host.blockUpdates).toEqual([
        { id: "ingredient-1", content: "130 g butter" },
      ]);
    });

    it("removes an item's block directly by id", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.removeSectionItem("ingredient-2");

      expect(host.blockRemovals).toEqual(["ingredient-2"]);
    });

    it("deletes a block-root recipe via removeBlock, never deletePage", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.deleteRecipe("recipe-1");

      expect(host.blockRemovals).toEqual(["recipe-1"]);
      expect(host.pageDeletions).toEqual([]);
    });

    it("deletes a page-root recipe via deletePage, never removeBlock", async () => {
      const host = fakeHost();
      host.setPageEntity({ originalName: "Cookie" });
      const repository = repositoryFor(host);

      await repository.deleteRecipe("recipe-1");

      expect(host.pageDeletions).toEqual(["Cookie"]);
      expect(host.blockRemovals).toEqual([]);
    });
  });
});
