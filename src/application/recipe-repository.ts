import type { IngredientScaleMode, Recipe } from "../domain/recipe";
import type {
  ArchivedRecipeSummary,
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
  /** `fresh` skips cached summaries (an explicit user refresh). */
  listRecipeSummaries(options?: { fresh?: boolean }): Promise<RecipeSummary[]>;
  listArchivedRecipeSummaries(): Promise<ArchivedRecipeSummary[]>;
  validateRecipe(id: string): Promise<ValidationResult>;
  watchRecipe(id: string, listener: () => void): () => void;
  renameRecipe(id: string, title: string): Promise<void>;
  updateRecipeFields(
    id: string,
    patch: {
      baseYield?: number;
      yieldUnit?: string | null;
      prepMinutes?: number | null;
      chillMinutes?: number | null;
      cookMinutes?: number | null;
      sourceUrl?: string | null;
    },
  ): Promise<void>;
  addSectionItem(
    recipeId: string,
    role: RecipeSectionRole,
    text: string,
  ): Promise<string>;
  addStepChild(stepId: string, text: string): Promise<string>;
  updateSectionItem(itemId: string, text: string): Promise<void>;
  removeSectionItem(itemId: string): Promise<void>;
  setIngredientScaleMode(
    id: string,
    scaleMode: IngredientScaleMode,
  ): Promise<void>;
  reorderSectionItems(orderedIds: string[]): Promise<void>;
  archiveRecipe(id: string): Promise<void>;
  restoreRecipe(id: string): Promise<void>;
  deleteArchivedRecipe(id: string): Promise<void>;
  /** Rejects a title renameRecipe would refuse, without writing anything. */
  validateRename(id: string, title: string): Promise<void>;
}
