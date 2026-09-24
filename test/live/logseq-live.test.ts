// @vitest-environment node
//
// End-to-end checks against a real Logseq DB graph through Logseq's HTTP API
// server, running the plugin's own conversion, repository and writer code.
// Skipped unless LOGSEQ_API_TOKEN is set; run with `pnpm test:live` against
// a throwaway graph (everything happens on one new page, deleted at the end,
// plus one recipe created and then deleted in the Recipe Library).
//
// The HTTP API runs outside any plugin, so the bridge below does what the
// plugin SDK does implicitly: it qualifies this plugin's property keys with
// the plugin's namespace, and answers the SDK's client-side helpers locally.
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
  createDraftRecipeRepository,
  currentDraftRecipeHost,
} from "../../src/logseq/repository";
import { readSettings } from "../../src/logseq/settings";
import { applyOutlineSplit } from "../../src/logseq/split-outline-writer";
import { defaultParseContext } from "../../src/parsing/context";

const TOKEN = process.env.LOGSEQ_API_TOKEN;
const API = process.env.LOGSEQ_API_URL ?? "http://127.0.0.1:12315/api";
const NAMESPACE = ":plugin.property.logseq-recipe/";
const PLUGIN_KEYS = new Set<string>(Object.values(PROPERTY_KEYS));

async function call(method: string, ...args: unknown[]): Promise<unknown> {
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

const qualify = (key: unknown) =>
  typeof key === "string" && PLUGIN_KEYS.has(key) ? NAMESPACE + key : key;

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
    upsertBlockProperty: (id: string, key: string, value: unknown) =>
      call("logseq.Editor.upsertBlockProperty", id, qualify(key), value),
    removeBlockProperty: (id: string, key: string) =>
      call("logseq.Editor.removeBlockProperty", id, qualify(key)),
    getProperty: async (key: string) =>
      (await call("logseq.Editor.getProperty", qualify(key))) ?? {
        ident: qualify(key),
      },
    // The graph already carries this plugin's property schema (the plugin
    // itself registered it); creating schema from outside a plugin would
    // land in the user namespace instead.
    upsertProperty: async (key: string) =>
      call("logseq.Editor.getProperty", qualify(key)),
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

describe.skipIf(!TOKEN).sequential("live Logseq graph", () => {
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

  beforeAll(async () => {
    installBridge();
    repository = createDraftRecipeRepository(currentDraftRecipeHost(), {
      settings: readSettings(),
      schemaCapabilities: { jsonProperty: false, coverReference: "asset-path" },
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
    if (!TOKEN) return;
    if (libraryRecipeId) {
      await repository.archiveRecipe(libraryRecipeId).catch(() => undefined);
      await repository
        .deleteArchivedRecipe(libraryRecipeId)
        .catch(() => undefined);
    }
    await call("logseq.Editor.deletePage", pageName).catch(() => undefined);
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
});
