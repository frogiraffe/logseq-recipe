import type { ConversionDraft } from "../application/convert-recipe";
import type { RecipeEditPatch } from "../application/edit-recipe";
import type { NewRecipeInput, RecipeSummary } from "../application/types";
import type { Recipe, RecipeLocale, RecipeMeta } from "../domain/recipe";
import type { MeasurementSystem } from "../domain/unit";

export type DraftRecipeInitialView =
  | { kind: "recipes" }
  | { kind: "recipe"; recipeId: string }
  | { kind: "create" }
  | { kind: "convert"; draft: ConversionDraft }
  | { kind: "already-recipe"; recipeId: string; title: string };

export interface DraftRecipeUiController {
  listRecipes(): Promise<RecipeSummary[]>;
  loadRecipe(id: string): Promise<Recipe | null>;
  createRecipe(input: NewRecipeInput): Promise<Recipe>;
  duplicateRecipe(id: string): Promise<Recipe>;
  commitConversion(draft: ConversionDraft): Promise<void>;
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
