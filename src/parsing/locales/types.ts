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
  | "cl"
  | "dl"
  | "l"
  | "tsp"
  | "tbsp"
  | "cup"
  | "fl_oz"
  | "su_bardagi"
  | "cay_bardagi"
  | "tatli_kasigi"
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
  /** A plain space groups thousands ("1 500 g" in French). */
  spaceThousandsSeparator: boolean;
  /**
   * Case endings follow an apostrophe on units and numbers ("200 ml'lik",
   * "3'er dakika"): the part before the apostrophe is what's read.
   */
  apostropheSuffixes: boolean;
  defaultSourceMeasurementSystem: MeasurementSystem;
  unitAliases: Readonly<Record<string, UnitLexeme>>;
  /** Spoon qualifiers kept as notes, never converted into extra volume. */
  unitQualifiers: readonly string[];
  /**
   * Words linking a unit to its ingredient ("1 cup of flour", "1 tasse de
   * farine"), dropped from the ingredient name. An entry ending in "'" is
   * an elided form attached to the next word ("d'huile").
   */
  unitConnectors: readonly string[];
  quantityWords: Readonly<Record<string, number>>;
  /**
   * Words that turn an article into a vague amount ("a little", "un peu",
   * "ein paar"): such a line has no count to scale.
   */
  vagueQuantityWords: readonly string[];
  /** A word adding ½ to the amount before it ("bir buçuk" = 1½). */
  halfSuffixes: readonly string[];
  temporalModifiers: Readonly<Record<string, TemporalModifier>>;
  heatAliases: Readonly<Record<string, HeatAliasValue>>;
  sequenceConnectors: Readonly<Record<string, SequenceConnector>>;
  relationConnectors: Readonly<Record<string, RelationConnector>>;
  inexactDurations: Readonly<Record<string, string>>;
  ovenModeAliases: Readonly<Record<string, OvenMode>>;
  preheatAliases: readonly string[];
  rangeWords: readonly string[];
  /** A word opening "<n> and <m>" as a range ("between 10 and 15 min"). */
  rangeOpeners: readonly string[];
  /**
   * Words that make a clause an instruction NOT to do something ("don't
   * bake past 15 min"): a duration inside it gets no timer. An entry ending
   * in "'" is an elided form attached to the next word ("n'est").
   */
  negationWords: readonly string[];
  /**
   * Endings that make a clause's last word a negative imperative, for
   * languages that negate a verb by suffix (Turkish "pişirme" = "don't
   * bake"). Empty where negation is a separate word.
   */
  negativeImperativeSuffixes: readonly string[];
  metadataAliases: Readonly<Record<string, RecipeMetadataField>>;
  sectionAliases: {
    ingredients: readonly string[];
    steps: readonly string[];
    notes: readonly string[];
  };
}
