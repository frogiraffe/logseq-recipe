// Standalone browser harness for screenshots/screen recordings: the real UI
// and the real parser, over an in-memory repository instead of a Logseq DB
// graph. Not shipped - `pnpm demo` only, and it is excluded from the plugin
// build (vite builds ./index.html, not ./demo).
import { createRoot } from "react-dom/client";
import {
  type ConversionDraft,
  type ConversionSourceNode,
  commitRecipeConversion,
  outlineToSource,
  planRecipeConversion,
} from "../src/application/convert-recipe";
import { commitRecipeEdit } from "../src/application/edit-recipe";
import type { RecipeRepository } from "../src/application/recipe-repository";
import type {
  ArchivedRecipeSummary,
  ExistingRecipeStructure,
  NewRecipeInput,
  RecipeSectionRole,
  RecipeSummary,
} from "../src/application/types";
import type {
  IngredientScaleMode,
  Recipe,
  RecipeLocale,
  RecipeMeta,
} from "../src/domain/recipe";
import { parseStepChild, safeAssetPath } from "../src/domain/step-media";
import { defaultParseContext } from "../src/parsing/context";
import { parseIngredient } from "../src/parsing/ingredient";
import { parseStep, withNoteDurations } from "../src/parsing/step";
import { DraftRecipeApp } from "../src/ui/app";
import "../src/ui/styles.css";
import "../src/ui/feature-styles.css";
import "../src/ui/theme-fallback.css";
import { getUiMessages } from "../src/ui/i18n";
import type {
  DraftRecipeInitialView,
  DraftRecipeUiController,
} from "../src/ui/state";
import { playTimerCue, watchTimerAlarms } from "../src/ui/timer-alarms";
import { COOKIE_PASTE } from "./cookie-paste";

const params = new URLSearchParams(location.search);
const locale = (params.get("locale") ?? "en") as RecipeLocale;
// ?ui= picks the interface language independently of the seed language.
const uiLanguage = params.get("ui") ?? locale;
const theme = params.get("theme") === "dark" ? "dark" : "light";
// Demo seeds are written in metric, so parse and display in metric for
// both locales - otherwise "225 g" comes back out as "7.94 oz".
const sourceMeasurementSystem = "metric" as const;
const parseContext = defaultParseContext(locale);
parseContext.sourceMeasurementSystem = sourceMeasurementSystem;

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function buildRecipe(seed: {
  id: string;
  title: string;
  baseYield: number;
  yieldUnit?: string;
  prepMinutes?: number;
  cookMinutes?: number;
  categories: string[];
  tags: string[];
  ingredients: string[];
  steps: string[];
  notes?: string[];
  stepChildren?: Record<number, string[]>;
}): Recipe {
  return {
    id: seed.id,
    title: seed.title,
    baseYield: seed.baseYield,
    ...(seed.yieldUnit ? { yieldUnit: seed.yieldUnit } : {}),
    ...(seed.prepMinutes ? { prepMinutes: seed.prepMinutes } : {}),
    ...(seed.cookMinutes ? { cookMinutes: seed.cookMinutes } : {}),
    categories: seed.categories,
    tags: seed.tags,
    ingredients: seed.ingredients.map((text) => makeIngredient(text)),
    steps: seed.steps.map((text, index) => ({
      ...makeStep(text),
      ...(seed.stepChildren?.[index]
        ? {
            children: seed.stepChildren[index].map((child) =>
              parseStepChild(nextId("child"), child),
            ),
          }
        : {}),
    })),
    notes: (seed.notes ?? []).map((text) => ({ id: nextId("note"), text })),
    schemaVersion: 1,
    parserLocale: locale,
    ingredientConversionOverrides: [],
  };
}

function makeIngredient(text: string) {
  const parsed = parseIngredient(text, parseContext);
  return {
    id: nextId("ing"),
    rawText: text,
    ...(parsed.amount ? { amount: parsed.amount } : {}),
    ...(parsed.unit ? { unit: parsed.unit } : {}),
    ingredientText: parsed.ingredientText,
    ...(parsed.note ? { note: parsed.note } : {}),
    scaleMode: "linear" as IngredientScaleMode,
  };
}

function makeStep(text: string) {
  return {
    id: nextId("step"),
    rawText: text,
    ...parseStep(text, parseContext),
  };
}

