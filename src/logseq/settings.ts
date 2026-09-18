import type { RecipeLocale } from "../domain/recipe";
import type { MeasurementSystem } from "../domain/unit";

export type UiLanguage = "en" | "tr";
export type ParserLocaleSetting = RecipeLocale | "auto";

export interface DraftRecipeSettings {
  uiLanguage: UiLanguage;
  defaultParserLocale: ParserLocaleSetting;
  defaultMeasurementSystem: MeasurementSystem;
}

type EnumSettingSchema = {
  key: string;
  type: "enum";
  default: string;
  title: string;
  description: string;
  enumChoices: string[];
  enumPicker: "select";
};

export const SETTINGS_SCHEMA: EnumSettingSchema[] = [
  {
    key: "uiLanguage",
    type: "enum",
    default: "en",
    title: "UI language",
    description: "Language used by Logseq Recipe controls.",
    enumChoices: ["en", "tr"],
    enumPicker: "select",
  },
  {
    key: "defaultParserLocale",
    type: "enum",
    default: "auto",
    title: "Default recipe language",
    description: "Language used first when parsing recipe text.",
    enumChoices: ["auto", "en", "tr", "fr", "de", "es"],
    enumPicker: "select",
  },
  {
    key: "defaultMeasurementSystem",
    type: "enum",
    default: "metric",
    title: "Measurement system",
    description: "Default display system. Individual recipes may override it.",
    enumChoices: ["metric", "us", "imperial"],
    enumPicker: "select",
  },
];

const PARSER_LOCALES = new Set<RecipeLocale>(["en", "tr", "fr", "de", "es"]);
const MEASUREMENT_SYSTEMS = new Set<MeasurementSystem>([
  "metric",
  "us",
  "imperial",
]);

function isParserLocale(value: unknown): value is RecipeLocale {
  return typeof value === "string" && PARSER_LOCALES.has(value as RecipeLocale);
}

function isMeasurementSystem(value: unknown): value is MeasurementSystem {
  return (
    typeof value === "string" &&
    MEASUREMENT_SYSTEMS.has(value as MeasurementSystem)
  );
}

export function normalizeSettings(raw: unknown): DraftRecipeSettings {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const uiLanguage: UiLanguage = record.uiLanguage === "tr" ? "tr" : "en";
  const defaultParserLocale: ParserLocaleSetting =
    record.defaultParserLocale === "auto" ||
    isParserLocale(record.defaultParserLocale)
      ? record.defaultParserLocale
      : "auto";
  const defaultMeasurementSystem = isMeasurementSystem(
    record.defaultMeasurementSystem,
  )
    ? record.defaultMeasurementSystem
    : "metric";

  return {
    uiLanguage,
    defaultParserLocale,
    defaultMeasurementSystem,
  };
}

export function registerSettings(): void {
  // biome-ignore lint/correctness/useHookAtTopLevel: This is a Logseq SDK method, not a React hook.
  logseq.useSettingsSchema(SETTINGS_SCHEMA);
}

export function readSettings(): DraftRecipeSettings {
  return normalizeSettings(logseq.settings);
}

function logseqLanguageToParserLocale(
  value: string | undefined,
): RecipeLocale | null {
  if (!value) return null;
  const candidate = value.toLocaleLowerCase().split(/[-_]/u)[0];
  return isParserLocale(candidate) ? candidate : null;
}

export function resolveParserLocale(
  recipeOverride: RecipeLocale | undefined,
  settings: DraftRecipeSettings,
  logseqPreferredLanguage?: string,
): RecipeLocale {
  if (recipeOverride) return recipeOverride;
  if (settings.defaultParserLocale !== "auto") {
    return settings.defaultParserLocale;
  }
  return logseqLanguageToParserLocale(logseqPreferredLanguage) ?? "en";
}

export function resolveMeasurementSystem(
  recipeOverride: MeasurementSystem | undefined,
  settings: DraftRecipeSettings,
): MeasurementSystem {
  return recipeOverride ?? settings.defaultMeasurementSystem ?? "metric";
}
