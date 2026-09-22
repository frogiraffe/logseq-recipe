import type {
  DurationAnnotation,
  HeatAnnotation,
  TemperatureAnnotation,
} from "./annotations";
import type { Quantity } from "./quantity";
import type { CanonicalUnit, MeasurementSystem } from "./unit";

export type IngredientScaleMode = "linear" | "fixed";
export type RecipeLocale = "en" | "tr" | "fr" | "de" | "es";

export type VolumeConversionUnit =
  | "ml"
  | "tsp_metric"
  | "tbsp_metric"
  | "cup_metric"
  | "tsp_us"
  | "tbsp_us"
  | "cup_us"
  | "tsp_imperial"
  | "tbsp_imperial"
  | "cup_imperial";

export interface IngredientConversionOverride {
  ingredientKey: string;
  massUnit: "g";
  volumeUnit: VolumeConversionUnit;
  gramsPerVolumeUnit: number;
}

export interface RecipeMeta {
  categories: string[];
  tags: string[];
  parserLocale?: RecipeLocale;
  sourceMeasurementSystem?: MeasurementSystem;
  measurementSystemOverride?: MeasurementSystem;
  ingredientConversionOverrides: IngredientConversionOverride[];
}

export interface CoverRef {
  kind: "asset-node" | "asset-path";
  value: string;
}

export interface Ingredient {
  id: string;
  rawText: string;
  amount?: Quantity;
  unit?: CanonicalUnit;
  ingredientText: string;
  note?: string;
  scaleMode: IngredientScaleMode;
}

export interface RecipeStep {
  id: string;
  rawText: string;
  durations: DurationAnnotation[];
  temperatures: TemperatureAnnotation[];
  heat: HeatAnnotation[];
}

export interface RecipeNote {
  id: string;
  text: string;
}

export interface Recipe {
  id: string;
  title: string;
  baseYield: number;
  yieldUnit?: string;
  cover?: CoverRef;
  prepMinutes?: number;
  chillMinutes?: number;
  cookMinutes?: number;
  sourceUrl?: string;
  categories: string[];
  tags: string[];
  ingredients: Ingredient[];
  steps: RecipeStep[];
  notes: RecipeNote[];
  schemaVersion: number;
  parserLocale?: RecipeLocale;
  sourceMeasurementSystem?: MeasurementSystem;
  measurementSystemOverride?: MeasurementSystem;
  ingredientConversionOverrides: IngredientConversionOverride[];
}

export const RECIPE_SCHEMA_VERSION = 1;