const seeds =
  locale === "tr"
    ? [
        {
          id: "kek",
          title: "Limonlu Kek",
          baseYield: 8,
          yieldUnit: "dilim",
          prepMinutes: 15,
          cookMinutes: 40,
          categories: ["Tatlı"],
          tags: ["Limon", "Fırın"],
          ingredients: [
            "3 yumurta",
            "1 su bardağı toz şeker",
            "1 çay bardağı sıvı yağ",
            "2.5 su bardağı un",
            "1 paket kabartma tozu",
            "1 adet limon kabuğu rendesi",
          ],
          steps: [
            "Yumurta ve şekeri 5 dakika çırpın.",
            "Sıvı yağı ve limon rendesini ekleyip karıştırın.",
            "Un ve kabartma tozunu eleyerek ekleyin.",
            "180 derecede 40 dakika pişirin.",
          ],
          notes: ["Fırından çıkınca 10 dakika kalıpta dinlendirin."],
          stepChildren: {
            0: ["Karışım beyazlayıp kabarana kadar çırpın."],
          },
        },
        {
          id: "mercimek",
          title: "Kırmızı Mercimek Çorbası",
          baseYield: 4,
          yieldUnit: "porsiyon",
          prepMinutes: 10,
          cookMinutes: 30,
          categories: ["Çorba"],
          tags: ["Vejetaryen"],
          ingredients: [
            "1 su bardağı kırmızı mercimek",
            "1 adet soğan",
            "2 yemek kaşığı tereyağı",
            "1 tatlı kaşığı tuz",
            "6 su bardağı su",
          ],
          steps: [
            "Soğanı tereyağında kısık ateşte kavurun.",
            "Mercimeği ve suyu ekleyin, 25 dakika orta ateşte pişirin.",
            "Blenderdan geçirip tuzunu ayarlayın.",
          ],
        },
      ]
    : [
        {
          id: "cookies",
          title: "Brown Butter Chocolate Cookies",
          baseYield: 18,
          yieldUnit: "cookies",
          prepMinutes: 20,
          cookMinutes: 12,
          categories: ["Dessert"],
          tags: ["Chocolate", "Baking"],
          ingredients: [
            "225 g butter",
            "200 g brown sugar",
            "2 large eggs",
            "310 g all-purpose flour",
            "1 tsp baking soda",
            "1/2 tsp salt",
            "250 g dark chocolate, chopped",
          ],
          steps: [
            "Brown the butter over medium heat for 6 minutes, then cool.",
            "Whisk in the sugar and eggs until glossy.",
            "Fold in the flour, baking soda and salt, then the chocolate.",
            "Bake at 180 C for 12 minutes.",
          ],
          notes: ["Chill the dough for 30 minutes for a thicker cookie."],
          stepChildren: {
            0: [
              "Stop when the foam turns hazelnut brown.",
              "![brown butter](../assets/brown-butter.webp)",
            ],
            1: ["![whisk tip](../assets/whisk-tip.ogg)"],
          },
        },
        {
          id: "soup",
          title: "Roasted Tomato Soup",
          baseYield: 4,
          yieldUnit: "servings",
          prepMinutes: 10,
          cookMinutes: 45,
          categories: ["Savory"],
          tags: ["Vegetarian"],
          ingredients: [
            "1 kg ripe tomatoes",
            "2 tbsp olive oil",
            "1 onion, quartered",
            "3 garlic cloves",
            "500 ml vegetable stock",
          ],
          steps: [
            "Roast the tomatoes, onion and garlic at 200 C for 35 minutes.",
            "Blend with the stock over low heat for 10 minutes.",
          ],
        },
      ];

const store = new Map<string, Recipe>(
  seeds.map((seed) => [seed.id, buildRecipe(seed)]),
);
// One seeded cover, so the list shows both a photo card and a placeholder.
const firstSeed = store.values().next().value;
if (firstSeed) {
  firstSeed.cover = { kind: "asset-path", value: "assets/brown-butter.webp" };
}
const archivedAt = new Map<string, number>();
const watchers = new Map<string, Set<() => void>>();

function notify(id: string): void {
  for (const listener of watchers.get(id) ?? []) listener();
}

function mustGet(id: string): Recipe {
  const recipe = store.get(id);
  if (!recipe) throw new Error(`No such recipe: ${id}`);
  return recipe;
}

