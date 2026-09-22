import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import {
  COOKING_UNITS_BY_SYSTEM,
  COUNT_UNITS,
  LINEAR_UNIT_DEFINITIONS,
  TEMPERATURE_UNITS,
  type UnitFamily,
} from "./definitions";
import type { IngredientConversionProvider } from "./ingredient-registry";

export function unitFamily(unit: CanonicalUnit): UnitFamily {
  const linear = LINEAR_UNIT_DEFINITIONS[unit];
  if (linear) return linear.family;
  if (TEMPERATURE_UNITS.has(unit)) return "temperature";
  if (COUNT_UNITS.has(unit)) return "count";
  throw new RangeError(`Unknown canonical unit: ${unit}`);
}

function convertTemperature(
  value: number,
  from: CanonicalUnit,
  to: CanonicalUnit,
): number {
  if (from === to) return value;
  if (from === "celsius" && to === "fahrenheit") return (value * 9) / 5 + 32;
  if (from === "fahrenheit" && to === "celsius") return ((value - 32) * 5) / 9;
  throw new RangeError(`Incompatible temperature conversion: ${from} -> ${to}`);
}

export function convertUnit(
  value: number,
  from: CanonicalUnit,
  to: CanonicalUnit,
): number {
  if (!Number.isFinite(value)) throw new RangeError("value must be finite");
  if (from === to) return value;

  const fromFamily = unitFamily(from);
  const toFamily = unitFamily(to);
  if (fromFamily !== toFamily) {
    throw new RangeError(`Incompatible unit dimensions: ${from} -> ${to}`);
  }

  if (fromFamily === "temperature") return convertTemperature(value, from, to);
  if (fromFamily === "count") {
    throw new RangeError(
      `Count units are not interchangeable: ${from} -> ${to}`,
    );
  }

  const fromDefinition = LINEAR_UNIT_DEFINITIONS[from];
  const toDefinition = LINEAR_UNIT_DEFINITIONS[to];
  if (!fromDefinition || !toDefinition) {
    throw new RangeError(`Missing conversion definition: ${from} -> ${to}`);
  }

  const baseValue = value * fromDefinition.toBase;
  return baseValue / toDefinition.toBase;
}

function cookingUnitKind(
  unit: CanonicalUnit,
): "tsp" | "tbsp" | "cup" | "flOz" | null {
  if (unit.startsWith("tsp_")) return "tsp";
  if (unit.startsWith("tbsp_")) return "tbsp";
  if (unit.startsWith("cup_")) return "cup";
  if (unit.startsWith("fl_oz_")) return "flOz";
  return null;
}

export function displayUnitForSystem(
  unit: CanonicalUnit,
  targetSystem: MeasurementSystem,
): CanonicalUnit {
  const family = unitFamily(unit);

  if (family === "temperature") {
    return targetSystem === "metric" ? "celsius" : "fahrenheit";
  }

  if (family === "count" || family === "time") return unit;

  if (family === "mass") {
    if (targetSystem === "metric") {
      if (unit === "mg" || unit === "g" || unit === "kg") return unit;
      return "g";
    }
    if (unit === "oz_mass" || unit === "lb") return unit;
    return "oz_mass";
  }

  const kind = cookingUnitKind(unit);
  if (kind) {
    if (kind === "flOz" && targetSystem === "metric") return "ml";
    const mapped = COOKING_UNITS_BY_SYSTEM[targetSystem][kind];
    if (mapped) return mapped;
    return "ml";
  }

  if (targetSystem === "metric") return unit;
  return targetSystem === "us" ? "fl_oz_us" : "fl_oz_imperial";
}

export function convertForDisplay(
  value: number,
  from: CanonicalUnit,
  targetSystem: MeasurementSystem,
): { value: number; unit: CanonicalUnit } {
  const unit = displayUnitForSystem(from, targetSystem);
  return { value: convertUnit(value, from, unit), unit };
}

export function convertIngredientMassVolume(
  value: number,
  from: CanonicalUnit,
  to: CanonicalUnit,
  ingredientText: string,
  provider: IngredientConversionProvider,
): number | null {
  const fromFamily = unitFamily(from);
  const toFamily = unitFamily(to);

  if (fromFamily === toFamily) return convertUnit(value, from, to);

  const massToVolume = fromFamily === "mass" && toFamily === "volume";
  const volumeToMass = fromFamily === "volume" && toFamily === "mass";
  if (!massToVolume && !volumeToMass) return null;

  const rule = provider.find(ingredientText);
  if (
    !rule ||
    !Number.isFinite(rule.gramsPerMilliliter) ||
    rule.gramsPerMilliliter <= 0
  ) {
    return null;
  }

  if (massToVolume) {
    const grams = convertUnit(value, from, "g");
    const milliliters = grams / rule.gramsPerMilliliter;
    return convertUnit(milliliters, "ml", to);
  }

  const milliliters = convertUnit(value, from, "ml");
  const grams = milliliters * rule.gramsPerMilliliter;
  return convertUnit(grams, "g", to);
}
