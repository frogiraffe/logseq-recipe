import type { Quantity } from "../domain/quantity";
import type { Ingredient } from "../domain/recipe";
import { scaleIngredient } from "../domain/scaling";
import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import {
  convertIngredientMassVolume,
  convertUnit,
  displayUnitForSystem,
  unitFamily,
} from "../units/convert";
import {
  formatLocalizedNumber,
  type UiLocale,
  unitLabel,
} from "../units/format";
import type { IngredientConversionProvider } from "../units/ingredient-registry";

const MASS_UNITS: readonly CanonicalUnit[] = ["mg", "g", "kg", "oz_mass", "lb"];
const VOLUME_UNITS: readonly CanonicalUnit[] = [
  "ml",
  "l",
  "tsp_metric",
  "tbsp_metric",
  "cup_metric",
  "tsp_us",
  "tbsp_us",
  "cup_us",
  "fl_oz_us",
  "tsp_imperial",
  "tbsp_imperial",
  "cup_imperial",
  "fl_oz_imperial",
];

function mapNumericQuantity(
  quantity: Quantity,
  convert: (value: number) => number,
): Quantity {
  switch (quantity.kind) {
    case "exact":
    case "minimum":
    case "maximum":
    case "approximate":
      return { ...quantity, value: convert(quantity.value) };
    case "range":
      return {
        kind: "range",
        min: convert(quantity.min),
        max: convert(quantity.max),
      };
    case "inexact":
      return quantity;
  }
}

export function formatQuantity(
  quantity: Quantity,
  locale: UiLocale = "en",
): string {
  const number = (value: number) => formatLocalizedNumber(value, locale);
  switch (quantity.kind) {
    case "exact":
      return number(quantity.value);
    case "range":
      return `${number(quantity.min)}–${number(quantity.max)}`;
    case "minimum":
      return `≥${number(quantity.value)}`;
    case "maximum":
      return `≤${number(quantity.value)}`;
    case "approximate":
      return `~${number(quantity.value)}`;
    case "inexact":
      return quantity.expression;
  }
}

function representativeCount(quantity: Quantity): number | undefined {
  switch (quantity.kind) {
    case "exact":
    case "minimum":
    case "maximum":
    case "approximate":
      return quantity.value;
    case "range":
      return quantity.max;
    case "inexact":
      return undefined;
  }
}

function visibleUnitText(
  unit: CanonicalUnit | undefined,
  quantity: Quantity,
  locale: UiLocale,
): string {
  // `egg`'s own source word (e.g. "eggs") is preserved directly in
  // ingredientText (see ingredient.ts's egg-specific offset handling), so
  // showing the unit label too would duplicate it. Every other count unit
  // (piece, clove, slice, pinch) needs a separate ingredient noun after it
  // ("2 pieces chicken") and must keep its own label or the word is lost
  // entirely, not just deduplicated.
  if (!unit || unit === "egg") return "";
  return ` ${unitLabel(unit, locale, representativeCount(quantity))}`;
}

function representativeMagnitude(quantity: Quantity): number {
  switch (quantity.kind) {
    case "exact":
    case "minimum":
    case "maximum":
    case "approximate":
      return Math.abs(quantity.value);
    case "range":
      return Math.max(Math.abs(quantity.min), Math.abs(quantity.max));
    case "inexact":
      return 0;
  }
}

// Bumping 1500 g to 1.5 kg (or 1000 ml to 1 L) is a same-family, same-system
// step up in scale, not a measurement-system change - it only applies to
// the plain metric base units (g, ml), and only when nothing has already
// picked a specific display unit for this ingredient (see
// formatIngredientForTargetUnit, the explicit-override path, which never
// calls this).
function adaptiveMetricUnit(unit: CanonicalUnit): CanonicalUnit | null {
  if (unit === "g") return "kg";
  if (unit === "ml") return "l";
  return null;
}

function applyAdaptiveDisplay(
  quantity: Quantity,
  unit: CanonicalUnit,
): { quantity: Quantity; unit: CanonicalUnit } {
  const bigger = adaptiveMetricUnit(unit);
  if (!bigger || representativeMagnitude(quantity) < 1000) {
    return { quantity, unit };
  }
  return {
    quantity: mapNumericQuantity(quantity, (value) =>
      convertUnit(value, unit, bigger),
    ),
    unit: bigger,
  };
}

function displayQuantityAndUnit(
  quantity: Quantity,
  unit: CanonicalUnit | undefined,
  system: MeasurementSystem,
): { quantity: Quantity; unit?: CanonicalUnit } {
  if (!unit || quantity.kind === "inexact") {
    return { quantity, ...(unit ? { unit } : {}) };
  }
  const targetUnit = displayUnitForSystem(unit, system);
  const converted =
    targetUnit === unit
      ? quantity
      : mapNumericQuantity(quantity, (value) =>
          convertUnit(value, unit, targetUnit),
        );
  return applyAdaptiveDisplay(converted, targetUnit);
}

/** An ingredient line split for a quantity column: "225 g" + "butter". */
export interface IngredientDisplayParts {
  quantity: string;
  name: string;
}

export function joinIngredientParts({
  quantity,
  name,
}: IngredientDisplayParts): string {
  return `${quantity}${quantity && name ? " " : ""}${name}`.trim();
}

