// @vitest-environment node
//
// End-to-end checks against a real Logseq DB graph, running the plugin's own
// conversion, repository and writer code. Run with `pnpm test:live` against
// a throwaway graph (everything happens on one new page, deleted at the end,
// plus recipes created and then deleted in the Recipe Library). Skipped
// unless one of these reaches Logseq:
//
// - LOGSEQ_CDP_PORT: a Logseq started with --remote-debugging-port=<port>,
//   with this plugin loaded. Every call runs through the plugin SDK inside
//   the plugin's own frame, exactly as the plugin makes it. Node 20 needs
//   NODE_OPTIONS=--experimental-websocket.
// - LOGSEQ_API_TOKEN: Logseq's HTTP API server. That runs outside any
//   plugin, so the bridge below does what the plugin SDK does implicitly:
//   it qualifies this plugin's property keys with the plugin's namespace,
//   and answers the SDK's client-side helpers locally. The graph must
//   already carry the plugin's property schema.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COOKIE_PASTE } from "../../demo/cookie-paste";
import {
  type ConversionSourceNode,
  commitRecipeConversion,
  planRecipeConversion,
} from "../../src/application/convert-recipe";
import {
  commitRecipeEdit,
  sectionDiff,
} from "../../src/application/edit-recipe";
import { decodeIngredientMeta } from "../../src/application/ingredient-meta";
import {
  decodeRecipeMeta,
  emptyRecipeMeta,
} from "../../src/application/recipe-meta";
import type { RecipeRepository } from "../../src/application/recipe-repository";
import type { OutlineNode } from "../../src/application/split-outline";
import {
  currentAssetListHost,
  currentCoverResolverHost,
  listImageAssets,
  resolveCoverUrl,
  setRecipeCover,
} from "../../src/logseq/assets";
import { unwrapBlockPropertyValue } from "../../src/logseq/block-reader";
import { loadConversionRoot } from "../../src/logseq/conversion-source";
import { PROPERTY_KEYS } from "../../src/logseq/property-keys";
import {
  moveRecipeTaxonomy,
  planRecipeTaxonomy,
  writeRecipeMeta,
} from "../../src/logseq/recipe-taxonomy";
import {
  createDraftRecipeRepository,
  currentDraftRecipeHost,
} from "../../src/logseq/repository";
import { ensureTaxonomySchema } from "../../src/logseq/schema";
import { readSettings } from "../../src/logseq/settings";
import { applyOutlineSplit } from "../../src/logseq/split-outline-writer";
import { defaultParseContext } from "../../src/parsing/context";

const TOKEN = process.env.LOGSEQ_API_TOKEN;
const CDP_PORT = process.env.LOGSEQ_CDP_PORT;
const API = process.env.LOGSEQ_API_URL ?? "http://127.0.0.1:12315/api";
const NAMESPACE = ":plugin.property.logseq-recipe/";
const PLUGIN_KEYS = new Set<string>(Object.values(PROPERTY_KEYS));

