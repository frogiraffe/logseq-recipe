import type {
  DurationAnnotation,
  HeatAnnotation,
  TemperatureAnnotation,
} from "./annotations";
import type { Quantity } from "./quantity";
import type { StepChild } from "./step-media";
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
  // Set by the plugin when it wrote categories and tags into their Logseq
  // properties, which are then the source of truth and `categories`/`tags`
  // above only a copy. Logseq Recipe 1.4 drops it on its next save, so its
  // absence also marks a recipe an older version has edited since.
  taxonomyInProperties?: true;
  parserLocale?: RecipeLocale;
  sourceMeasurementSystem?: MeasurementSystem;
  measurementSystemOverride?: MeasurementSystem;
  ingredientConversionOverrides: IngredientConversionOverride[];
}

export interface CoverRef {
  kind: "asset-node" | "asset-path";
  value: string;
}

/** A heading ingredients are nested under ("For the dough"). */
export interface IngredientGroup {
  id: string;
  title: string;
}

export interface Ingredient {
  id: string;
  rawText: string;
  amount?: Quantity;
  unit?: CanonicalUnit;
  ingredientText: string;
  note?: string;
  scaleMode: IngredientScaleMode;
  group?: IngredientGroup;
  // Lines written under the ingredient in Logseq ("at room temperature").
  details?: string[];
}

export interface RecipeStep {
  id: string;
  rawText: string;
  durations: DurationAnnotation[];
  temperatures: TemperatureAnnotation[];
  heat: HeatAnnotation[];
  // Ordered child blocks: step notes and graph-local image/audio.
  children?: StepChild[];
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