type Located =
  | {
      recipe: Recipe;
      list: Array<{ id: string }>;
      index: number;
      role: RecipeSectionRole;
    }
  | {
      recipe: Recipe;
      list: Array<{ id: string }>;
      index: number;
      role: "stepChild";
      stepIndex: number;
    };

function locate(itemId: string): Located | null {
  for (const recipe of store.values()) {
    for (const role of ["ingredients", "steps", "notes"] as const) {
      const index = recipe[role].findIndex((item) => item.id === itemId);
      if (index >= 0) return { recipe, list: recipe[role], index, role };
    }
    for (const [stepIndex, step] of recipe.steps.entries()) {
      const index = (step.children ?? []).findIndex((c) => c.id === itemId);
      if (index >= 0 && step.children) {
        return {
          recipe,
          list: step.children,
          index,
          role: "stepChild",
          stepIndex,
        };
      }
    }
  }
  return null;
}

function summary(recipe: Recipe): RecipeSummary {
  return {
    id: recipe.id,
    title: recipe.title,
    categories: recipe.categories,
    tags: recipe.tags,
    ...(recipe.prepMinutes ? { prepMinutes: recipe.prepMinutes } : {}),
    ...(recipe.chillMinutes ? { chillMinutes: recipe.chillMinutes } : {}),
    ...(recipe.cookMinutes ? { cookMinutes: recipe.cookMinutes } : {}),
    ingredientTexts: recipe.ingredients.map((item) => item.ingredientText),
    ...(recipe.cover ? { cover: recipe.cover } : {}),
    stepTexts: recipe.steps.map((step) => step.rawText),
    noteTexts: [
      ...recipe.notes.map((note) => note.text),
      ...recipe.steps.flatMap((step) =>
        (step.children ?? [])
          .filter((child) => child.kind === "note")
          .map((child) => child.text),
      ),
    ],
  };
}

