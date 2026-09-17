import type { Recipe } from "../domain/recipe";
import type { ValidationIssue, ValidationResult } from "./types";

export function validateLoadedRecipe(recipe: Recipe): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!recipe.title.trim()) {
    issues.push({
      severity: "error",
      code: "missing-title",
      message: "Recipe title is required.",
    });
  }
  if (!Number.isFinite(recipe.baseYield) || recipe.baseYield <= 0) {
    issues.push({
      severity: "error",
      code: "invalid-base-yield",
      message: "Recipe base yield must be a positive number.",
    });
  }
  if (recipe.schemaVersion < 1) {
    issues.push({
      severity: "warning",
      code: "legacy-schema",
      message:
        "Recipe metadata predates the current schema and may require migration.",
    });
  }
  if (recipe.ingredients.length === 0) {
    issues.push({
      severity: "warning",
      code: "missing-ingredients",
      message: "Recipe has no ingredient blocks.",
    });
  }
  if (recipe.steps.length === 0) {
    issues.push({
      severity: "warning",
      code: "missing-steps",
      message: "Recipe has no step blocks.",
    });
  }

  for (const ingredient of recipe.ingredients) {
    if (!ingredient.amount) {
      issues.push({
        severity: "warning",
        code: "ingredient-amount-unparsed",
        message: `No numeric amount was parsed from: ${ingredient.rawText}`,
        blockId: ingredient.id,
      });
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}
