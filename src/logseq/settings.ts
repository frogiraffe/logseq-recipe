import type { RecipeLocale } from "../domain/recipe";
import {
  isMeasurementSystem,
  MEASUREMENT_SYSTEMS,
  type MeasurementSystem,
} from "../domain/unit";
import { isRecipeLocale, RECIPE_LOCALES } from "../parsing/locales";
import type { UiLocale } from "../units/format";

export type UiLanguage = UiLocale;
// "auto" follows Logseq's own interface language.
export type UiLanguageSetting = UiLanguage | "auto";
const UI_LANGUAGES: readonly UiLanguage[] = ["en", "tr", "fr", "de", "es"];
export type ParserLocaleSetting = RecipeLocale | "auto";

export interface DraftRecipeSettings {
  uiLanguage: UiLanguageSetting;
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

const SETTINGS_SCHEMA: EnumSettingSchema[] = [
  {
    key: "uiLanguage",
    type: "enum",
    default: "auto",
    title: "UI language",
    description:
      "Language used by Logseq Recipe controls. auto follows Logseq's language.",
    enumChoices: ["auto", ...UI_LANGUAGES],
    enumPicker: "select",
  },
  {
    key: "defaultParserLocale",
    type: "enum",
    default: "auto",
    title: "Default recipe language",
    description: "Language used first when parsing recipe text.",
    enumChoices: ["auto", ...RECIPE_LOCALES],
    enumPicker: "select",
  },
  {
    key: "defaultMeasurementSystem",
    type: "enum",
    default: "metric",
    title: "Measurement system",
    description: "Default display system. Individual recipes may override it.",
    enumChoices: [...MEASUREMENT_SYSTEMS],
    enumPicker: "select",
  },
];

function isUiLanguage(value: unknown): value is UiLanguage {
  return UI_LANGUAGES.includes(value as UiLanguage);
}

// Logseq's "tr-TR" or "pt_BR" -> "tr", "pt".
function languageCode(value: string | undefined): string | undefined {
  return value?.toLocaleLowerCase().split(/[-_]/u)[0];
}

export function normalizeSettings(raw: unknown): DraftRecipeSettings {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const { uiLanguage, defaultParserLocale, defaultMeasurementSystem } = record;
  return {
    uiLanguage: isUiLanguage(uiLanguage) ? uiLanguage : "auto",
    defaultParserLocale: isRecipeLocale(defaultParserLocale)
      ? defaultParserLocale
      : "auto",
    defaultMeasurementSystem: isMeasurementSystem(defaultMeasurementSystem)
      ? defaultMeasurementSystem
      : "metric",
  };
}

export function registerSettings(): void {
  // biome-ignore lint/correctness/useHookAtTopLevel: This is a Logseq SDK method, not a React hook.
  logseq.useSettingsSchema(SETTINGS_SCHEMA);
}

export function readSettings(): DraftRecipeSettings {
  return normalizeSettings(logseq.settings);
}

/** The interface language: the setting, or Logseq's own when "auto". */
export function resolveUiLanguage(
  setting: UiLanguageSetting,
  logseqPreferredLanguage?: string,
): UiLanguage {
  if (setting !== "auto") return setting;
  const code = languageCode(logseqPreferredLanguage);
  return isUiLanguage(code) ? code : "en";
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
  const code = languageCode(logseqPreferredLanguage);
  return isRecipeLocale(code) ? code : "en";
}
