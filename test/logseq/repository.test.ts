import { afterEach, describe, expect, it, vi } from "vitest";
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
  const propertyRemovals: Array<{ id: string; key: string }> = [];
  const propertyReads: Array<{ id: string; key: string }> = [];
  const insertedBlocks: Array<{ parentId: string; content: string }> = [];
  const movedBlocks: Array<{
    srcBlock: string;
    targetBlock: string;
    before?: boolean;
  }> = [];
  const pageRenames: Array<{ from: string; to: string }> = [];
  const pageDeletions: string[] = [];
  const libraryMoves: Array<[string, string, { children: true }]> = [];
  let pageEntity: unknown = null;
  const otherPagesByTitle = new Map<string, unknown>();

  return {
    tree,
    values,
    writes,
    blockUpdates,
    blockRemovals,
    propertyRemovals,
    propertyReads,
    insertedBlocks,
    movedBlocks,
    pageRenames,
    pageDeletions,
    libraryMoves,
    setPageEntity(entity: unknown) {
      pageEntity = entity;
    },
    setOtherPage(title: string, entity: unknown) {
      otherPagesByTitle.set(title, entity);
    },
    editor: {
      getBlock: async (id: string) => (id === "recipe-1" ? tree : null),
      getPage: async (id: string) =>
        id === "Recipe Library"
          ? { uuid: "library-page", name: id }
          : (otherPagesByTitle.get(id) ?? pageEntity),
      getPageBlocksTree: async (id: string) =>
        id === "Recipe Library"
          ? [
              { id: 90, uuid: "recipes-section", title: "Recipes" },
              { id: 91, uuid: "archived-section", title: "Archived" },
            ]
          : ([] as unknown[]),
      getBlockProperty: async (id: string, key: string) => {
        propertyReads.push({ id, key });
        return values.get(`${id}:${key}`);
      },
      upsertBlockProperty: async (id: string, key: string, value: unknown) => {
        writes.push({ id, key, value });
        values.set(`${id}:${key}`, value);
      },
      removeBlockProperty: async (id: string, key: string) => {
        propertyRemovals.push({ id, key });
        values.delete(`${id}:${key}`);
      },
      getProperty: async (key: string) => ({
        ident: `:plugin.property.logseq-recipe/${key}`,
      }),
      isPageBlock: (entity: unknown) =>
        entity != null &&
        typeof entity === "object" &&
        (entity as { uuid?: string }).uuid === "recipe-1" &&
        pageEntity != null &&
        typeof pageEntity === "object" &&
        (pageEntity as { uuid?: string }).uuid === "recipe-1",
      createPage: async (_title: string) => undefined,
      restorePage: async (_title: string) => undefined,
      appendBlockInPage: async (_page: string, _title: string) => undefined,
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
      moveBlock: async (
        srcBlock: string,
        targetBlock: string,
        options?: { before?: boolean; children?: boolean },
      ) => {
        if (options?.children) {
          libraryMoves.push([srcBlock, targetBlock, { children: true }]);
          return;
        }
        movedBlocks.push({
          srcBlock,
          targetBlock,
          before: options?.before,
        });
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
  afterEach(() => vi.useRealTimers());
  it("loads a block-rooted recipe even when getPage answers for a plain block uuid", async () => {
    // Real DB-graph behavior, which the default fake host never modeled:
    // getPage() does not return null for a plain block's uuid, and
    // getPageBlocksTree() then answers with the containing page's
    // top-level blocks instead of that block's own children. Asking page
    // first and trusting it loaded the recipe with no sections at all -
    // zero ingredients, zero steps - while its root properties, read
    // directly by uuid, all still looked correct. That is exactly the
    // "Convert preview shows 9 ingredients, the recipe card then shows
    // none" report.
    const host = fakeHost();
    host.setPageEntity({
      id: 1,
      uuid: "some-journal-page",
      name: "Sep 21st, 2026",
    });
    host.editor.getPageBlocksTree = async () => [
      {
        id: 50,
        uuid: "unrelated-journal-note",
        title: "Dentist at 3",
        children: [],
      },
    ];
    const repository = repositoryFor(host);

    const recipe = await repository.getRecipe("recipe-1");

    expect(recipe?.title).toBe("Cookie");
    expect(recipe?.ingredients).toHaveLength(2);
    expect(recipe?.steps).toHaveLength(1);
  });

  it("finds Turkish step durations in a recipe pinned to English", async () => {
    const host = fakeHost();
    host.values.set("recipe-1:recipe_meta", recipeMeta("en"));

    const recipe = await repositoryFor(host).getRecipe("recipe-1");

    expect(recipe?.steps[0].durations[0]).toMatchObject({
      value: { kind: "range", min: 10, max: 12 },
      unit: "minute",
    });
  });

  it("reads step child blocks as notes and graph-local media", async () => {
    const host = fakeHost();
    const steps = host.tree.children.find(
      (child) => child.uuid === "steps-section",
    ) as { children: Array<{ children: unknown[] }> };
    steps.children[0].children = [
      { id: 60, uuid: "step-note", title: "Keep the lid on." },
      { id: 61, uuid: "step-photo", title: "![done](../assets/done.png)" },
      { id: 62, uuid: "step-link", title: "![x](https://example.com/x.png)" },
    ];

    const recipe = await repositoryFor(host).getRecipe("recipe-1");

    expect(recipe?.steps[0].children).toEqual([
      { id: "step-note", kind: "note", text: "Keep the lid on." },
      {
        id: "step-photo",
        kind: "image",
        text: "![done](../assets/done.png)",
        path: "assets/done.png",
        alt: "done",
      },
      {
        id: "step-link",
        kind: "note",
        text: "![x](https://example.com/x.png)",
      },
    ]);
  });

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

  it("reads sibling section roles concurrently", async () => {
    const host = fakeHost();
    const originalGetBlockProperty = host.editor.getBlockProperty;
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    host.editor.getBlockProperty = async (id: string, key: string) => {
      if (key === "section_role" && id.endsWith("-section")) {
        started.push(id);
        await gate;
      }
      return originalGetBlockProperty(id, key);
    };

    const loading = repositoryFor(host).getRecipe("recipe-1");
    await vi.waitUntil(() => started.length > 0);
    try {
      expect(started).toEqual([
        "ingredients-section",
        "steps-section",
        "notes-section",
      ]);
    } finally {
      release();
      await loading;
    }
  });

  it("reads ingredient metadata and scale modes concurrently", async () => {
    const host = fakeHost();
    const originalGetBlockProperty = host.editor.getBlockProperty;
    const metadataReads: string[] = [];
    const scaleReads: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    host.editor.getBlockProperty = async (id: string, key: string) => {
      if (key === "ingredient_meta") {
        metadataReads.push(id);
        await gate;
      }
      if (key === "scale_mode") scaleReads.push(id);
      return originalGetBlockProperty(id, key);
    };

    const loading = repositoryFor(host).getRecipe("recipe-1");
    await vi.waitUntil(() => metadataReads.length === 2);
    try {
      expect(scaleReads).toEqual(["ingredient-1", "ingredient-2"]);
    } finally {
      release();
      await loading;
    }
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

  it("skips the per-ingredient metadata/scale-mode property reads entirely for a summary - it only needs ingredientText", async () => {
    const host = fakeHost();
    const repository = repositoryFor(host);

    const summaries = await repository.listRecipeSummaries();

    expect(summaries[0].ingredientTexts).toEqual(["tereyağı", "yumurta"]);
    expect(
      host.propertyReads.filter(
        (read) => read.key === "ingredient_meta" || read.key === "scale_mode",
      ),
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

  it("keeps an empty archived block's identity when getPage returns its containing library page", async () => {
    const host = fakeHost();
    host.tree.title = "Empty archived recipe";
    host.tree.children = [];
    host.values.delete("recipe-1:recipe_marker");
    host.values.set("recipe-1:recipe_archived", true);
    host.values.set("recipes-section:recipe_library_section", "recipes");
    host.values.set("archived-section:recipe_library_section", "archived");
    host.setPageEntity({
      id: 50,
      uuid: "library-page",
      name: "Recipe Library",
    });
    const originalGetPageBlocksTree = host.editor.getPageBlocksTree;
    host.editor.getPageBlocksTree = async (id: string) =>
      id === "recipe-1"
        ? [{ id: 60, uuid: "unrelated", title: "Another recipe", children: [] }]
        : originalGetPageBlocksTree(id);
    const repository = repositoryFor(host);

    expect(await repository.getRecipe("recipe-1")).toMatchObject({
      id: "recipe-1",
      title: "Empty archived recipe",
    });
    const archived = await repository.listArchivedRecipeSummaries();
    expect(archived).toEqual([
      expect.objectContaining({
        id: "recipe-1",
        title: "Empty archived recipe",
      }),
    ]);

    await repository.restoreRecipe(archived[0].id);
    expect(host.libraryMoves).toContainEqual([
      "recipe-1",
      "recipes-section",
      { children: true },
    ]);
    expect(
      (await repository.listRecipeSummaries()).map((recipe) => recipe.id),
    ).toEqual(["recipe-1"]);
  });

  describe("summary cache", () => {
    function countingHost() {
      const host = fakeHost();
      const listeners: Array<(payload: ChangePayload) => void> = [];
      host.db.onChanged = (callback: (payload: ChangePayload) => void) => {
        listeners.push(callback);
        return () => undefined;
      };
      let reads = 0;
      const getBlock = host.editor.getBlock;
      const getBlockProperty = host.editor.getBlockProperty;
      host.editor.getBlock = async (id: string) => {
        reads += 1;
        return getBlock(id);
      };
      host.editor.getBlockProperty = async (id: string, key: string) => {
        reads += 1;
        return getBlockProperty(id, key);
      };
      return {
        host,
        reads: () => reads,
        emit: (payload: ChangePayload) => {
          for (const listener of listeners) listener(payload);
        },
      };
    }

    it("serves a repeat list without re-reading any recipe", async () => {
      const { host, reads } = countingHost();
      const repository = repositoryFor(host);
      await repository.listRecipeSummaries();
      const afterFirst = reads();
      expect(afterFirst).toBeGreaterThan(5);

      await repository.listRecipeSummaries();
      expect(reads()).toBe(afterFirst);
      // A later open of the plugin UI (new repository) shares the cache.
      await repositoryFor(host).listRecipeSummaries();
      expect(reads()).toBe(afterFirst);
    });

    it("reloads only after a change touches the recipe", async () => {
      const { host, reads, emit } = countingHost();
      const repository = repositoryFor(host);
      await repository.listRecipeSummaries();
      const afterFirst = reads();

      emit({ blocks: [{ id: 500, uuid: "unrelated-block" }] });
      await repository.listRecipeSummaries();
      expect(reads()).toBe(afterFirst);

      host.tree.title = "Renamed outside the plugin";
      emit({ blocks: [{ id: 1, uuid: "recipe-1" }] });
      const summaries = await repository.listRecipeSummaries();
      expect(reads()).toBeGreaterThan(afterFirst);
      expect(summaries[0].title).toBe("Renamed outside the plugin");
    });

    it("drops a recipe the plugin archives, without waiting for an event", async () => {
      const { host } = countingHost();
      host.values.set("recipes-section:recipe_library_section", "recipes");
      host.values.set("archived-section:recipe_library_section", "archived");
      const repository = repositoryFor(host);
      expect(await repository.listRecipeSummaries()).toHaveLength(1);

      await repository.archiveRecipe("recipe-1");

      expect(await repository.listRecipeSummaries()).toEqual([]);
    });

    it("re-reads everything on an explicit fresh refresh", async () => {
      const { host, reads } = countingHost();
      const repository = repositoryFor(host);
      await repository.listRecipeSummaries();
      const afterFirst = reads();
      await repository.listRecipeSummaries({ fresh: true });
      expect(reads()).toBe(afterFirst * 2);
    });
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
    expect(query).toContain(":plugin.property.logseq-recipe/recipe_marker");
    expect(query).toContain(":logseq.property/deleted-at");
    expect(query).toContain("(not");
    expect(query.toLowerCase()).not.toContain("cookie");
  });

  describe("discovery against a modeled real Datascript representation", () => {
    const MARKER_IDENT = ":plugin.property.logseq-recipe/recipe_marker";
    const ARCHIVE_IDENT = ":plugin.property.logseq-recipe/recipe_archived";

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

    it("excludes an archived recipe from active discovery even if its active marker remains after a partial write", async () => {
      const host = fakeHostWithGraph(
        [{ id: 1, uuid: "recipe-1", title: "Cookie" }],
        [
          { entity: "recipe-1", attr: MARKER_IDENT },
          { entity: "recipe-1", attr: ARCHIVE_IDENT },
        ],
        new Map([["recipe-1", true]]),
      );
      host.values.set("recipe-1:recipe_archived", true);

      expect(await repositoryFor(host).listRecipeSummaries()).toEqual([]);
    });

    it("discovers an archived recipe even when its timestamp was never written", async () => {
      const host = fakeHostWithGraph(
        [{ id: 1, uuid: "recipe-1", title: "Cookie" }],
        [{ entity: "recipe-1", attr: ARCHIVE_IDENT }],
        new Map(),
      );
      host.values.set("recipe-1:recipe_archived", true);

      expect(await repositoryFor(host).listArchivedRecipeSummaries()).toEqual([
        expect.objectContaining({ id: "recipe-1", title: "Cookie" }),
      ]);
      expect(
        (await repositoryFor(host).listArchivedRecipeSummaries())[0].archivedAt,
      ).toBeUndefined();
    });

    it("keeps archived recipes discoverable with malformed or future timestamps", async () => {
      const host = fakeHostWithGraph(
        [{ id: 1, uuid: "recipe-1", title: "Cookie" }],
        [{ entity: "recipe-1", attr: ARCHIVE_IDENT }],
        new Map(),
      );
      host.values.set("recipe-1:recipe_archived", true);
      host.values.set("recipe-1:recipe_archived_at", "not-a-time");
      const repository = repositoryFor(host);

      expect(
        (await repository.listArchivedRecipeSummaries())[0].archivedAt,
      ).toBeUndefined();
      host.values.set("recipe-1:recipe_archived_at", Date.UTC(2040, 0, 1));
      expect(
        (await repository.listArchivedRecipeSummaries())[0].archivedAt,
      ).toBe(Date.UTC(2040, 0, 1));
    });
  });

  describe("content editing and delete", () => {
    it("renames a block-root recipe via updateBlock, never renamePage", async () => {
      const host = fakeHost();
      host.setPageEntity({
        id: 20,
        uuid: "library-page",
        originalName: "Recipe Library",
      });
      const repository = repositoryFor(host);

      await repository.renameRecipe("recipe-1", "  New Title  ");

      expect(host.blockUpdates).toEqual([
        { id: "recipe-1", content: "New Title" },
      ]);
      expect(host.pageRenames).toEqual([]);
    });

    it("renames a page-root recipe via renamePage, never updateBlock", async () => {
      const host = fakeHost();
      host.setPageEntity({ uuid: "recipe-1", originalName: "Cookie" });
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

    it("rejects renaming a page-root recipe onto a title that already exists", async () => {
      const host = fakeHost();
      host.setPageEntity({ uuid: "recipe-1", originalName: "Cookie" });
      host.setOtherPage("Existing Page", { originalName: "Existing Page" });
      const repository = repositoryFor(host);

      await expect(
        repository.renameRecipe("recipe-1", "Existing Page"),
      ).rejects.toThrow(/already exists/);
      expect(host.pageRenames).toEqual([]);
    });

    it("allows renaming a page-root recipe when the target title is unused", async () => {
      const host = fakeHost();
      host.setPageEntity({ uuid: "recipe-1", originalName: "Cookie" });
      const repository = repositoryFor(host);

      await repository.renameRecipe("recipe-1", "Brand New Title");

      expect(host.pageRenames).toEqual([
        { from: "Cookie", to: "Brand New Title" },
      ]);
    });

    it("writes base yield and yield unit as separate optional property updates", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.updateRecipeFields("recipe-1", {
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
        repository.updateRecipeFields("recipe-1", { baseYield: 0 }),
      ).rejects.toThrow();
    });

    it("writes prep/chill/cook minutes and source url as separate optional updates", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.updateRecipeFields("recipe-1", {
        prepMinutes: 15,
        cookMinutes: 0,
        sourceUrl: "https://example.com/recipe",
      });

      expect(host.writes).toContainEqual({
        id: "recipe-1",
        key: "prep_minutes",
        value: 15,
      });
      expect(host.writes).toContainEqual({
        id: "recipe-1",
        key: "cook_minutes",
        value: 0,
      });
      expect(host.writes).toContainEqual({
        id: "recipe-1",
        key: "source_url",
        value: "https://example.com/recipe",
      });
      expect(host.writes.some((write) => write.key === "chill_minutes")).toBe(
        false,
      );
    });

    it("rejects a negative time field", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);
      await expect(
        repository.updateRecipeFields("recipe-1", { prepMinutes: -5 }),
      ).rejects.toThrow();
    });

    it("writes a per-ingredient scale-mode override", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.setIngredientScaleMode("ingredient-1", "fixed");

      expect(host.writes).toContainEqual({
        id: "ingredient-1",
        key: "scale_mode",
        value: "fixed",
      });
    });

    it("reorders section items by moving each item after its predecessor", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.reorderSectionItems([
        "ingredient-2",
        "ingredient-1",
        "ingredient-3",
      ]);

      expect(host.movedBlocks).toEqual([
        {
          srcBlock: "ingredient-1",
          targetBlock: "ingredient-2",
          before: false,
        },
        {
          srcBlock: "ingredient-3",
          targetBlock: "ingredient-1",
          before: false,
        },
      ]);
    });

    it("does nothing when reordering fewer than two items", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await repository.reorderSectionItems(["ingredient-1"]);

      expect(host.movedBlocks).toEqual([]);
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

    it("archives a block recipe without removing source content", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
      const host = fakeHost();
      host.values.set("recipes-section:recipe_library_section", "recipes");
      host.values.set("archived-section:recipe_library_section", "archived");
      const repository = repositoryFor(host);

      await repository.archiveRecipe("recipe-1");

      expect(host.blockRemovals).toEqual([]);
      expect(host.pageDeletions).toEqual([]);
      expect(host.writes).toEqual(
        expect.arrayContaining([
          { id: "recipe-1", key: "recipe_archived", value: true },
          {
            id: "recipe-1",
            key: "recipe_archived_at",
            value: 1_790_164_800,
          },
        ]),
      );
      expect(host.propertyRemovals).toContainEqual({
        id: "recipe-1",
        key: "recipe_marker",
      });
      expect(host.libraryMoves).toEqual([
        ["recipe-1", "archived-section", { children: true }],
      ]);
    });

    it("starts archive preflight reads concurrently", async () => {
      const host = fakeHost();
      host.values.set("recipes-section:recipe_library_section", "recipes");
      host.values.set("archived-section:recipe_library_section", "archived");
      const originalGetBlock = host.editor.getBlock;
      const originalGetBlockProperty = host.editor.getBlockProperty;
      const started: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      host.editor.getBlock = async (id: string) => {
        started.push("entity");
        await gate;
        return originalGetBlock(id);
      };
      host.editor.getBlockProperty = async (id: string, key: string) => {
        if (id === "recipe-1" && key.startsWith("recipe_archived")) {
          started.push(key);
          await gate;
        }
        return originalGetBlockProperty(id, key);
      };

      const archiving = repositoryFor(host).archiveRecipe("recipe-1");
      while (started.length === 0) await Promise.resolve();
      try {
        expect(started).toEqual([
          "entity",
          "recipe_archived",
          "recipe_archived_at",
        ]);
      } finally {
        release();
        await archiving;
      }
    });

    it("stores archive time as Unix seconds while exposing milliseconds", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
      const host = fakeHost();
      host.values.set("recipes-section:recipe_library_section", "recipes");
      host.values.set("archived-section:recipe_library_section", "archived");
      const repository = repositoryFor(host);

      await repository.archiveRecipe("recipe-1");

      expect(host.values.get("recipe-1:recipe_archived_at")).toBe(
        1_790_164_800,
      );
      expect(
        (await repository.listArchivedRecipeSummaries())[0].archivedAt,
      ).toBe(1_790_164_800_000);
    });

    it("archives a legacy page recipe in place", async () => {
      const host = fakeHost();
      host.setPageEntity({ uuid: "recipe-1", originalName: "Cookie" });
      host.editor.getBlock = async () => null;
      const repository = repositoryFor(host);

      await repository.archiveRecipe("recipe-1");

      expect(host.libraryMoves).toEqual([]);
      expect(host.pageDeletions).toEqual([]);
      expect(host.blockRemovals).toEqual([]);
    });

    it("restores an archived block recipe into the active library section", async () => {
      const host = fakeHost();
      host.values.set("recipe-1:recipe_archived", true);
      host.values.set("recipe-1:recipe_archived_at", 1_790_164_800_000);
      host.values.delete("recipe-1:recipe_marker");
      host.values.set("recipes-section:recipe_library_section", "recipes");
      host.values.set("archived-section:recipe_library_section", "archived");

      await repositoryFor(host).restoreRecipe("recipe-1");

      expect(host.libraryMoves).toEqual([
        ["recipe-1", "recipes-section", { children: true }],
      ]);
      expect(host.writes).toContainEqual({
        id: "recipe-1",
        key: "recipe_marker",
        value: true,
      });
      expect(host.propertyRemovals).toEqual(
        expect.arrayContaining([
          { id: "recipe-1", key: "recipe_archived" },
          { id: "recipe-1", key: "recipe_archived_at" },
        ]),
      );
    });

    it("permanently deletes only archived recipes", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await expect(repository.deleteArchivedRecipe("recipe-1")).rejects.toThrow(
        "not archived",
      );
      expect(host.blockRemovals).toEqual([]);

      host.values.set("recipe-1:recipe_archived", true);
      await repository.deleteArchivedRecipe("recipe-1");
      expect(host.blockRemovals).toEqual(["recipe-1"]);
      expect(host.pageDeletions).toEqual([]);
    });

    it("permanently deletes an archived legacy page recipe's page", async () => {
      const host = fakeHost();
      host.setPageEntity({ uuid: "recipe-1", originalName: "Cookie" });
      host.editor.getBlock = async () => null;
      host.values.set("recipe-1:recipe_archived", true);

      await repositoryFor(host).deleteArchivedRecipe("recipe-1");

      expect(host.pageDeletions).toEqual(["Cookie"]);
      expect(host.blockRemovals).toEqual([]);
    });

    it("keeps the original archive timestamp when retried", async () => {
      const host = fakeHost();
      host.values.set("recipe-1:recipe_archived", true);
      host.values.set("recipe-1:recipe_archived_at", 1_790_164_800_000);
      host.values.set("recipes-section:recipe_library_section", "recipes");
      host.values.set("archived-section:recipe_library_section", "archived");

      await repositoryFor(host).archiveRecipe("recipe-1");

      expect(host.values.get("recipe-1:recipe_archived_at")).toBe(
        1_790_164_800_000,
      );
      expect(host.writes.some(({ key }) => key === "recipe_archived_at")).toBe(
        false,
      );
      expect(host.libraryMoves).toHaveLength(1);
    });

    it("preserves archived discovery and the original error if a move fails", async () => {
      const host = fakeHost();
      host.values.set("recipes-section:recipe_library_section", "recipes");
      host.values.set("archived-section:recipe_library_section", "archived");
      const moveError = new Error("Logseq move failed");
      host.editor.moveBlock = async () => {
        throw moveError;
      };

      await expect(repositoryFor(host).archiveRecipe("recipe-1")).rejects.toBe(
        moveError,
      );
      expect(host.values.get("recipe-1:recipe_archived")).toBe(true);
      expect(host.values.has("recipe-1:recipe_marker")).toBe(false);
      expect(host.blockRemovals).toEqual([]);
      expect(host.pageDeletions).toEqual([]);
    });

    it("leaves an archived recipe recoverable when restore movement fails", async () => {
      const host = fakeHost();
      host.values.set("recipe-1:recipe_archived", true);
      host.values.set("recipe-1:recipe_archived_at", 1_790_164_800_000);
      host.values.delete("recipe-1:recipe_marker");
      host.values.set("recipes-section:recipe_library_section", "recipes");
      host.values.set("archived-section:recipe_library_section", "archived");
      const moveError = new Error("Logseq move failed");
      host.editor.moveBlock = async () => {
        throw moveError;
      };

      await expect(repositoryFor(host).restoreRecipe("recipe-1")).rejects.toBe(
        moveError,
      );
      expect(host.values.get("recipe-1:recipe_archived")).toBe(true);
      expect(host.values.has("recipe-1:recipe_marker")).toBe(false);
    });

    it("does not mutate anything for a missing recipe", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      await expect(repository.archiveRecipe("missing")).rejects.toThrow(
        "Recipe not found: missing",
      );
      await expect(repository.restoreRecipe("missing")).rejects.toThrow(
        "Recipe not found: missing",
      );
      expect(host.writes).toEqual([]);
      expect(host.propertyRemovals).toEqual([]);
      expect(host.libraryMoves).toEqual([]);
    });

    it("does not mark a containing page when a stale block id resolves only to that page", async () => {
      const host = fakeHost();
      host.editor.getBlock = async () => null;
      host.setPageEntity({ uuid: "containing-page", name: "Recipe Library" });

      await expect(
        repositoryFor(host).archiveRecipe("recipe-1"),
      ).rejects.toThrow("Recipe not found: recipe-1");
      expect(host.writes).toEqual([]);
      expect(host.propertyRemovals).toEqual([]);
    });
  });

  describe("root metadata line as source of truth", () => {
    it("prefers a visibly-edited yield line over a stale hidden base_yield property, and refreshes the property", async () => {
      const host = fakeHost();
      host.tree.children.push({
        id: 10,
        uuid: "yield-line",
        title: "Porsiyon: 12",
        children: [],
      });
      // The hidden property is still the old value - as if the user only
      // ever edited the visible line natively in Logseq.
      const repository = repositoryFor(host);

      const recipe = await repository.getRecipe("recipe-1");

      expect(recipe?.baseYield).toBe(12);
      expect(recipe?.yieldUnit).toBeUndefined();
      expect(host.values.get("recipe-1:base_yield")).toBe(12);
      // yield_unit was cleared because the visible line no longer specifies one.
      expect(
        host.propertyRemovals.some(
          (r) => r.id === "recipe-1" && r.key === "yield_unit",
        ),
      ).toBe(true);
    });

    it("prefers a visible prep-time line over a stale hidden prep_minutes property", async () => {
      const host = fakeHost();
      host.tree.children.push({
        id: 10,
        uuid: "prep-line",
        title: "Hazırlık: 20 dk",
        children: [],
      });
      host.values.set("recipe-1:prep_minutes", 5);
      const repository = repositoryFor(host);

      const recipe = await repository.getRecipe("recipe-1");

      expect(recipe?.prepMinutes).toBe(20);
      expect(host.values.get("recipe-1:prep_minutes")).toBe(20);
    });

    it("falls back to the hidden property when no visible line exists (plugin-created recipe)", async () => {
      const host = fakeHost();
      const repository = repositoryFor(host);

      const recipe = await repository.getRecipe("recipe-1");

      expect(recipe?.baseYield).toBe(8);
      expect(recipe?.yieldUnit).toBe("cookies");
    });

    it("clears yield_unit and rewrites the visible line when the unit is cleared via the edit patch", async () => {
      const host = fakeHost();
      host.tree.children.push({
        id: 10,
        uuid: "yield-line",
        title: "Porsiyon: 8 kurabiye",
        children: [],
      });
      const repository = repositoryFor(host);

      await repository.updateRecipeFields("recipe-1", { yieldUnit: null });

      expect(
        host.propertyRemovals.some(
          (r) => r.id === "recipe-1" && r.key === "yield_unit",
        ),
      ).toBe(true);
      expect(host.blockUpdates).toContainEqual({
        id: "yield-line",
        content: "Porsiyon: 8",
      });
    });

    it("clears the hidden property and deletes the visible line when an optional time field is cleared", async () => {
      const host = fakeHost();
      host.tree.children.push({
        id: 10,
        uuid: "prep-line",
        title: "Hazırlık: 15 dk",
        children: [],
      });
      host.values.set("recipe-1:prep_minutes", 15);
      const repository = repositoryFor(host);

      await repository.updateRecipeFields("recipe-1", { prepMinutes: null });

      expect(
        host.propertyRemovals.some(
          (r) => r.id === "recipe-1" && r.key === "prep_minutes",
        ),
      ).toBe(true);
      expect(host.blockRemovals).toContain("prep-line");
    });

    it("rewrites the visible line's number, keeping its unit word, when a time field is updated via the edit patch", async () => {
      const host = fakeHost();
      host.tree.children.push({
        id: 10,
        uuid: "cook-line",
        title: "Pişirme: 20 dk",
        children: [],
      });
      const repository = repositoryFor(host);

      await repository.updateRecipeFields("recipe-1", { cookMinutes: 35 });

      expect(host.blockUpdates).toContainEqual({
        id: "cook-line",
        content: "Pişirme: 35 dk",
      });
    });
  });
});
