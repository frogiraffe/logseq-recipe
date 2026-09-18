import type { RecipeLocale } from "../../domain/recipe";
import { deLocale } from "./de";
import { enLocale } from "./en";
import { esLocale } from "./es";
import { frLocale } from "./fr";
import { trLocale } from "./tr";
import type { RecipeLocalePack } from "./types";

const LOCALES: Readonly<Record<RecipeLocale, RecipeLocalePack>> = {
  en: enLocale,
  tr: trLocale,
  fr: frLocale,
  de: deLocale,
  es: esLocale,
};

export function getLocalePack(locale: RecipeLocale): RecipeLocalePack {
  return LOCALES[locale];
}

export type { RecipeLocalePack, UnitLexeme } from "./types";
export { LOCALES };