async function httpCall(method: string, ...args: unknown[]): Promise<unknown> {
  const response = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ method, args }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method}: ${response.status} ${text}`);
  if (!text) return null;
  // Most methods answer JSON; a few (Assets.makeUrl) answer a bare string.
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

// Evaluates `logseq.X.y(...args)` in the plugin's frame over the Chrome
// DevTools protocol.
async function cdpSession(port: string) {
  const targets = (await (
    await fetch(`http://127.0.0.1:${port}/json`)
  ).json()) as Array<{
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
  }>;
  const page = targets.find(
    (target) => target.type === "page" && /index\.html/.test(target.url),
  );
  if (!page) throw new Error("No Logseq window on that debugging port.");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  let nextId = 0;
  const contexts: Array<{ id: number; auxData?: Record<string, unknown> }> = [];
  const pending = new Map<number, (message: Record<string, unknown>) => void>();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.executionContextCreated") {
      contexts.push(message.params.context);
    }
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  const send = (method: string, params: unknown = {}) =>
    new Promise<Record<string, unknown>>((resolve) => {
      nextId += 1;
      pending.set(nextId, resolve);
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });

  type Frame = { frame: { id: string; url: string }; childFrames?: Frame[] };
  const tree = (await send("Page.getFrameTree")) as {
    result: { frameTree: Frame };
  };
  const frames: Frame["frame"][] = [];
  const walk = (node: Frame) => {
    frames.push(node.frame);
    node.childFrames?.forEach(walk);
  };
  walk(tree.result.frameTree);
  const pluginFrame = frames.find(
    (frame) =>
      frame.url.includes("logseq-recipe") ||
      /dist\/index\.html/.test(frame.url),
  );
  if (!pluginFrame) throw new Error("The plugin is not loaded in Logseq.");
  await send("Runtime.enable");
  await new Promise((resolve) => setTimeout(resolve, 200));
  const contextId = contexts.find(
    (context) =>
      context.auxData?.frameId === pluginFrame.id && context.auxData.isDefault,
  )?.id;

  return {
    async call(method: string, ...args: unknown[]): Promise<unknown> {
      const response = (await send("Runtime.evaluate", {
        expression: `${method}(...${JSON.stringify(args)})`,
        awaitPromise: true,
        returnByValue: true,
        contextId,
      })) as {
        result: {
          result?: { value?: unknown };
          exceptionDetails?: { exception?: { description?: string } };
        };
      };
      const failure = response.result.exceptionDetails;
      if (failure) {
        throw new Error(
          `${method}: ${failure.exception?.description ?? "failed"}`,
        );
      }
      return response.result.result?.value ?? null;
    },
    close: () => socket.close(),
  };
}

let cdp: Awaited<ReturnType<typeof cdpSession>> | null = null;

function call(method: string, ...args: unknown[]): Promise<unknown> {
  return cdp ? cdp.call(method, ...args) : httpCall(method, ...args);
}

// Through the SDK (CDP), Logseq qualifies the plugin's keys itself.
const qualify = (key: unknown) =>
  !cdp && typeof key === "string" && PLUGIN_KEYS.has(key)
    ? NAMESPACE + key
    : key;

function namespace(name: string, local: Record<string, unknown> = {}) {
  return new Proxy(local, {
    get: (target, method: string) =>
      method in target
        ? target[method]
        : (...args: unknown[]) => call(`logseq.${name}.${method}`, ...args),
  });
}

function installBridge(): void {
  const editor = namespace("Editor", {
    isPageBlock: (entity: { uuid?: string }) =>
      Boolean(entity?.uuid) && Object.hasOwn(entity, "name"),
    getBlockProperty: (id: string, key: string) =>
      call("logseq.Editor.getBlockProperty", id, qualify(key)),
    upsertBlockProperty: (
      id: string,
      key: string,
      value: unknown,
      options?: unknown,
    ) =>
      call(
        "logseq.Editor.upsertBlockProperty",
        id,
        qualify(key),
        value,
        ...(options ? [options] : []),
      ),
    removeBlockProperty: (id: string, key: string) =>
      call("logseq.Editor.removeBlockProperty", id, qualify(key)),
    getProperty: async (key: string) =>
      (await call("logseq.Editor.getProperty", qualify(key))) ?? {
        ident: qualify(key),
      },
    // Over HTTP the graph must already carry this plugin's property schema
    // (the plugin itself registered it): creating schema from outside a
    // plugin would land in the user namespace instead.
    upsertProperty: async (key: string, schema?: unknown) =>
      cdp
        ? call("logseq.Editor.upsertProperty", key, schema)
        : call("logseq.Editor.getProperty", qualify(key)),
    exitEditingMode: async () => undefined,
  });
  (globalThis as unknown as { logseq: unknown }).logseq = {
    settings: {},
    Editor: editor,
    DB: namespace("DB", { onChanged: () => () => undefined }),
    App: namespace("App"),
    Assets: namespace("Assets"),
  };
}

