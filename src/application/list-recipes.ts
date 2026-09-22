import { foldCaseLocaleIndependent } from "../parsing/normalize";
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

export function normalizeSearchText(value: string): string {
  return foldCaseLocaleIndependent(value).replace(/\s+/gu, " ").trim();
}

function matchesSelectedValues(values: string[], selected?: string[]): boolean {
  if (!selected || selected.length === 0) return true;
  const normalizedValues = new Set(values.map(normalizeSearchText));
  return selected.every((value) =>
    normalizedValues.has(normalizeSearchText(value)),
  );
}

function inRange(value: number | undefined, range?: MinuteRange): boolean {
  if (!range) return true;
  if (value === undefined) return false;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

function totalMinutes(recipe: RecipeSummary): number | undefined {
  const values = [recipe.prepMinutes, recipe.chillMinutes, recipe.cookMinutes];
  if (values.every((value) => value === undefined)) return undefined;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function filterRecipeSummaries(
  recipes: readonly RecipeSummary[],
  filter: RecipeFilter,
): RecipeSummary[] {
  const query = filter.query ? normalizeSearchText(filter.query) : "";
  const ingredient = filter.ingredient
    ? normalizeSearchText(filter.ingredient)
    : "";

  return recipes.filter((recipe) => {
    if (query && !normalizeSearchText(recipe.title).includes(query))
      return false;
    if (!matchesSelectedValues(recipe.categories, filter.categories))
      return false;
    if (!matchesSelectedValues(recipe.tags, filter.tags)) return false;

    if (
      ingredient &&
      !recipe.ingredientTexts.some((text) =>
        normalizeSearchText(text).includes(ingredient),
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

export function sortRecipeSummaries(
  recipes: readonly RecipeSummary[],
  sortBy: RecipeSortKey,
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
  sorted.sort((a, b) => a.title.localeCompare(b.title));
  return sorted;
}

export function collectFacetSuggestions(
  recipes: readonly RecipeSummary[],
  facet: "categories" | "tags",
): FacetSuggestion[] {
  const byNormalized = new Map<
    string,
    { value: string; count: number; firstIndex: number }
  >();
  let index = 0;

  for (const recipe of recipes) {
    for (const value of recipe[facet]) {
      const key = normalizeSearchText(value);
      const existing = byNormalized.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byNormalized.set(key, { value, count: 1, firstIndex: index });
      }
      index += 1;
    }
  }

  return [...byNormalized.values()]
    .sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)
    .map(({ value, count }) => ({ value, count }));
}
