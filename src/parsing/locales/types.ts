import type { HeatLevel, SurfaceState } from "../../domain/annotations";
import type { RecipeLocale } from "../../domain/recipe";
import type { MeasurementSystem } from "../../domain/unit";

export type UnitLexeme =
  | "mg"
  | "g"
  | "kg"
  | "oz_mass"
  | "lb"
  | "ml"
  | "l"
  | "tsp"
  | "tbsp"
  | "cup"
  | "fl_oz"
  | "piece"
  | "egg"
  | "clove"
  | "slice"
  | "pinch"
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "celsius"
  | "fahrenheit";

export type TemporalModifier = "approximate" | "minimum" | "maximum";
export type SequenceConnector = "then" | "afterwards";
export type RelationConnector = "and" | "or";
export type OvenMode = "fan" | "conventional";
export type RecipeMetadataField =
  | "yield"
  | "prep"
  | "chill"
  | "cook"
  | "source";

export interface HeatAliasValue {
  level?: HeatLevel;
  surfaceState?: SurfaceState;
  surface?: "pan" | "oven" | "grill" | "other";
}

export interface RecipeLocalePack {
  code: RecipeLocale;
  decimalSeparator: "." | ",";
  defaultSourceMeasurementSystem: MeasurementSystem;
  unitAliases: Readonly<Record<string, UnitLexeme>>;
  quantityWords: Readonly<Record<string, number>>;
  temporalModifiers: Readonly<Record<string, TemporalModifier>>;
  heatAliases: Readonly<Record<string, HeatAliasValue>>;
  sequenceConnectors: Readonly<Record<string, SequenceConnector>>;
  relationConnectors: Readonly<Record<string, RelationConnector>>;
  inexactDurations: Readonly<Record<string, string>>;
  ovenModeAliases: Readonly<Record<string, OvenMode>>;
  preheatAliases: readonly string[];
  rangeWords: readonly string[];
  metadataAliases: Readonly<Record<string, RecipeMetadataField>>;
  sectionAliases: {
    ingredients: readonly string[];
    steps: readonly string[];
    notes: readonly string[];
  };
}
