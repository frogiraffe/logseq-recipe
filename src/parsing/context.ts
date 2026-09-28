import type { RecipeLocale } from "../domain/recipe";
import type { MeasurementSystem } from "../domain/unit";
import { getLocalePack } from "./locales";

export interface ParseContext {
  locale: RecipeLocale;
  sourceMeasurementSystem: MeasurementSystem;
}

/** `locale`, read in the given measurement system or else the locale's own. */
export function defaultParseContext(
  locale: RecipeLocale,
  sourceMeasurementSystem = getLocalePack(
    locale,
  ).defaultSourceMeasurementSystem,
): ParseContext {
  return { locale, sourceMeasurementSystem };
}
