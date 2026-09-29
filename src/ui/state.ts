import type {
  ConversionDraft,
  ConversionSourceNode,
} from "../application/convert-recipe";
import type { RecipeEditPatch } from "../application/edit-recipe";
import type { OutlineNode } from "../application/split-outline";
import type {
  ArchivedRecipeSummary,
  NewRecipeInput,
  RecipeSummary,
  TaxonomyExportPlan,
} from "../application/types";
import type { Recipe, RecipeLocale, RecipeMeta } from "../domain/recipe";
import type { MeasurementSystem } from "../domain/unit";

/**
 * How a pasted outline's blocks are rebuilt before it converts: the outline
 * to write under the root, and the existing blocks it replaces.
 */
export interface ConversionRebuild {
  outline: OutlineNode;
  staleChildIds: string[];
}

export type DraftRecipeInitialView =
  | { kind: "recipes" }
  | { kind: "recipe"; recipeId: string }
  | { kind: "create" }
  | {
      kind: "convert";
      source: ConversionSourceNode;
      draft: ConversionDraft;
      // Set when the recipe's language was picked from its own headings/labels.
      detectedLocale?: RecipeLocale;
      // Set when the blocks must be rebuilt first (a paste Logseq split along
      // the wrong lines): `source` previews the rebuilt outline, and nothing
      // is written until the conversion is confirmed.
      rebuild?: ConversionRebuild;
    }
  // Import from Text; `text` refills the box when returning from its preview.
  | { kind: "import-text"; text?: string }
  // `inside`: the block converted is a line of that recipe.
  | { kind: "already-recipe"; recipeId: string; title: string; inside?: true };

export interface DraftRecipeUiController {
  listRecipes(options?: { fresh?: boolean }): Promise<RecipeSummary[]>;
  listArchivedRecipes(): Promise<ArchivedRecipeSummary[]>;
  loadRecipe(id: string): Promise<Recipe | null>;
  createRecipe(input: NewRecipeInput): Promise<Recipe>;
  duplicateRecipe(id: string): Promise<Recipe>;
  commitConversion(draft: ConversionDraft): Promise<void>;
  // Rebuilds the blocks as previewed, then commits the conversion.
  commitRebuiltConversion(
    rebuild: ConversionRebuild,
    draft: ConversionDraft,
  ): Promise<void>;
  // Writes an imported recipe's blocks, then commits the conversion its
  // preview settled (made before anything was written). Returns its id.
  commitImportedRecipe(
    outline: OutlineNode,
    draft: ConversionDraft,
  ): Promise<string>;
  // Takes a Recipe or a RecipeSummary: only the cover reference is read.
  resolveCover(recipe: Pick<Recipe, "cover">): Promise<string | null>;
  listImageAssets(): Promise<string[]>;
  listStepMediaAssets?(): Promise<string[]>;
  resolveAssetUrl?(path: string): Promise<string | null>;
  saveRecipeMeta(id: string, meta: RecipeMeta): Promise<void>;
  // Absent where the graph can't hold the category and tag properties.
  planTaxonomyExport?(): Promise<TaxonomyExportPlan>;
  /** Copies every recipe's categories and tags; how many recipes changed. */
  exportTaxonomy?(): Promise<number>;
  setCoverPath(id: string, path: string): Promise<void>;
  clearCover(id: string): Promise<void>;
  saveRecipeEdit(id: string, patch: RecipeEditPatch): Promise<void>;
  canMoveToRecipeLibrary(id: string): Promise<boolean>;
  moveToRecipeLibrary(id: string): Promise<void>;
  archiveRecipe(id: string): Promise<void>;
  restoreRecipe(id: string): Promise<void>;
  deleteArchivedRecipe(id: string): Promise<void>;
  openInLogseq(id: string): void;
  watchRecipe?(id: string, listener: () => void): () => void;
  close(): void;
}

export interface DraftRecipeAppConfig {
  initialView: DraftRecipeInitialView;
  globalMeasurementSystem: MeasurementSystem;
  defaultParserLocale: RecipeLocale;
  defaultSourceMeasurementSystem: MeasurementSystem;
  themeMode?: "light" | "dark";
  /** Stable current-graph identity; scopes resumable Cooking Mode state. */
  graphKey?: string;
  themeCssProperties?: Record<string, string>;
}
