import type { RecipeLocale } from "../domain/recipe";
import type { MeasurementSystem } from "../domain/unit";
import { defaultParseContext, type ParseContext } from "./context";
import { parseIngredient } from "./ingredient";
import { parseStep } from "./step";

const LOCALES: readonly RecipeLocale[] = ["en", "tr", "fr", "de", "es"];

function contextFor(
  locale: RecipeLocale,
  primary: ParseContext,
  sourceOverride: MeasurementSystem | undefined,
): ParseContext {
  if (locale === primary.locale) return primary;
  const context = defaultParseContext(locale);
  return sourceOverride
    ? { ...context, sourceMeasurementSystem: sourceOverride }
    : context;
}

/**
 * The context to read one line in: whichever language understands the most
 * of it, the recipe's own language winning ties. Per line, not per recipe,
 * so a Turkish step in a recipe that ended up set to English (created while
 * Logseq's interface was English) still gets its "4 dakika", while that
 * recipe's English lines stay English. Language-neutral signals such as
 * "180°C" score in every language, which is why languages are compared
 * rather than the first non-zero one accepted.
 */
function bestContext(
  primary: ParseContext,
  sourceOverride: MeasurementSystem | undefined,
  score: (context: ParseContext) => number,
): ParseContext {
  let best = primary;
  let bestScore = score(primary);
  for (const locale of LOCALES) {
    if (locale === primary.locale) continue;
    const context = contextFor(locale, primary, sourceOverride);
    const candidate = score(context);
    if (candidate > bestScore) {
      best = context;
      bestScore = candidate;
    }
  }
  return best;
}

export function stepParseContext(
  text: string,
  primary: ParseContext,
  sourceOverride?: MeasurementSystem,
): ParseContext {
  return bestContext(primary, sourceOverride, (context) => {
    const step = parseStep(text, context);
    return step.durations.length + step.temperatures.length + step.heat.length;
  });
}

export function ingredientParseContext(
  text: string,
  primary: ParseContext,
  sourceOverride?: MeasurementSystem,
): ParseContext {
  // Bare numbers parse in any language; only a recognized unit is signal.
  return bestContext(primary, sourceOverride, (context) =>
    parseIngredient(text, context).unit ? 1 : 0,
  );
}
