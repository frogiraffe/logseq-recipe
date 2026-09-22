import type { RecipeLocale } from "../domain/recipe";
import type { MeasurementSystem } from "../domain/unit";
import { getLocalePack } from "./locales";

export interface ParseContext {
  locale: RecipeLocale;
  sourceMeasurementSystem: MeasurementSystem;
}

export function defaultParseContext(locale: RecipeLocale): ParseContext {
  return {
    locale,
    sourceMeasurementSystem:
      getLocalePack(locale).defaultSourceMeasurementSystem,
  };
}
