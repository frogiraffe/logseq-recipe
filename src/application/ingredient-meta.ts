import type { Quantity } from "../domain/quantity";
import type { RecipeLocale } from "../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import type { ParseContext } from "../parsing/context";
import type { ParseConfidence, ParsedIngredient } from "../parsing/ingredient";
import {
  COUNT_UNITS,
  LINEAR_UNIT_DEFINITIONS,
  TEMPERATURE_UNITS,
} from "../units/definitions";

// Derived from the unit definitions, never listed by hand: a hand-kept list
// silently rejected every stored su bardağı / çay bardağı / tatlı kaşığı
// line, discarding its Convert Preview correction on the next load.
function isCanonicalUnit(value: string): value is CanonicalUnit {
  return (
    value in LINEAR_UNIT_DEFINITIONS ||
    COUNT_UNITS.has(value as CanonicalUnit) ||
    TEMPERATURE_UNITS.has(value as CanonicalUnit)
  );
}

const CONFIDENCES = new Set<ParseConfidence>(["exact", "partial", "unparsed"]);
const LOCALES = new Set<RecipeLocale>(["en", "tr", "fr", "de", "es"]);
const MEASUREMENT_SYSTEMS = new Set<MeasurementSystem>([
  "metric",
  "us",
  "imperial",
]);

export interface StoredIngredientMeta {
  version: 1;
  locale: RecipeLocale;
  sourceMeasurementSystem: MeasurementSystem;
  parsed: ParsedIngredient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function decodeQuantity(value: unknown): Quantity | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;

  if (
    value.kind === "exact" ||
    value.kind === "minimum" ||
    value.kind === "maximum" ||
    value.kind === "approximate"
  ) {
    return finiteNumber(value.value)
      ? { kind: value.kind, value: value.value }
      : null;
  }

  if (value.kind === "range") {
    return finiteNumber(value.min) && finiteNumber(value.max)
      ? { kind: "range", min: value.min, max: value.max }
      : null;
  }

  if (value.kind === "inexact") {
    return typeof value.expression === "string" && value.expression.trim()
      ? { kind: "inexact", expression: value.expression }
      : null;
  }

  return null;
}

function decodeParsedIngredient(value: unknown): ParsedIngredient | null {
  if (!isRecord(value)) return null;
  if (typeof value.rawText !== "string") return null;
  if (typeof value.ingredientText !== "string") return null;
  if (
    typeof value.confidence !== "string" ||
    !CONFIDENCES.has(value.confidence as ParseConfidence)
  ) {
    return null;
  }

  const amount =
    value.amount === undefined ? undefined : decodeQuantity(value.amount);
  if (value.amount !== undefined && !amount) return null;

  const unit =
    value.unit === undefined
      ? undefined
      : typeof value.unit === "string" && isCanonicalUnit(value.unit)
        ? value.unit
        : null;
  if (unit === null) return null;

  const note =
    value.note === undefined
      ? undefined
      : typeof value.note === "string"
        ? value.note
        : null;
  if (note === null) return null;

  return {
    rawText: value.rawText,
    ...(amount ? { amount } : {}),
    ...(unit ? { unit } : {}),
    ingredientText: value.ingredientText,
    ...(note ? { note } : {}),
    confidence: value.confidence as ParseConfidence,
  };
}

function parseRaw(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function encodeIngredientMeta(
  parsed: ParsedIngredient,
  context: ParseContext,
): string {
  const stored: StoredIngredientMeta = {
    version: 1,
    locale: context.locale,
    sourceMeasurementSystem: context.sourceMeasurementSystem,
    parsed,
  };
  return JSON.stringify(stored);
}

export function decodeIngredientMeta(
  raw: unknown,
): StoredIngredientMeta | null {
  const value = parseRaw(raw);
  if (!isRecord(value) || value.version !== 1) return null;
  if (
    typeof value.locale !== "string" ||
    !LOCALES.has(value.locale as RecipeLocale)
  ) {
    return null;
  }
  if (
    typeof value.sourceMeasurementSystem !== "string" ||
    !MEASUREMENT_SYSTEMS.has(value.sourceMeasurementSystem as MeasurementSystem)
  ) {
    return null;
  }
  const parsed = decodeParsedIngredient(value.parsed);
  if (!parsed) return null;

  return {
    version: 1,
    locale: value.locale as RecipeLocale,
    sourceMeasurementSystem: value.sourceMeasurementSystem as MeasurementSystem,
    parsed,
  };
}

export function ingredientMetaMatchesContext(
  meta: StoredIngredientMeta,
  rawText: string,
  context: ParseContext,
): boolean {
  return (
    meta.parsed.rawText === rawText &&
    meta.locale === context.locale &&
    meta.sourceMeasurementSystem === context.sourceMeasurementSystem
  );
}
