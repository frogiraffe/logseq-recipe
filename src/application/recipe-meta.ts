import type {
  IngredientConversionOverride,
  RecipeLocale,
  RecipeMeta,
  VolumeConversionUnit,
} from "../domain/recipe";
import type { MeasurementSystem } from "../domain/unit";

const RECIPE_LOCALES = new Set<RecipeLocale>(["en", "tr", "fr", "de", "es"]);
const MEASUREMENT_SYSTEMS = new Set<MeasurementSystem>([
  "metric",
  "us",
  "imperial",
]);
const VOLUME_UNITS = new Set<VolumeConversionUnit>([
  "ml",
  "tsp_metric",
  "tbsp_metric",
  "cup_metric",
  "tsp_us",
  "tbsp_us",
  "cup_us",
  "tsp_imperial",
  "tbsp_imperial",
  "cup_imperial",
]);

export function emptyRecipeMeta(): RecipeMeta {
  return {
    categories: [],
    tags: [],
    ingredientConversionOverrides: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function recipeLocale(value: unknown): RecipeLocale | undefined {
  return typeof value === "string" && RECIPE_LOCALES.has(value as RecipeLocale)
    ? (value as RecipeLocale)
    : undefined;
}

function measurementSystem(value: unknown): MeasurementSystem | undefined {
  return typeof value === "string" &&
    MEASUREMENT_SYSTEMS.has(value as MeasurementSystem)
    ? (value as MeasurementSystem)
    : undefined;
}

function conversionOverride(
  value: unknown,
): IngredientConversionOverride | null {
  if (!isRecord(value)) return null;
  const ingredientKey =
    typeof value.ingredientKey === "string" ? value.ingredientKey.trim() : "";
  const volumeUnit = value.volumeUnit;
  const gramsPerVolumeUnit = value.gramsPerVolumeUnit;

  if (!ingredientKey) return null;
  if (value.massUnit !== "g") return null;
  if (
    typeof volumeUnit !== "string" ||
    !VOLUME_UNITS.has(volumeUnit as VolumeConversionUnit)
  ) {
    return null;
  }
  if (
    typeof gramsPerVolumeUnit !== "number" ||
    !Number.isFinite(gramsPerVolumeUnit) ||
    gramsPerVolumeUnit <= 0
  ) {
    return null;
  }

  return {
    ingredientKey,
    massUnit: "g",
    volumeUnit: volumeUnit as VolumeConversionUnit,
    gramsPerVolumeUnit,
  };
}

function conversionOverrides(value: unknown): IngredientConversionOverride[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = conversionOverride(item);
    return parsed ? [parsed] : [];
  });
}

function parseRawMeta(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function decodeRecipeMeta(raw: unknown): RecipeMeta {
  const parsed = parseRawMeta(raw);
  if (!isRecord(parsed)) return emptyRecipeMeta();

  const parserLocaleValue = recipeLocale(parsed.parserLocale);
  const sourceMeasurementSystem = measurementSystem(
    parsed.sourceMeasurementSystem,
  );
  const measurementSystemOverride = measurementSystem(
    parsed.measurementSystemOverride,
  );

  return {
    categories: stringArray(parsed.categories),
    tags: stringArray(parsed.tags),
    ...(parserLocaleValue ? { parserLocale: parserLocaleValue } : {}),
    ...(sourceMeasurementSystem ? { sourceMeasurementSystem } : {}),
    ...(measurementSystemOverride ? { measurementSystemOverride } : {}),
    ingredientConversionOverrides: conversionOverrides(
      parsed.ingredientConversionOverrides,
    ),
  };
}

export function encodeRecipeMeta(meta: RecipeMeta): string {
  return JSON.stringify(meta);
}
