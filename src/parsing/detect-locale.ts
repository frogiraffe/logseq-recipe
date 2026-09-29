import type { RecipeLocale } from "../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import { COUNT_UNITS } from "../units/definitions";
import { defaultParseContext, type ParseContext } from "./context";
import { parseIngredient } from "./ingredient";
import { lexRecipeText } from "./lexer";
import { getLocalePack, RECIPE_LOCALES } from "./locales";
import { normalizeLookup } from "./normalize";
import { parseStep } from "./step";

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
  for (const locale of RECIPE_LOCALES) {
    if (locale === primary.locale) continue;
    const context = defaultParseContext(locale, sourceOverride);
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
  // How much of the line is understood, not how many pieces: "1 h 30 à 1 h
  // 45" is one range in French, which must beat two separate times read
  // without the "à". Only letters and digits count, so an abbreviation's
  // dot ("15 Min.") doesn't outweigh the recipe's own language.
  return bestContext(primary, sourceOverride, (context) => {
    const step = parseStep(text, context);
    return [...step.durations, ...step.temperatures, ...step.heat].reduce(
      (covered, span) =>
        covered +
        (text.slice(span.startOffset, span.endOffset).match(/[\p{L}\p{N}]/gu)
          ?.length ?? 0),
      0,
    );
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

const UNIT_WORDS = new Map(
  RECIPE_LOCALES.map((locale) => [
    locale,
    new Set(
      Object.keys(getLocalePack(locale).unitAliases).map((alias) =>
        normalizeLookup(alias, locale),
      ),
    ),
  ]),
);

// A unit word `locale` has and no other language does.
function isExclusiveUnit(word: string, locale: RecipeLocale): boolean {
  return RECIPE_LOCALES.every(
    (other) => UNIT_WORDS.get(other)?.has(word) === (other === locale),
  );
}

/**
 * The languages whose own unit words `text` uses right after an amount:
 * words no other language has ("2 c. à soupe", "2 EL", "2 yemek kaşığı").
 * Shared ones ("g", "ml", "min", "°C", "tasse") never count, nor do counted
 * units: a word only one pack lists as a container can still be plain text
 * in another language ("2 pots of cream", "1 sachet dried yeast").
 */
export function exclusiveUnitLocales(text: string): RecipeLocale[] {
  return RECIPE_LOCALES.filter((locale) => {
    const tokens = lexRecipeText(text, locale);
    return tokens.some(
      (token, index) =>
        token.kind === "unit" &&
        !COUNT_UNITS.has(token.normalized as CanonicalUnit) &&
        ["number", "fraction", "quantity_word"].includes(
          tokens[index - 1]?.kind ?? "",
        ) &&
        isExclusiveUnit(normalizeLookup(token.raw, locale), locale),
    );
  });
}
