import { formatRecipeNumber } from "../domain/fractions";
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
import { unitLabel } from "../units/format";
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

export function formatQuantity(quantity: Quantity): string {
  switch (quantity.kind) {
    case "exact":
      return formatRecipeNumber(quantity.value);
    case "range":
      return `${formatRecipeNumber(quantity.min)}–${formatRecipeNumber(quantity.max)}`;
    case "minimum":
      return `≥${formatRecipeNumber(quantity.value)}`;
    case "maximum":
      return `≤${formatRecipeNumber(quantity.value)}`;
    case "approximate":
      return `~${formatRecipeNumber(quantity.value)}`;
    case "inexact":
      return quantity.expression;
  }
}

function visibleUnitText(unit: CanonicalUnit | undefined): string {
  // `egg` and generic `piece` carry count semantics for scaling/conversion but
  // their source word is already represented by the ingredient text itself.
  if (!unit || unit === "egg" || unit === "piece") return "";
  return ` ${unitLabel(unit)}`;
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
  if (targetUnit === unit) return { quantity, unit };
  return {
    quantity: mapNumericQuantity(quantity, (value) =>
      convertUnit(value, unit, targetUnit),
    ),
    unit: targetUnit,
  };
}

function formatIngredientParts(
  ingredient: Ingredient,
  quantity: Quantity,
  unit?: CanonicalUnit,
): string {
  const amount = formatQuantity(quantity);
  const unitText = visibleUnitText(unit);
  const ingredientText = ingredient.ingredientText.trim();
  const note = ingredient.note ? ` (${ingredient.note})` : "";
  return `${amount}${unitText}${ingredientText ? ` ${ingredientText}` : ""}${note}`.trim();
}

export function formatIngredientForDisplay(
  ingredient: Ingredient,
  baseYield: number,
  targetYield: number,
  system: MeasurementSystem,
): string {
  const scaled = scaleIngredient(ingredient, baseYield, targetYield);
  if (!scaled.amount) return scaled.rawText;

  const display = displayQuantityAndUnit(scaled.amount, scaled.unit, system);
  return formatIngredientParts(scaled, display.quantity, display.unit);
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

export function ingredientUnitOptionLabel(unit: CanonicalUnit): string {
  const suffix = unit.endsWith("_us")
    ? " US"
    : unit.endsWith("_imperial")
      ? " Imperial"
      : unit.endsWith("_metric")
        ? " Metric"
        : "";
  return `${unitLabel(unit)}${suffix}`;
}

export function formatIngredientForTargetUnit(
  ingredient: Ingredient,
  baseYield: number,
  targetYield: number,
  targetUnit: CanonicalUnit,
  provider: IngredientConversionProvider,
): string | null {
  const scaled = scaleIngredient(ingredient, baseYield, targetYield);
  if (!scaled.amount || !scaled.unit) return null;
  if (scaled.amount.kind === "inexact") {
    return targetUnit === scaled.unit
      ? formatIngredientParts(scaled, scaled.amount, scaled.unit)
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
  return formatIngredientParts(scaled, converted, targetUnit);
}
