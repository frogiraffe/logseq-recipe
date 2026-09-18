import type { IngredientScaleMode, Recipe } from "../domain/recipe";
import type {
  ExistingRecipeStructure,
  NewRecipeInput,
  RecipeSectionRole,
  RecipeSummary,
  ValidationResult,
} from "./types";

export interface RecipeRepository {
  getRecipe(id: string): Promise<Recipe | null>;
  createRecipe(input: NewRecipeInput): Promise<Recipe>;
  duplicateRecipe(id: string): Promise<Recipe>;
  markExistingRecipe(structure: ExistingRecipeStructure): Promise<void>;
  listRecipeSummaries(): Promise<RecipeSummary[]>;
  validateRecipe(id: string): Promise<ValidationResult>;
  watchRecipe(id: string, listener: () => void): () => void;
  renameRecipe(id: string, title: string): Promise<void>;
  updateRecipeFields(
    id: string,
    patch: {
      baseYield?: number;
      yieldUnit?: string;
      prepMinutes?: number;
      chillMinutes?: number;
      cookMinutes?: number;
      sourceUrl?: string;
    },
  ): Promise<void>;
  addSectionItem(
    recipeId: string,
    role: RecipeSectionRole,
    text: string,
  ): Promise<string>;
  updateSectionItem(itemId: string, text: string): Promise<void>;
  removeSectionItem(itemId: string): Promise<void>;
  setIngredientScaleMode(
    id: string,
    scaleMode: IngredientScaleMode,
  ): Promise<void>;
  reorderSectionItems(orderedIds: string[]): Promise<void>;
  deleteRecipe(id: string): Promise<void>;
}
