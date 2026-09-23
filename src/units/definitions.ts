import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";

export type UnitFamily = "mass" | "volume" | "time" | "temperature" | "count";

export interface LinearUnitDefinition {
  family: Exclude<UnitFamily, "temperature" | "count">;
  toBase: number;
}

export const LINEAR_UNIT_DEFINITIONS: Partial<
  Record<CanonicalUnit, LinearUnitDefinition>
> = {
  mg: { family: "mass", toBase: 0.001 },
  g: { family: "mass", toBase: 1 },
  kg: { family: "mass", toBase: 1000 },
  oz_mass: { family: "mass", toBase: 28.349523125 },
  lb: { family: "mass", toBase: 453.59237 },

  ml: { family: "volume", toBase: 1 },
  l: { family: "volume", toBase: 1000 },
  tsp_metric: { family: "volume", toBase: 5 },
  tbsp_metric: { family: "volume", toBase: 15 },
  cup_metric: { family: "volume", toBase: 250 },
  tsp_us: { family: "volume", toBase: 4.92892159375 },
  tbsp_us: { family: "volume", toBase: 14.78676478125 },
  cup_us: { family: "volume", toBase: 236.5882365 },
  fl_oz_us: { family: "volume", toBase: 29.5735295625 },
  tsp_imperial: { family: "volume", toBase: 5.919388020833333 },
  tbsp_imperial: { family: "volume", toBase: 17.7581640625 },
  cup_imperial: { family: "volume", toBase: 284.130625 },
  fl_oz_imperial: { family: "volume", toBase: 28.4130625 },

  // Turkish culinary glass/spoon sizes are their own fixed units, not a
  // regional variant of "cup" - they don't change with the recipe's source
  // measurement system the way tsp/tbsp/cup do. Values are the standard
  // Turkish home-kitchen references: su bardağı
  // ("water glass") ~200 ml, çay bardağı ("tea glass") ~100 ml, tatlı kaşığı
  // ("dessert spoon") ~10 ml - between çay kaşığı/tsp (5 ml) and yemek
  // kaşığı/tbsp (15 ml), both of which already exactly match the metric
  // tsp/tbsp defined above and need no separate unit.
  su_bardagi: { family: "volume", toBase: 200 },
  cay_bardagi: { family: "volume", toBase: 100 },
  tatli_kasigi: { family: "volume", toBase: 10 },

  second: { family: "time", toBase: 1 },
  minute: { family: "time", toBase: 60 },
  hour: { family: "time", toBase: 3600 },
  day: { family: "time", toBase: 86400 },
};

export const COUNT_UNITS = new Set<CanonicalUnit>([
  "piece",
  "egg",
  "clove",
  "slice",
  "pinch",
]);

export const TEMPERATURE_UNITS = new Set<CanonicalUnit>([
  "celsius",
  "fahrenheit",
]);

export const COOKING_UNITS_BY_SYSTEM: Record<
  MeasurementSystem,
  {
    tsp: CanonicalUnit;
    tbsp: CanonicalUnit;
    cup: CanonicalUnit;
    flOz?: CanonicalUnit;
  }
> = {
  metric: {
    tsp: "tsp_metric",
    tbsp: "tbsp_metric",
    cup: "cup_metric",
  },
  us: {
    tsp: "tsp_us",
    tbsp: "tbsp_us",
    cup: "cup_us",
    flOz: "fl_oz_us",
  },
  imperial: {
    tsp: "tsp_imperial",
    tbsp: "tbsp_imperial",
    cup: "cup_imperial",
    flOz: "fl_oz_imperial",
  },
};
