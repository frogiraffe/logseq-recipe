import type { Recipe } from "../domain/recipe";
import { foldCaseLocaleIndependent, foldLabel } from "../parsing/normalize";
import type { RecipeSummary } from "./types";

export interface MinuteRange {
  min?: number;
  max?: number;
}

export interface RecipeFilter {
  query?: string;
  categories?: string[];
  tags?: string[];
  ingredient?: string;
  prepMinutes?: MinuteRange;
  cookMinutes?: MinuteRange;
  totalMinutes?: MinuteRange;
}

export interface FacetSuggestion {
  value: string;
  count: number;
}

/** A recipe as the Recipes browser lists and searches it. */
export function recipeSummary(recipe: Recipe): RecipeSummary {
  return {
    id: recipe.id,
    title: recipe.title,
    categories: recipe.categories,
    tags: recipe.tags,
    ...(recipe.prepMinutes !== undefined
      ? { prepMinutes: recipe.prepMinutes }
      : {}),
    ...(recipe.chillMinutes !== undefined
      ? { chillMinutes: recipe.chillMinutes }
      : {}),
    ...(recipe.cookMinutes !== undefined
      ? { cookMinutes: recipe.cookMinutes }
      : {}),
    ingredientTexts: recipe.ingredients.map(
      (ingredient) => ingredient.ingredientText,
    ),
    ...(recipe.cover ? { cover: recipe.cover } : {}),
    stepTexts: recipe.steps.map((step) => step.rawText),
    noteTexts: [
      ...recipe.notes.map((note) => note.text),
      ...recipe.steps.flatMap((step) =>
        (step.children ?? [])
          .filter((child) => child.kind === "note")
          .map((child) => child.text),
      ),
      ...new Set(
        recipe.ingredients.flatMap((ingredient) =>
          ingredient.group ? [ingredient.group.title] : [],
        ),
      ),
      ...recipe.ingredients.flatMap((ingredient) => ingredient.details ?? []),
    ],
  };
}

/** Two recipe titles that read the same, ignoring case ("KEK" = "kek"). */
export function sameTitle(a: string, b: string): boolean {
  return (
    foldCaseLocaleIndependent(a.trim()) === foldCaseLocaleIndependent(b.trim())
  );
}

// Search compares folded text: accent-free and case-free, so "sut" finds
// "süt" and "creme" finds "Crème" in every language.
function matchesSelectedValues(values: string[], selected?: string[]): boolean {
  if (!selected || selected.length === 0) return true;
  const normalizedValues = new Set(values.map(foldLabel));
  return selected.every((value) => normalizedValues.has(foldLabel(value)));
}

// Every whitespace-separated query term must appear in some field; one
// newline-joined string keeps a term from matching across two fields.
function searchHaystack(recipe: RecipeSummary): string {
  return foldLabel(
    [
      recipe.title,
      ...recipe.categories,
      ...recipe.tags,
      ...recipe.ingredientTexts,
      ...(recipe.stepTexts ?? []),
      ...(recipe.noteTexts ?? []),
    ].join("\n"),
  );
}

/** A time range with a bound set; clearing both inputs leaves `{}` behind. */
export function isRangeSet(range?: MinuteRange): range is MinuteRange {
  return range?.min !== undefined || range?.max !== undefined;
}

function inRange(value: number | undefined, range?: MinuteRange): boolean {
  if (!isRangeSet(range)) return true;
  if (value === undefined) return false;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

/** Prep + chill + cook, or undefined when none of them is known. */
export function totalMinutes(
  recipe: Pick<RecipeSummary, "prepMinutes" | "chillMinutes" | "cookMinutes">,
): number | undefined {
  const values = [recipe.prepMinutes, recipe.chillMinutes, recipe.cookMinutes];
  if (values.every((value) => value === undefined)) return undefined;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function filterRecipeSummaries(
  recipes: readonly RecipeSummary[],
  filter: RecipeFilter,
): RecipeSummary[] {
  const terms = filter.query
    ? foldLabel(filter.query).split(" ").filter(Boolean)
    : [];
  const ingredient = filter.ingredient ? foldLabel(filter.ingredient) : "";

  return recipes.filter((recipe) => {
    if (terms.length > 0) {
      const haystack = searchHaystack(recipe);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    if (!matchesSelectedValues(recipe.categories, filter.categories))
      return false;
    if (!matchesSelectedValues(recipe.tags, filter.tags)) return false;

    if (
      ingredient &&
      !recipe.ingredientTexts.some((text) =>
        foldLabel(text).includes(ingredient),
      )
    ) {
      return false;
    }

    if (!inRange(recipe.prepMinutes, filter.prepMinutes)) return false;
    if (!inRange(recipe.cookMinutes, filter.cookMinutes)) return false;
    if (!inRange(totalMinutes(recipe), filter.totalMinutes)) return false;

    return true;
  });
}

export type RecipeSortKey = "title" | "totalTime";

/** `locale` orders titles the way that language's alphabet does. */
export function sortRecipeSummaries(
  recipes: readonly RecipeSummary[],
  sortBy: RecipeSortKey,
  locale?: string,
): RecipeSummary[] {
  const sorted = [...recipes];
  if (sortBy === "totalTime") {
    sorted.sort((a, b) => {
      const aTotal = totalMinutes(a);
      const bTotal = totalMinutes(b);
      if (aTotal === undefined && bTotal === undefined) return 0;
      if (aTotal === undefined) return 1;
      if (bTotal === undefined) return -1;
      return aTotal - bTotal;
    });
    return sorted;
  }
  sorted.sort((a, b) => a.title.localeCompare(b.title, locale));
  return sorted;
}

export function collectFacetSuggestions(
  recipes: readonly RecipeSummary[],
  facet: "categories" | "tags",
): FacetSuggestion[] {
  const byNormalized = new Map<string, FacetSuggestion>();
  for (const recipe of recipes) {
    for (const value of recipe[facet]) {
      const key = foldLabel(value);
      const existing = byNormalized.get(key);
      if (existing) existing.count += 1;
      else byNormalized.set(key, { value, count: 1 });
    }
  }
  // Ties keep first-seen order: a Map iterates in insertion order and
  // Array.prototype.sort is stable.
  return [...byNormalized.values()].sort((a, b) => b.count - a.count);
}
