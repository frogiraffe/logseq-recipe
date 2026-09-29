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
  | "can"
  | "package"
  | "bunch"
  | "jar"
  | "sprig"
  | "head"
  | "stick"
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "celsius"
  | "fahrenheit";

export type TemporalModifier = "approximate" | "minimum" | "maximum";
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
  /**
   * Modifiers that follow the time they modify and never precede one, each
   * with what it means after the time word as is. Turkish "kadar" is "about"
   * after "10 dakika" but keeps its `temporalModifiers` meaning, "up to",
   * after a time word in the dative ("10 dakikaya", "10 dk'ya"). Before a
   * number it ends the clause before: "köpük kıvamına gelene kadar 5 dakika"
   * is not at most 5 minutes.
   */
  postpositionalModifiers: Readonly<Record<string, TemporalModifier>>;
  /**
   * Case endings that put a time word in the dative, either glued to
   * another form of the same unit ("dakika" + "ya") or after an apostrophe
   * ("dk'ya").
   */
  dativeEndings: readonly string[];
  heatAliases: Readonly<Record<string, HeatAliasValue>>;
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
  /** How a time is written back into a line ("1 saat 30 dk"). */
  durationWords: { hour: string; minute: string };
  sectionAliases: {
    ingredients: readonly string[];
    steps: readonly string[];
    notes: readonly string[];
  };
  /**
   * Words that tie a section name to what it is for, so a qualified heading
   * still names the section: `after` follows the name ("Ingredients for the
   * dough"), `before` precedes it ("Hamur için malzemeler"). `suffixed` are
   * each section's names as they end a qualified heading, for languages
   * that mark it on the name itself (Turkish "Kekin yapılışı").
   */
  sectionQualifiers: {
    after: readonly string[];
    before: readonly string[];
    suffixed: {
      ingredients: readonly string[];
      steps: readonly string[];
      notes: readonly string[];
    };
  };
}
