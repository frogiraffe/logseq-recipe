import { formatRecipeNumber } from "../domain/fractions";
import type { CanonicalUnit } from "../domain/unit";

const UNIT_LABELS: Readonly<Record<CanonicalUnit, string>> = {
  mg: "mg",
  g: "g",
  kg: "kg",
  oz_mass: "oz",
  lb: "lb",
  ml: "ml",
  l: "L",
  tsp_metric: "tsp",
  tbsp_metric: "tbsp",
  cup_metric: "cup",
  tsp_us: "tsp",
  tbsp_us: "tbsp",
  cup_us: "cup",
  fl_oz_us: "fl oz",
  tsp_imperial: "tsp",
  tbsp_imperial: "tbsp",
  cup_imperial: "cup",
  fl_oz_imperial: "fl oz",
  piece: "piece",
  egg: "egg",
  clove: "clove",
  slice: "slice",
  pinch: "pinch",
  second: "s",
  minute: "min",
  hour: "h",
  day: "day",
  celsius: "°C",
  fahrenheit: "°F",
};

export function unitLabel(unit: CanonicalUnit): string {
  return UNIT_LABELS[unit];
}

export function formatMeasurement(value: number, unit: CanonicalUnit): string {
  return `${formatRecipeNumber(value)} ${unitLabel(unit)}`;
}
