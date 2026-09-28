import type {
  IngredientConversionOverride,
  RecipeMeta,
  VolumeConversionUnit,
} from "../domain/recipe";
import { isMeasurementSystem } from "../domain/unit";
import { isRecipeLocale } from "../parsing/locales";

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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A stored property's JSON: string values are parsed, unreadable ones null. */
export function parseStoredJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
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

export function decodeRecipeMeta(raw: unknown): RecipeMeta {
  const parsed = parseStoredJson(raw);
  if (!isRecord(parsed)) return emptyRecipeMeta();

  const { parserLocale, sourceMeasurementSystem, measurementSystemOverride } =
    parsed;
  return {
    categories: stringArray(parsed.categories),
    tags: stringArray(parsed.tags),
    ...(isRecipeLocale(parserLocale) ? { parserLocale } : {}),
    ...(isMeasurementSystem(sourceMeasurementSystem)
      ? { sourceMeasurementSystem }
      : {}),
    ...(isMeasurementSystem(measurementSystemOverride)
      ? { measurementSystemOverride }
      : {}),
    ingredientConversionOverrides: conversionOverrides(
      parsed.ingredientConversionOverrides,
    ),
  };
}

export function encodeRecipeMeta(meta: RecipeMeta): string {
  return JSON.stringify(meta);
}
