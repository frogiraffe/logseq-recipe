export const PHASE0_PROBE_PREFIX = "__draft_recipe_probe_";

export function phase0ProbeKey(suffix: string, runId: string): string {
  return `${PHASE0_PROBE_PREFIX}${runId}_${suffix}`;
}

export const PROPERTY_KEYS = {
  recipeMarker: "recipe_marker",
  schemaVersion: "schema_version",
  baseYield: "base_yield",
  yieldUnit: "yield_unit",
  prepMinutes: "prep_minutes",
  chillMinutes: "chill_minutes",
  cookMinutes: "cook_minutes",
  sourceUrl: "source_url",
  recipeMeta: "recipe_meta",
  ingredientMeta: "ingredient_meta",
  coverRef: "cover_ref",
  sectionRole: "section_role",
  scaleMode: "scale_mode",
} as const;

export type RecipePropertyKey =
  (typeof PROPERTY_KEYS)[keyof typeof PROPERTY_KEYS];