const repository: RecipeRepository = {
  getRecipe: async (id) => store.get(id) ?? null,
  createRecipe: async (input: NewRecipeInput) => {
    const recipe = buildRecipe({
      id: nextId("recipe"),
      title: input.title,
      baseYield: input.baseYield,
      ...(input.yieldUnit ? { yieldUnit: input.yieldUnit } : {}),
      categories: [],
      tags: [],
      ingredients: [],
      steps: [],
    });
    store.set(recipe.id, recipe);
    return recipe;
  },
  duplicateRecipe: async (id) => {
    const source = mustGet(id);
    const copy: Recipe = structuredClone({
      ...source,
      id: nextId("recipe"),
      title: `${source.title} (copy)`,
    });
    store.set(copy.id, copy);
    return copy;
  },
  // Convert-from-existing-blocks needs a real Logseq graph; the demo
  // seeds recipes directly instead. Record the convert flow in Logseq itself.
  markExistingRecipe: async (structure: ExistingRecipeStructure) => {
    store.set(structure.rootId, recipeFromConversion(structure));
    pendingSource = null;
  },
  listRecipeSummaries: async (): Promise<RecipeSummary[]> =>
    [...store.values()]
      .filter((recipe) => !archivedAt.has(recipe.id))
      .map(summary),
  listArchivedRecipeSummaries: async (): Promise<ArchivedRecipeSummary[]> =>
    [...store.values()]
      .filter((recipe) => archivedAt.has(recipe.id))
      .map((recipe) => ({
        ...summary(recipe),
        archivedAt: archivedAt.get(recipe.id),
      })),
  validateRecipe: async () => ({ valid: true, issues: [] }),
  watchRecipe: (id, listener) => {
    const set = watchers.get(id) ?? new Set();
    set.add(listener);
    watchers.set(id, set);
    return () => set.delete(listener);
  },
  validateRename: async (_id, title) => {
    if (!title.trim()) throw new RangeError("Recipe title is required.");
  },
  renameRecipe: async (id, title) => {
    mustGet(id).title = title;
    notify(id);
  },
  updateRecipeFields: async (id, patch) => {
    Object.assign(mustGet(id), patch);
    notify(id);
  },
  addSectionItem: async (recipeId, role, text) => {
    const recipe = mustGet(recipeId);
    if (role === "ingredients") {
      const item = makeIngredient(text);
      recipe.ingredients.push(item);
      notify(recipeId);
      return item.id;
    }
    if (role === "steps") {
      const item = makeStep(text);
      recipe.steps.push(item);
      notify(recipeId);
      return item.id;
    }
    const note = { id: nextId("note"), text };
    recipe.notes.push(note);
    notify(recipeId);
    return note.id;
  },
  addStepChild: async (stepId, text) => {
    const found = locate(stepId);
    if (found?.role !== "steps") throw new Error(`No such step: ${stepId}`);
    const step = found.recipe.steps[found.index];
    const child = parseStepChild(nextId("child"), text);
    step.children = [...(step.children ?? []), child];
    notify(found.recipe.id);
    return child.id;
  },
  updateSectionItem: async (itemId, text) => {
    const found = locate(itemId);
    if (!found) return;
    const { recipe, index } = found;
    if (found.role === "ingredients") {
      recipe.ingredients[index] = { ...makeIngredient(text), id: itemId };
    } else if (found.role === "steps") {
      recipe.steps[index] = {
        ...makeStep(text),
        id: itemId,
        ...(recipe.steps[index].children
          ? { children: recipe.steps[index].children }
          : {}),
      };
    } else if (found.role === "notes") {
      recipe.notes[index] = { id: itemId, text };
    } else {
      found.list[index] = withNoteDurations(
        parseStepChild(itemId, text),
        parseContext,
      );
    }
    notify(recipe.id);
  },
  removeSectionItem: async (itemId) => {
    const found = locate(itemId);
    if (!found) return;
    found.list.splice(found.index, 1);
    notify(found.recipe.id);
  },
  setIngredientScaleMode: async (itemId, scaleMode) => {
    const found = locate(itemId);
    if (found?.role !== "ingredients") return;
    found.recipe.ingredients[found.index].scaleMode = scaleMode;
    notify(found.recipe.id);
  },
  reorderSectionItems: async (orderedIds) => {
    const first = orderedIds[0] ? locate(orderedIds[0]) : null;
    if (!first) return;
    const byId = new Map(first.list.map((item) => [item.id, item]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((item) => item !== undefined);
    if (reordered.length === first.list.length) {
      first.list.splice(0, reordered.length, ...reordered);
    }
    notify(first.recipe.id);
  },
  archiveRecipe: async (id) => {
    mustGet(id);
    if (!archivedAt.has(id)) archivedAt.set(id, Date.now());
  },
  restoreRecipe: async (id) => {
    archivedAt.delete(id);
  },
  deleteArchivedRecipe: async (id) => {
    if (!archivedAt.has(id)) throw new Error(`Recipe is not archived: ${id}`);
    archivedAt.delete(id);
    store.delete(id);
  },
};

// ?convert=cookies opens Convert on a real-world paste (see
// cookie-paste.ts). Conversion goes through the same planRecipeConversion
// the plugin runtime uses; only the block rewrite and the final write are
// in memory.
const CONVERT_SOURCES: Record<string, ConversionSourceNode> = {
  cookies: COOKIE_PASTE,
};

let pendingSource: ConversionSourceNode | null =
  CONVERT_SOURCES[params.get("convert") ?? ""] ?? null;

function conversionView(source: ConversionSourceNode): DraftRecipeInitialView {
  const plan = planRecipeConversion(source, parseContext);
  return plan.kind === "split"
    ? {
        kind: "convert-needs-split",
        uuid: source.id,
        outline: plan.outline,
        staleChildIds: source.children.map((child) => child.id),
      }
    : { kind: "convert", source, draft: plan.draft };
}

// The recipe a committed conversion leaves behind, read back from the
// (split) source blocks the way the plugin's loader reads Logseq blocks.
function recipeFromConversion(structure: ExistingRecipeStructure): Recipe {
  const source = pendingSource;
  if (!source) throw new Error("Nothing to convert.");
  const byId = new Map<string, ConversionSourceNode>();
  const walk = (block: ConversionSourceNode) => {
    byId.set(block.id, block);
    block.children.forEach(walk);
  };
  walk(source);
  const section = (role: RecipeSectionRole) =>
    byId.get(
      structure.sectionRoles.find((entry) => entry.role === role)?.blockId ??
        "",
    )?.children ?? [];
  const parsedById = new Map(
    (structure.ingredientMetadata ?? []).map((entry) => [
      entry.blockId,
      entry.parsed,
    ]),
  );
  return {
    id: structure.rootId,
    title: source.title,
    baseYield: structure.baseYield ?? 1,
    ...(structure.yieldUnit ? { yieldUnit: structure.yieldUnit } : {}),
    ...(structure.prepMinutes ? { prepMinutes: structure.prepMinutes } : {}),
    ...(structure.chillMinutes ? { chillMinutes: structure.chillMinutes } : {}),
    ...(structure.cookMinutes ? { cookMinutes: structure.cookMinutes } : {}),
    categories: [],
    tags: [],
    ingredients: section("ingredients").map((block) => {
      const parsed =
        parsedById.get(block.id) ?? parseIngredient(block.title, parseContext);
      return {
        id: block.id,
        rawText: block.title,
        ...(parsed.amount ? { amount: parsed.amount } : {}),
        ...(parsed.unit ? { unit: parsed.unit } : {}),
        ingredientText: parsed.ingredientText,
        ...(parsed.note ? { note: parsed.note } : {}),
        scaleMode: "linear" as IngredientScaleMode,
      };
    }),
    steps: section("steps").map((block) => ({
      id: block.id,
      rawText: block.title,
      ...parseStep(block.title, parseContext),
      ...(block.children.length > 0
        ? {
            children: block.children.map((child) =>
              withNoteDurations(
                parseStepChild(child.id, child.title),
                parseContext,
              ),
            ),
          }
        : {}),
    })),
    notes: section("notes").map((block) => ({
      id: block.id,
      text: block.title,
    })),
    schemaVersion: 1,
    parserLocale: structure.locale ?? locale,
    ...(structure.sourceMeasurementSystem
      ? { sourceMeasurementSystem: structure.sourceMeasurementSystem }
      : {}),
    ingredientConversionOverrides: [],
  };
}

const demoAssets = ["assets/brown-butter.webp", "assets/whisk-tip.ogg"];

const controller: DraftRecipeUiController = {
  listRecipes: () => repository.listRecipeSummaries(),
  listArchivedRecipes: () => repository.listArchivedRecipeSummaries(),
  loadRecipe: (id) => repository.getRecipe(id),
  createRecipe: (input) => repository.createRecipe(input),
  duplicateRecipe: (id) => repository.duplicateRecipe(id),
  commitConversion: (draft: ConversionDraft) =>
    commitRecipeConversion(repository, draft),
  splitOutlineAndConvert: async (uuid, outline) => {
    pendingSource = { ...outlineToSource(outline, uuid), id: uuid };
    return conversionView(pendingSource);
  },
  resolveCover: async (recipe) =>
    recipe.cover ? `./${recipe.cover.value}` : null,
  listImageAssets: async () => [],
  listStepMediaAssets: async () => demoAssets,
  // Demo assets are served from ./demo/assets next to this file.
  resolveAssetUrl: async (path) => {
    const safe = safeAssetPath(path);
    return safe && demoAssets.includes(safe) ? `./${safe}` : null;
  },
  saveRecipeMeta: async (id: string, meta: RecipeMeta) => {
    Object.assign(mustGet(id), meta);
    notify(id);
  },
  setCoverPath: async () => undefined,
  clearCover: async () => undefined,
  saveRecipeEdit: (id, patch) => commitRecipeEdit(repository, id, patch),
  archiveRecipe: (id) => repository.archiveRecipe(id),
  restoreRecipe: (id) => repository.restoreRecipe(id),
  deleteArchivedRecipe: (id) => repository.deleteArchivedRecipe(id),
  openInLogseq: () => undefined,
  watchRecipe: (id, listener) => repository.watchRecipe(id, listener),
  close: () => undefined,
};

// Same alarm service as the plugin runtime: timers ring off-screen too.
watchTimerAlarms("demo", () => playTimerCue());

document.documentElement.dataset.theme = theme;
createRoot(document.getElementById("app") as HTMLElement).render(
  <DraftRecipeApp
    controller={controller}
    messages={getUiMessages(uiLanguage)}
    config={{
      initialView: pendingSource
        ? conversionView(pendingSource)
        : { kind: "recipes" },
      globalMeasurementSystem: sourceMeasurementSystem,
      defaultParserLocale: locale,
      defaultSourceMeasurementSystem: sourceMeasurementSystem,
      themeMode: theme,
      graphKey: "demo",
    }}
  />,
);