function formatIngredientParts(
  ingredient: Ingredient,
  quantity: Quantity,
  unit: CanonicalUnit | undefined,
  locale: UiLocale,
): IngredientDisplayParts {
  const note = ingredient.note ? ` (${ingredient.note})` : "";
  return {
    quantity:
      `${formatQuantity(quantity, locale)}${visibleUnitText(unit, quantity, locale)}`.trim(),
    name: `${ingredient.ingredientText.trim()}${note}`.trim(),
  };
}

export function ingredientDisplayParts(
  ingredient: Ingredient,
  baseYield: number,
  targetYield: number,
  system: MeasurementSystem,
  locale: UiLocale = "en",
): IngredientDisplayParts {
  const scaled = scaleIngredient(ingredient, baseYield, targetYield);
  // No parsed amount: the written line is shown whole, nothing to align.
  if (!scaled.amount) return { quantity: "", name: scaled.rawText };

  const display = displayQuantityAndUnit(scaled.amount, scaled.unit, system);
  return formatIngredientParts(scaled, display.quantity, display.unit, locale);
}

export function formatIngredientForDisplay(
  ingredient: Ingredient,
  baseYield: number,
  targetYield: number,
  system: MeasurementSystem,
  locale: UiLocale = "en",
): string {
  return joinIngredientParts(
    ingredientDisplayParts(ingredient, baseYield, targetYield, system, locale),
  );
}

export function ingredientDisplayUnitOptions(
  ingredient: Ingredient,
  provider: IngredientConversionProvider,
): CanonicalUnit[] {
  if (!ingredient.unit) return [];
  const family = unitFamily(ingredient.unit);
  if (family === "mass") {
    return provider.find(ingredient.ingredientText)
      ? [...MASS_UNITS, ...VOLUME_UNITS]
      : [...MASS_UNITS];
  }
  if (family === "volume") {
    return provider.find(ingredient.ingredientText)
      ? [...VOLUME_UNITS, ...MASS_UNITS]
      : [...VOLUME_UNITS];
  }
  return [ingredient.unit];
}

const UNIT_SYSTEM_SUFFIXES: Record<
  Exclude<UiLocale, "tr">,
  Record<"us" | "imperial" | "metric", string>
> = {
  en: { us: " US", imperial: " Imperial", metric: " Metric" },
  fr: { us: " (US)", imperial: " (impérial)", metric: " (métrique)" },
  de: { us: " (US)", imperial: " (imperial)", metric: " (metrisch)" },
  es: { us: " (EE. UU.)", imperial: " (imperial)", metric: " (métrico)" },
};

export function ingredientUnitOptionLabel(
  unit: CanonicalUnit,
  locale: UiLocale = "en",
): string {
  // The Turkish labels for the _us/_imperial/_metric variants already carry
  // their own system suffix (see UNIT_LABELS.tr); the others share one label
  // across systems, so the picker needs the system spelled out.
  if (locale === "tr") return unitLabel(unit, locale);
  const system = unit.endsWith("_us")
    ? "us"
    : unit.endsWith("_imperial")
      ? "imperial"
      : unit.endsWith("_metric")
        ? "metric"
        : null;
  return system
    ? `${unitLabel(unit, locale)}${UNIT_SYSTEM_SUFFIXES[locale][system]}`
    : unitLabel(unit, locale);
}

export function formatIngredientForTargetUnit(
  ingredient: Ingredient,
  baseYield: number,
  targetYield: number,
  targetUnit: CanonicalUnit,
  provider: IngredientConversionProvider,
  locale: UiLocale = "en",
): string | null {
  const parts = ingredientTargetUnitParts(
    ingredient,
    baseYield,
    targetYield,
    targetUnit,
    provider,
    locale,
  );
  return parts ? joinIngredientParts(parts) : null;
}

/** Parts in an explicitly chosen unit, or null when it can't convert. */
export function ingredientTargetUnitParts(
  ingredient: Ingredient,
  baseYield: number,
  targetYield: number,
  targetUnit: CanonicalUnit,
  provider: IngredientConversionProvider,
  locale: UiLocale = "en",
): IngredientDisplayParts | null {
  const scaled = scaleIngredient(ingredient, baseYield, targetYield);
  if (!scaled.amount || !scaled.unit) return null;
  if (scaled.amount.kind === "inexact") {
    return targetUnit === scaled.unit
      ? formatIngredientParts(scaled, scaled.amount, scaled.unit, locale)
      : null;
  }

  const convertValue = (value: number): number | null => {
    try {
      if (unitFamily(scaled.unit as CanonicalUnit) === unitFamily(targetUnit)) {
        return convertUnit(value, scaled.unit as CanonicalUnit, targetUnit);
      }
      return convertIngredientMassVolume(
        value,
        scaled.unit as CanonicalUnit,
        targetUnit,
        scaled.ingredientText,
        provider,
      );
    } catch {
      return null;
    }
  };

  let failed = false;
  const converted = mapNumericQuantity(scaled.amount, (value) => {
    const result = convertValue(value);
    if (result === null) {
      failed = true;
      return value;
    }
    return result;
  });
  if (failed) return null;
  return formatIngredientParts(scaled, converted, targetUnit, locale);
}
