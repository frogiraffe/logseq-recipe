// Standalone browser harness for screenshots/screen recordings: the real UI
// and the real parser, over an in-memory repository instead of a Logseq DB
// graph. Not shipped - `pnpm demo` only, and it is excluded from the plugin
// build (vite builds ./index.html, not ./demo).
import { createRoot } from "react-dom/client";
import {
  type ConversionDraft,
  commitRecipeConversion,
} from "../src/application/convert-recipe";
import { commitRecipeEdit } from "../src/application/edit-recipe";
import type { RecipeRepository } from "../src/application/recipe-repository";
import type {
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
import { defaultParseContext } from "../src/parsing/context";
import { parseIngredient } from "../src/parsing/ingredient";
import { parseStep } from "../src/parsing/step";
import { DraftRecipeApp } from "../src/ui/app";
import "../src/ui/styles.css";
import "../src/ui/feature-styles.css";
import "../src/ui/theme-fallback.css";
import { enMessages, getUiMessages } from "../src/ui/i18n";
import type { DraftRecipeUiController } from "../src/ui/state";

const params = new URLSearchParams(location.search);
const locale = (params.get("locale") ?? "en") as RecipeLocale;
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
    steps: seed.steps.map((text) => makeStep(text)),
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
const watchers = new Map<string, Set<() => void>>();

function notify(id: string): void {
  for (const listener of watchers.get(id) ?? []) listener();
}

function mustGet(id: string): Recipe {
  const recipe = store.get(id);
  if (!recipe) throw new Error(`No such recipe: ${id}`);
  return recipe;
}

function locate(
  itemId: string,
): { recipe: Recipe; role: RecipeSectionRole; index: number } | null {
  for (const recipe of store.values()) {
    for (const role of ["ingredients", "steps", "notes"] as const) {
      const index = recipe[role].findIndex((item) => item.id === itemId);
      if (index >= 0) return { recipe, role, index };
    }
  }
  return null;
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
  // ponytail: convert-from-existing-blocks needs a real Logseq graph; the demo
  // seeds recipes directly instead. Record the convert flow in Logseq itself.
  markExistingRecipe: async (_structure: ExistingRecipeStructure) => undefined,
  listRecipeSummaries: async (): Promise<RecipeSummary[]> =>
    [...store.values()].map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      categories: recipe.categories,
      tags: recipe.tags,
      ...(recipe.prepMinutes ? { prepMinutes: recipe.prepMinutes } : {}),
      ...(recipe.chillMinutes ? { chillMinutes: recipe.chillMinutes } : {}),
      ...(recipe.cookMinutes ? { cookMinutes: recipe.cookMinutes } : {}),
      ingredientTexts: recipe.ingredients.map((item) => item.ingredientText),
    })),
  validateRecipe: async () => ({ valid: true, issues: [] }),
  watchRecipe: (id, listener) => {
    const set = watchers.get(id) ?? new Set();
    set.add(listener);
    watchers.set(id, set);
    return () => set.delete(listener);
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
  updateSectionItem: async (itemId, text) => {
    const found = locate(itemId);
    if (!found) return;
    const { recipe, role, index } = found;
    if (role === "ingredients") {
      recipe.ingredients[index] = { ...makeIngredient(text), id: itemId };
    } else if (role === "steps") {
      recipe.steps[index] = { ...makeStep(text), id: itemId };
    } else {
      recipe.notes[index] = { id: itemId, text };
    }
    notify(recipe.id);
  },
  removeSectionItem: async (itemId) => {
    const found = locate(itemId);
    if (!found) return;
    found.recipe[found.role].splice(found.index, 1);
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
    const { recipe, role } = first;
    const byId = new Map(recipe[role].map((item) => [item.id, item]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((item) => item !== undefined);
    if (reordered.length === recipe[role].length) {
      // biome-ignore lint/suspicious/noExplicitAny: one of three homogeneous section arrays
      (recipe[role] as any[]).splice(0, reordered.length, ...reordered);
    }
    notify(recipe.id);
  },
  deleteRecipe: async (id) => {
    store.delete(id);
  },
};

const controller: DraftRecipeUiController = {
  listRecipes: () => repository.listRecipeSummaries(),
  loadRecipe: (id) => repository.getRecipe(id),
  createRecipe: (input) => repository.createRecipe(input),
  duplicateRecipe: (id) => repository.duplicateRecipe(id),
  commitConversion: (draft: ConversionDraft) =>
    commitRecipeConversion(repository, draft),
  splitOutlineAndConvert: async () => {
    throw new Error("Outline splitting needs a real Logseq graph.");
  },
  resolveCover: async () => null,
  listImageAssets: async () => [],
  saveRecipeMeta: async (id: string, meta: RecipeMeta) => {
    Object.assign(mustGet(id), meta);
    notify(id);
  },
  setCoverPath: async () => undefined,
  clearCover: async () => undefined,
  saveRecipeEdit: (id, patch) => commitRecipeEdit(repository, id, patch),
  deleteRecipe: (id) => repository.deleteRecipe(id),
  watchRecipe: (id, listener) => repository.watchRecipe(id, listener),
  close: () => undefined,
};

document.documentElement.dataset.theme = theme;
createRoot(document.getElementById("app") as HTMLElement).render(
  <DraftRecipeApp
    controller={controller}
    messages={locale === "tr" ? getUiMessages("tr") : enMessages}
    config={{
      initialView: { kind: "recipes" },
      globalMeasurementSystem: sourceMeasurementSystem,
      defaultParserLocale: locale,
      defaultSourceMeasurementSystem: sourceMeasurementSystem,
      themeMode: theme,
    }}
  />,
);
