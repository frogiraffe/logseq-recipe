import type { CoverRef, RecipeLocale } from "../domain/recipe";
import type { MeasurementSystem } from "../domain/unit";
import type { ParsedIngredient } from "../parsing/ingredient";

export interface NewRecipeInput {
  title: string;
  baseYield: number;
  yieldUnit?: string;
  locale?: RecipeLocale;
  sourceMeasurementSystem?: MeasurementSystem;
  measurementSystemOverride?: MeasurementSystem;
}

export interface RecipeSummary {
  id: string;
  title: string;
  categories: string[];
  tags: string[];
  prepMinutes?: number;
  chillMinutes?: number;
  cookMinutes?: number;
  ingredientTexts: string[];
  cover?: CoverRef;
  // Full-text search only; absent on summaries built before they existed.
  stepTexts?: string[];
  noteTexts?: string[];
}

export interface ArchivedRecipeSummary extends RecipeSummary {
  archivedAt?: number;
}

export interface ValidationIssue {
  severity: "warning" | "error";
  code: string;
  message: string;
  blockId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export const RECIPE_SECTION_ROLES = ["ingredients", "steps", "notes"] as const;
export type RecipeSectionRole = (typeof RECIPE_SECTION_ROLES)[number];

export interface ExistingRecipeStructure {
  rootId: string;
  locale?: RecipeLocale;
  sourceMeasurementSystem?: MeasurementSystem;
  baseYield?: number;
  yieldUnit?: string;
  prepMinutes?: number;
  chillMinutes?: number;
  cookMinutes?: number;
  sourceUrl?: string;
  sectionRoles: Array<{
    blockId: string;
    role: RecipeSectionRole;
  }>;
  ingredientMetadata?: Array<{
    blockId: string;
    parsed: ParsedIngredient;
  }>;
}

/**
 * One top-level line of an Ingredients section: an ingredient, or a group
 * heading (`items` set) with its ingredients nested under it, in order.
 */
export interface IngredientLayoutEntry {
  id: string;
  items?: string[];
}
