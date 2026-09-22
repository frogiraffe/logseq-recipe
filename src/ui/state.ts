import type {
  ConversionDraft,
  ConversionSourceNode,
} from "../application/convert-recipe";
import type { RecipeEditPatch } from "../application/edit-recipe";
import type { OutlineNode } from "../application/split-outline";
import type { NewRecipeInput, RecipeSummary } from "../application/types";
import type { Recipe, RecipeLocale, RecipeMeta } from "../domain/recipe";
import type { MeasurementSystem } from "../domain/unit";

export type DraftRecipeInitialView =
  | { kind: "recipes" }
  | { kind: "recipe"; recipeId: string }
  | { kind: "create" }
  | { kind: "convert"; source: ConversionSourceNode; draft: ConversionDraft }
  // A conversion target whose direct children (if any) are all flat
  // leaves with no nesting of their own - the common paste failure,
  // whether Logseq left the whole outline in one block, or chunked it
  // into a handful of flat sibling blocks without ever nesting anything.
  // `staleChildIds` are those existing flat children (empty when there
  // were none at all) that get removed once split into a real, properly
  // nested tree under the same root. Offers this instead of opening
  // Convert on an empty draft or failing with "select a recipe root
  // block/page".
  | {
      kind: "convert-needs-split";
      uuid: string;
      outline: OutlineNode;
      staleChildIds: string[];
    }
  | { kind: "already-recipe"; recipeId: string; title: string };

export interface DraftRecipeUiController {
  listRecipes(): Promise<RecipeSummary[]>;
  loadRecipe(id: string): Promise<Recipe | null>;
  createRecipe(input: NewRecipeInput): Promise<Recipe>;
  duplicateRecipe(id: string): Promise<Recipe>;
  commitConversion(draft: ConversionDraft): Promise<void>;
  splitOutlineAndConvert(
    uuid: string,
    outline: OutlineNode,
    staleChildIds: string[],
  ): Promise<DraftRecipeInitialView>;
  resolveCover(recipe: Recipe): Promise<string | null>;
  listImageAssets(): Promise<string[]>;
  saveRecipeMeta(id: string, meta: RecipeMeta): Promise<void>;
  setCoverPath(id: string, path: string): Promise<void>;
  clearCover(id: string): Promise<void>;
  saveRecipeEdit(id: string, patch: RecipeEditPatch): Promise<void>;
  deleteRecipe(id: string): Promise<void>;
  watchRecipe?(id: string, listener: () => void): () => void;
  close(): void;
}

export interface DraftRecipeAppConfig {
  initialView: DraftRecipeInitialView;
  globalMeasurementSystem: MeasurementSystem;
  defaultParserLocale: RecipeLocale;
  defaultSourceMeasurementSystem: MeasurementSystem;
  themeMode?: "light" | "dark";
  themeCssProperties?: Record<string, string>;
}