function outlineTexts(node: OutlineNode): unknown {
  return [node.text, node.children.map(outlineTexts)];
}

function sourceTexts(node: ConversionSourceNode): unknown {
  return [node.title, node.children.map(sourceTexts)];
}

async function insertTree(
  parentUuid: string,
  nodes: readonly ConversionSourceNode[],
): Promise<void> {
  let previous: string | null = null;
  for (const node of nodes) {
    const created = (await call(
      "logseq.Editor.insertBlock",
      previous ?? parentUuid,
      node.title,
      { sibling: previous !== null },
    )) as { uuid: string };
    await insertTree(created.uuid, node.children);
    previous = created.uuid;
  }
}

async function pageIdOf(uuid: string): Promise<unknown> {
  const block = (await call("logseq.Editor.getBlock", uuid)) as {
    page?: { id?: unknown };
  };
  return block?.page?.id;
}

describe.skipIf(!TOKEN && !CDP_PORT).sequential("live Logseq graph", () => {
  const stamp = Date.now();
  const pageName = `Logseq Recipe live test ${stamp}`;
  const context = {
    ...defaultParseContext("tr"),
    sourceMeasurementSystem: "metric" as const,
  };
  let repository: RecipeRepository;
  let pageId: unknown;
  let rootUuid = "";
  let libraryRecipeId: string | null = null;
  // Recipes and category pages the taxonomy checks create.
  const taxonomyRecipeIds: string[] = [];
  const taxonomyPages: string[] = [];

  beforeAll(async () => {
    if (CDP_PORT) cdp = await cdpSession(CDP_PORT);
    installBridge();
    repository = createDraftRecipeRepository(currentDraftRecipeHost(), {
      settings: readSettings(),
      schemaCapabilities: { coverReference: "asset-path" },
    });
    const page = (await call(
      "logseq.Editor.createPage",
      pageName,
      {},
      {
        redirect: false,
      },
    )) as { id: unknown };
    pageId = page.id;
    const root = (await call(
      "logseq.Editor.appendBlockInPage",
      pageName,
      COOKIE_PASTE.title,
    )) as { uuid: string };
    rootUuid = root.uuid;
    await insertTree(rootUuid, COOKIE_PASTE.children);
  }, 120_000);

  afterAll(async () => {
    if (!TOKEN && !CDP_PORT) return;
    if (libraryRecipeId) {
      await repository.archiveRecipe(libraryRecipeId).catch(() => undefined);
      await repository
        .deleteArchivedRecipe(libraryRecipeId)
        .catch(() => undefined);
    }
    for (const id of taxonomyRecipeIds) {
      await repository.archiveRecipe(id).catch(() => undefined);
      await repository.deleteArchivedRecipe(id).catch(() => undefined);
    }
    for (const name of taxonomyPages) {
      await call("logseq.Editor.deletePage", name).catch(() => undefined);
    }
    // A DB graph moves a deleted page to its recycle bin with its blocks:
    // remove the converted recipe first, or it lingers there.
    if (rootUuid) {
      await call("logseq.Editor.removeBlock", rootUuid).catch(() => undefined);
    }
    await call("logseq.Editor.deletePage", pageName).catch(() => undefined);
    cdp?.close();
  }, 120_000);

  it("reads the paste back exactly as it was written", async () => {
    const source = await loadConversionRoot(rootUuid);
    expect(source && sourceTexts(source)).toEqual(
      sourceTexts({ ...COOKIE_PASTE, id: rootUuid }),
    );
  });

  it("splits the paste into the planned block tree, in order", async () => {
    const source = await loadConversionRoot(rootUuid);
    if (!source) throw new Error("paste not found");
    const plan = planRecipeConversion(source, context);
    expect(plan.kind).toBe("split");
    if (plan.kind !== "split") return;

    await applyOutlineSplit(
      rootUuid,
      plan.outline,
      source.children.map((child) => child.id),
    );

    const rebuilt = await loadConversionRoot(rootUuid);
    expect(rebuilt && sourceTexts(rebuilt)).toEqual(outlineTexts(plan.outline));
  }, 120_000);

  it("converts it and reads the recipe back", async () => {
    const source = await loadConversionRoot(rootUuid);
    if (!source) throw new Error("split recipe not found");
    const plan = planRecipeConversion(source, context);
    expect(plan.kind).toBe("convert");
    if (plan.kind !== "convert") return;
    expect(plan.draft.issues.map((issue) => issue.code)).toEqual([]);

    await commitRecipeConversion(repository, plan.draft);
    const recipe = await repository.getRecipe(rootUuid);

    expect(recipe).toMatchObject({
      title: "Chunky Chocolate Chip Cookies",
      baseYield: 4,
      yieldUnit: "cookies",
      prepMinutes: 15,
      cookMinutes: 11,
    });
    expect(recipe?.ingredients).toHaveLength(12);
    expect(recipe?.ingredients[0]).toMatchObject({
      amount: { kind: "exact", value: 60 },
      unit: "g",
      ingredientText: "tereyağı",
    });
    expect(recipe?.steps[0]).toMatchObject({
      rawText: "Tereyağını erit ve 5-10 dakika ılımaya bırak.",
      children: [
        expect.objectContaining({ text: "Tereyağını kahverengileştirme." }),
      ],
    });
    const preheat = recipe?.steps.find((step) =>
      step.rawText.startsWith("Fırını"),
    );
    expect(preheat?.temperatures[0]).toMatchObject({
      value: 190,
      ovenMode: "conventional",
      preheat: true,
    });
    expect(recipe?.notes).toHaveLength(3);

    // Step notes carry their times for Cooking Mode timers; the "don't"
    // among them is marked so it offers none.
    const bake = recipe?.steps.find((step) =>
      step.rawText.startsWith("Cookie'leri"),
    );
    const noteTimes = (bake?.children ?? []).flatMap((child) =>
      child.kind === "note"
        ? (child.durations ?? []).map((d) => [d.rawText, Boolean(d.negated)])
        : [],
    );
    expect(noteTimes).toEqual([
      ["15-16 dakikaya", true],
      ["10-15 dakika", false],
    ]);

    const soda = recipe?.ingredients.find(
      (ingredient) => ingredient.ingredientText === "karbonat",
    );
    const raw = await logseq.Editor.getBlockProperty(
      soda?.id ?? "",
      PROPERTY_KEYS.ingredientMeta,
    );
    const stored = decodeIngredientMeta(unwrapBlockPropertyValue(raw));
    expect(stored).toMatchObject({
      locale: "tr",
      sourceMeasurementSystem: "metric",
    });
  }, 120_000);

  it("updates the visible yield line with the servings", async () => {
    await repository.updateRecipeFields(rootUuid, { baseYield: 8 });
    const recipe = await repository.getRecipe(rootUuid);
    expect(recipe?.baseYield).toBe(8);
    const source = await loadConversionRoot(rootUuid);
    expect(source?.children.map((child) => child.title)).toContain(
      "Yield: 8 cookies",
    );
  }, 60_000);

  it("saves an edit with a multi-line step, an addition and a removal", async () => {
    const before = await repository.getRecipe(rootUuid);
    if (!before) throw new Error("recipe missing");
    const [firstStep] = before.steps;
    const steps = before.steps.map((step) => ({
      id: step.id,
      text: step.rawText,
    }));
    steps[0] = {
      id: firstStep.id,
      text: `${firstStep.rawText}\nSoğumaya bırak.`,
    };
    const ingredients = [
      ...before.ingredients.map((i) => ({ id: i.id, text: i.rawText })),
      { id: "new:1", text: "25 cl süt" },
    ];
    const notes = before.notes.slice(0, -1);

    await commitRecipeEdit(repository, rootUuid, {
      ingredients: sectionDiff(
        before.ingredients.map((i) => ({ id: i.id, text: i.rawText })),
        ingredients,
      ),
      steps: sectionDiff(
        before.steps.map((s) => ({ id: s.id, text: s.rawText })),
        steps,
      ),
      notes: sectionDiff(before.notes, notes),
      ingredientOrder: ingredients.map((i) => i.id),
    });

    const after = await repository.getRecipe(rootUuid);
    expect(after?.steps[0].rawText).toBe(
      "Tereyağını erit ve 5-10 dakika ılımaya bırak.\nSoğumaya bırak.",
    );
    expect(after?.ingredients.at(-1)).toMatchObject({
      rawText: "25 cl süt",
      amount: { kind: "exact", value: 25 },
      unit: "cl",
    });
    expect(after?.notes).toHaveLength(2);
  }, 120_000);

  it("archives and restores a recipe converted outside the library in place", async () => {
    await repository.archiveRecipe(rootUuid);
    expect(await pageIdOf(rootUuid)).toBe(pageId);
    const archived = await repository.listArchivedRecipeSummaries();
    expect(archived.map((recipe) => recipe.id)).toContain(rootUuid);

    await repository.restoreRecipe(rootUuid);
    expect(await pageIdOf(rootUuid)).toBe(pageId);
    const active = await repository.listRecipeSummaries({ fresh: true });
    expect(active.map((recipe) => recipe.id)).toContain(rootUuid);
  }, 120_000);

  it("still moves a Recipe Library recipe between its sections", async () => {
    const created = await repository.createRecipe({
      title: `Live test soup ${stamp}`,
      baseYield: 2,
      locale: "en",
      sourceMeasurementSystem: "metric",
    });
    libraryRecipeId = created.id;
    const library = (await call("logseq.Editor.getPage", "Recipe Library")) as {
      id: unknown;
    };
    expect(await pageIdOf(created.id)).toBe(library.id);

    await repository.archiveRecipe(created.id);
    const archivedParent = (await call(
      "logseq.Editor.getBlock",
      created.id,
    )) as {
      parent?: { id?: number };
    };
    const section = (await call(
      "logseq.Editor.getBlock",
      archivedParent.parent?.id,
    )) as { title?: string };
    expect(section.title).toBe("Archived");

    await repository.deleteArchivedRecipe(created.id);
    libraryRecipeId = null;
    expect(await call("logseq.Editor.getBlock", created.id)).toBeNull();
  }, 120_000);

  it("stores a listed cover as a graph-relative path and resolves it", async () => {
    const [listed] = await listImageAssets(currentAssetListHost());
    if (!listed) return;
    await setRecipeCover(
      logseq.Editor as never,
      rootUuid,
      { kind: "asset-path", value: listed },
      { coverReference: "asset-path" },
    );
    const recipe = await repository.getRecipe(rootUuid);
    expect(recipe?.cover?.value).toMatch(/^assets\//);
    const url = await resolveCoverUrl(
      currentCoverResolverHost(),
      recipe?.cover,
    );
    expect(url).toMatch(/^assets:\/\/.+\/assets\//);
  }, 60_000);

  describe("categories and tags as Logseq properties", () => {
    const name = (label: string) => {
      const page = `LR ${label} ${stamp}`;
      taxonomyPages.push(page);
      return page;
    };
    const [dessert, baking, quick, party, legacyCat, legacyTag, later] = [
      "Dessert",
      "Baking",
      "Quick",
      "Party",
      "Legacy cat",
      "Legacy tag",
      "Later",
    ].map(name);
    let taxonomyRepository: RecipeRepository;
    let recipeId = "";
    const editor = () => logseq.Editor as never;
    const meta = (categories: string[], tags: string[] = []) => ({
      ...emptyRecipeMeta(),
      categories,
      tags,
    });
    const storedJson = async () =>
      decodeRecipeMeta(
        unwrapBlockPropertyValue(
          await call(
            "logseq.Editor.getBlockProperty",
            recipeId,
            qualify(PROPERTY_KEYS.recipeMeta),
          ),
        ),
      );
    const rawCategories = async () =>
      (await call(
        "logseq.Editor.getBlockProperty",
        recipeId,
        qualify(PROPERTY_KEYS.recipeCategories),
      )) as Array<{ id: number; title: string }> | null;
    const queried = async (page: string) =>
      (
        ((await call(
          "logseq.DB.q",
          `(property recipe_categories [[${page}]])`,
        )) as Array<{ uuid?: string }> | null) ?? []
      ).map((block) => block.uuid);

    beforeAll(async () => {
      if (!cdp) return;
      expect(await ensureTaxonomySchema(logseq.Editor as never)).toBe(true);
      taxonomyRepository = createDraftRecipeRepository(
        currentDraftRecipeHost(),
        {
          settings: readSettings(),
          schemaCapabilities: {
            coverReference: "asset-path",
            taxonomyProperties: true,
          },
        },
      );
      const created = await taxonomyRepository.createRecipe({
        title: `Live taxonomy ${stamp}`,
        baseYield: 4,
        locale: "en",
      });
      recipeId = created.id;
      taxonomyRecipeIds.push(recipeId);
    }, 120_000);

    // Creating the page-valued properties needs the plugin's own context.
    it.skipIf(!CDP_PORT)(
      "saves, replaces and removes them as page references",
      async () => {
        await writeRecipeMeta(
          editor(),
          recipeId,
          meta([dessert, baking], [quick]),
          true,
        );
        let recipe = await taxonomyRepository.getRecipe(recipeId);
        expect(recipe?.categories).toEqual([dessert, baking]);
        expect(recipe?.tags).toEqual([quick]);
        const page = (await call("logseq.Editor.getPage", dessert)) as {
          id: number;
        };
        expect((await rawCategories())?.map((value) => value.id)).toContain(
          page.id,
        );
        expect((await storedJson()).taxonomyInProperties).toBe(true);
        expect(await queried(dessert)).toContain(recipeId);

        await writeRecipeMeta(editor(), recipeId, meta([baking]), true);
        recipe = await taxonomyRepository.getRecipe(recipeId);
        expect(recipe?.categories).toEqual([baking]);
        expect(recipe?.tags).toEqual([]);
        expect(await queried(dessert)).not.toContain(recipeId);
        expect(await queried(baking)).toContain(recipeId);

        await writeRecipeMeta(editor(), recipeId, meta([]), true);
        expect(await rawCategories()).toBeNull();
        // Pages stay: nothing the plugin removes is ever deleted.
        expect(await call("logseq.Editor.getPage", dessert)).not.toBeNull();
      },
      120_000,
    );

    it.skipIf(!CDP_PORT)(
      "reads an edit made to the properties in Logseq",
      async () => {
        await writeRecipeMeta(editor(), recipeId, meta([dessert]), true);
        const added = (await call(
          "logseq.Editor.createPage",
          party,
          {},
          {
            redirect: false,
          },
        )) as { id: number };
        // As Logseq's property editor adds a value: without replacing.
        await call(
          "logseq.Editor.upsertBlockProperty",
          recipeId,
          PROPERTY_KEYS.recipeCategories,
          [added.id],
        );
        expect(
          (await taxonomyRepository.getRecipe(recipeId))?.categories,
        ).toEqual([dessert, party]);

        await call(
          "logseq.Editor.removeBlockProperty",
          recipeId,
          PROPERTY_KEYS.recipeCategories,
        );
        // The JSON still lists Dessert, as a copy only.
        expect((await storedJson()).categories).toEqual([dessert]);
        expect(
          (await taxonomyRepository.getRecipe(recipeId))?.categories,
        ).toEqual([]);
      },
      120_000,
    );

    it.skipIf(!CDP_PORT)(
      "moves a 1.4 recipe's JSON into the properties once, previewed first",
      async () => {
        // As Logseq Recipe 1.4 leaves it: only the JSON.
        await call(
          "logseq.Editor.upsertBlockProperty",
          recipeId,
          PROPERTY_KEYS.recipeMeta,
          JSON.stringify(meta([legacyCat], [legacyTag])),
        );
        expect(await taxonomyRepository.getRecipe(recipeId)).toMatchObject({
          categories: [legacyCat],
          tags: [legacyTag],
        });

        const plan = await planRecipeTaxonomy(editor(), [{ id: recipeId }]);
        expect(plan).toMatchObject({
          recipeCount: 1,
          propertyNames: ["recipe_categories", "recipe_tags"],
        });
        expect(plan.pagesToCreate).toEqual([legacyCat, legacyTag]);
        expect(await call("logseq.Editor.getPage", legacyCat)).toBeNull();

        expect(await moveRecipeTaxonomy(editor(), [{ id: recipeId }])).toBe(1);
        expect(await moveRecipeTaxonomy(editor(), [{ id: recipeId }])).toBe(0);
        expect(await queried(legacyCat)).toContain(recipeId);
        expect((await storedJson()).taxonomyInProperties).toBe(true);

        // 1.4 saves again, adding a category: it writes the JSON only,
        // without the mark. Nothing either version wrote is lost.
        await call(
          "logseq.Editor.upsertBlockProperty",
          recipeId,
          PROPERTY_KEYS.recipeMeta,
          JSON.stringify(meta([legacyCat, later], [legacyTag])),
        );
        expect(
          (await taxonomyRepository.getRecipe(recipeId))?.categories,
        ).toEqual([legacyCat, later]);
        expect(
          (await planRecipeTaxonomy(editor(), [{ id: recipeId }])).recipeCount,
        ).toBe(1);
      },
      120_000,
    );

    it.skipIf(!CDP_PORT)(
      'keeps a name Logseq would split into pages ("a/b") in the JSON',
      async () => {
        const slashed = `LR Sweet/Savory ${stamp}`;
        await writeRecipeMeta(
          editor(),
          recipeId,
          meta([slashed, dessert]),
          true,
        );
        expect(
          (await taxonomyRepository.getRecipe(recipeId))?.categories,
        ).toEqual([slashed, dessert]);
        expect((await rawCategories())?.map((value) => value.title)).toEqual([
          dessert,
        ]);
        expect((await storedJson()).taxonomyInProperties).toBeUndefined();
      },
      120_000,
    );

    it.skipIf(!CDP_PORT)(
      "keeps a name Logseq uses for a built-in tag in the JSON",
      async () => {
        await writeRecipeMeta(
          editor(),
          recipeId,
          meta(["Task", dessert]),
          true,
        );
        expect(
          (await taxonomyRepository.getRecipe(recipeId))?.categories,
        ).toEqual(["Task", dessert]);
        expect((await rawCategories())?.map((value) => value.title)).toEqual([
          dessert,
        ]);
        expect((await storedJson()).taxonomyInProperties).toBeUndefined();
      },
      120_000,
    );

    it.skipIf(!CDP_PORT)(
      "gives a duplicate the same page references",
      async () => {
        await writeRecipeMeta(
          editor(),
          recipeId,
          meta([dessert], [quick]),
          true,
        );
        const copy = await taxonomyRepository.duplicateRecipe(recipeId);
        taxonomyRecipeIds.push(copy.id);
        expect(copy).toMatchObject({ categories: [dessert], tags: [quick] });
        expect(await queried(dessert)).toEqual(
          expect.arrayContaining([recipeId, copy.id]),
        );
      },
      120_000,
    );
  });
});
