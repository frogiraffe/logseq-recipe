export const PROPERTY_KEYS = {
  recipeMarker: "recipe_marker",
  archivedMarker: "recipe_archived",
  archivedAt: "recipe_archived_at",
  librarySectionRole: "recipe_library_section",
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
