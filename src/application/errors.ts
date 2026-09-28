import type { RecipeSectionRole } from "./types";

export type RecipeErrorCode =
  | "title-required"
  | "title-taken"
  | "page-title-taken"
  | "base-yield-invalid"
  | "time-invalid"
  | "recipe-not-found"
  | "section-missing"
  | "recipe-invalid";

/**
 * A failure the interface explains in its own language, from `code` and
 * `detail` (a title, a section role, validation notes). `message` stays
 * English, for logs.
 */
export class RecipeError extends Error {
  constructor(
    readonly code: RecipeErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "RecipeError";
  }
}

export function recipeNotFound(id: string): RecipeError {
  return new RecipeError("recipe-not-found", `Recipe not found: ${id}`);
}

export function titleTaken(title: string): RecipeError {
  return new RecipeError(
    "title-taken",
    `A recipe named "${title}" already exists.`,
    title,
  );
}

export function sectionMissing(role: RecipeSectionRole): RecipeError {
  return new RecipeError(
    "section-missing",
    `Recipe is missing its ${role} section.`,
    role,
  );
}
