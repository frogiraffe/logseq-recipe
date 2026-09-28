import type { RecipeLocale } from "../domain/recipe";
import type { ParseContext } from "../parsing/context";
import { parseDurations } from "../parsing/duration";
import { parseIngredient } from "../parsing/ingredient";
import { getLocalePack, RECIPE_LOCALES } from "../parsing/locales";
import type { RecipeMetadataField } from "../parsing/locales/types";
import { escapeRegExp, foldLabel } from "../parsing/normalize";
import { findPhraseSpans } from "../parsing/phrases";
import { convertUnit } from "../units/convert";

export interface YieldMetadataValue {
  baseYield: number;
  yieldUnit?: string;
}

export type ParsedRecipeMetadataLine =
  | { field: "yield"; value: YieldMetadataValue | null }
  | { field: "prep" | "chill" | "cook"; value: number | null }
  | { field: "source"; value: string | null };

export function splitLabelValue(
  text: string,
): { label: string; value: string } | null {
  const index = text.indexOf(":");
  if (index <= 0) return null;
  const label = text.slice(0, index).trim();
  const value = text.slice(index + 1).trim();
  if (!label || !value) return null;
  return { label, value };
}

/**
 * Rewrites just the number inside a metadata line's value, keeping whatever
 * unit word the user originally wrote (e.g. "15 dk" -> "20 dk") so a plugin
 * UI edit doesn't have to know locale-specific duration unit spelling.
 */
export function replaceLeadingNumber(text: string, value: number): string {
  const match = text.match(/-?\d+(?:[.,]\d+)?/);
  if (!match || match.index === undefined) return String(value);
  return (
    text.slice(0, match.index) +
    String(value) +
    text.slice(match.index + match[0].length)
  );
}

/**
 * A yield line's new text. "Servings: 4" keeps its label; a line without
 * one ("Serves 4-6", "4 kişilik") keeps its words with the count replaced,
 * and swaps its unit when it names the old one.
 */
export function rewriteYieldLine(
  title: string,
  baseYield: number,
  yieldUnit: string | undefined,
  previousUnit: string | undefined,
): string {
  const pair = splitLabelValue(title);
  if (pair) {
    return `${pair.label}: ${baseYield}${yieldUnit ? ` ${yieldUnit}` : ""}`;
  }
  // The whole count the line was read with: "4-6", or a range in words in
  // any language ("4 to 6", "4 à 6", "4 bis 6") - replacing only its first
  // number would leave "8 to 6", which no longer reads as a yield.
  const number = String.raw`\d+(?:[.,]\d+)?`;
  const rangeWords = RECIPE_LOCALES.flatMap(
    (locale) => getLocalePack(locale).rangeWords,
  )
    .map(escapeRegExp)
    .join("|");
  const count = new RegExp(
    `${number}(?:\\s*[-–]\\s*${number}|\\s+(?:${rangeWords})\\s+${number})?`,
    "iu",
  );
  let text = count.test(title)
    ? title.replace(count, String(baseYield))
    : `${title} ${baseYield}`;
  if (yieldUnit !== previousUnit) {
    if (previousUnit && text.includes(previousUnit)) {
      text = text
        .replace(previousUnit, yieldUnit ?? "")
        .replace(/\s+/gu, " ")
        .trim();
    } else if (yieldUnit) {
      text = `${text} ${yieldUnit}`;
    }
  }
  return text;
}

/** The language a metadata line's label is written in, preferring the recipe's. */
export function metadataLabelLocale(
  label: string,
  context: ParseContext,
): RecipeLocale {
  return (
    [context.locale, ...RECIPE_LOCALES].find(
      (locale) => metadataField(label, locale) !== null,
    ) ?? context.locale
  );
}

/** A number of minutes as a time in `locale`: "45 dk", "1 h 30 min". */
export function formatMinutes(minutes: number, locale: RecipeLocale): string {
  const { hour, minute } = getLocalePack(locale).durationWords;
  const hours = Math.floor(minutes / 60);
  const rest = minutes - hours * 60;
  if (hours === 0) return `${rest} ${minute}`;
  return rest === 0 ? `${hours} ${hour}` : `${hours} ${hour} ${rest} ${minute}`;
}

/**
 * A time field's new value for its visible line. A plain minute amount keeps
 * the cook's own wording ("15 dk" -> "20 dk"); any other time ("1 saat",
 * "1 h 30 min") is written anew, since changing only its number would
 * change its unit too ("1 saat" -> "90 saat").
 */
export function rewriteMinutesValue(
  value: string,
  minutes: number,
  context: ParseContext,
): string {
  const durations = parseDurations(value, context);
  const only = durations.length === 1 ? durations[0] : undefined;
  // One number only: "1 h 30 min" and "1 h 30" read as minutes too.
  const numbers = value.match(/\d+(?:[.,]\d+)?/g)?.length ?? 0;
  if (only?.unit === "minute" && only.value.kind === "exact" && numbers === 1) {
    return replaceLeadingNumber(value, minutes);
  }
  return formatMinutes(minutes, context.locale);
}

export function metadataField(
  label: string,
  locale: RecipeLocale,
): RecipeMetadataField | null {
  const folded = foldLabel(label);
  for (const [alias, field] of Object.entries(
    getLocalePack(locale).metadataAliases,
  )) {
    if (foldLabel(alias) === folded) return field;
  }
  return null;
}

function parseYield(
  value: string,
  context: ParseContext,
): YieldMetadataValue | null {
  const parsed = parseIngredient(value, context);
  const amount = parsed.amount;
  // "4-6" serves at least 4; "about 24" is 24.
  const count =
    amount?.kind === "exact" || amount?.kind === "approximate"
      ? amount.value
      : amount?.kind === "range"
        ? amount.min
        : undefined;
  if (count === undefined || !Number.isFinite(count) || count <= 0) {
    return null;
  }

  const yieldUnit = parsed.ingredientText.trim();
  return {
    baseYield: count,
    ...(yieldUnit ? { yieldUnit } : {}),
  };
}

function yieldAliases(locale: RecipeLocale): string[] {
  return Object.entries(getLocalePack(locale).metadataAliases)
    .filter(([, field]) => field === "yield")
    .map(([alias]) => foldLabel(alias));
}

/**
 * A yield written without a colon: its label first ("Serves 4", "Makes 12
 * cookies", "Pour 4 personnes", "Für 4 Personen"), or the count before a
 * word for servings ("4 kişilik", "6 servings", "4 kişi için"). The second
 * form is only a line that short, so a sentence starting with a number
 * never passes for one.
 */
function parseUnlabeledYield(
  text: string,
  context: ParseContext,
): YieldMetadataValue | null {
  const words = text.trim().split(/\s+/u);
  for (const locale of [context.locale, ...RECIPE_LOCALES]) {
    const aliases = yieldAliases(locale);
    const localeContext = { ...context, locale };
    for (let take = Math.min(3, words.length - 1); take >= 1; take -= 1) {
      if (!aliases.includes(foldLabel(words.slice(0, take).join(" ")))) {
        continue;
      }
      const value = parseYield(words.slice(take).join(" "), localeContext);
      if (value) return value;
    }
    const counted = parseYield(text, localeContext);
    const unitWords = counted?.yieldUnit?.split(/\s+/u) ?? [];
    if (
      counted &&
      unitWords.length >= 1 &&
      unitWords.length <= 2 &&
      aliases.includes(foldLabel(unitWords[0]))
    ) {
      return counted;
    }
  }
  return null;
}

function parseExactMinutes(
  value: string,
  context: ParseContext,
): number | null {
  const durations = parseDurations(value, context);
  if (durations.length === 0) return null;
  // "10 min or 12 min" offers alternatives, not a sum; "45 min or until
  // golden" is still one time.
  const first = durations[0];
  const last = durations[durations.length - 1];
  if (
    RECIPE_LOCALES.some((locale) =>
      findPhraseSpans(
        value,
        getLocalePack(locale).relationConnectors,
        locale,
      ).some(
        (span) =>
          span.value === "or" &&
          span.startOffset >= first.endOffset &&
          span.endOffset <= last.startOffset,
      ),
    )
  )
    return null;
  // A number left outside every recognized duration ("1 h 5 min" when "h"
  // isn't a known unit) must reject the value, not silently drop an hour.
  let rest = value;
  for (const duration of [...durations].reverse()) {
    rest = rest.slice(0, duration.startOffset) + rest.slice(duration.endOffset);
  }
  if (/\d/.test(rest)) return null;

  let total = 0;
  for (const duration of durations) {
    if (duration.value.kind !== "exact" || !duration.unit) return null;
    total += convertUnit(duration.value.value, duration.unit, "minute");
  }

  return Number.isFinite(total) && total >= 0 ? total : null;
}

function parseSource(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseRecipeMetadataLine(
  text: string,
  context: ParseContext,
): ParsedRecipeMetadataLine | null {
  const pair = splitLabelValue(text);
  if (!pair) {
    const value = parseUnlabeledYield(text, context);
    return value ? { field: "yield", value } : null;
  }
  // A label in any supported language is accepted; durations try that
  // language first, then the other supported languages.
  const locale = metadataLabelLocale(pair.label, context);
  const field = metadataField(pair.label, locale);
  if (!field) return null;
  context = { ...context, locale };

  if (field === "yield") {
    return { field, value: parseYield(pair.value, context) };
  }
  if (field === "source") {
    return { field, value: parseSource(pair.value) };
  }
  const ownValue = parseExactMinutes(pair.value, context);
  if (ownValue !== null) return { field, value: ownValue };
  for (const locale of RECIPE_LOCALES) {
    if (locale === context.locale) continue;
    const value = parseExactMinutes(pair.value, { ...context, locale });
    if (value !== null) return { field, value };
  }
  return { field, value: null };
}

export interface ScannedMetadataLine<T> {
  blockId: string;
  title: string;
  /** null means a line was found but its value could not be parsed. */
  value: T | null;
}

export interface ScannedRecipeMetadataLines {
  yield?: ScannedMetadataLine<YieldMetadataValue>;
  prep?: ScannedMetadataLine<number>;
  chill?: ScannedMetadataLine<number>;
  cook?: ScannedMetadataLine<number>;
  source?: ScannedMetadataLine<string>;
}

/**
 * Finds the visible metadata lines (Yield/Prep/Chill/Cook/Source) among a
 * recipe root's direct children. These lines are the recipe's readable,
 * user-editable source of truth for these fields; hidden root properties are
 * a cache that must follow them, not the other way around.
 */
export function scanRecipeMetadataLines(
  children: ReadonlyArray<{ id: string; title: string }>,
  context: ParseContext,
): ScannedRecipeMetadataLines {
  const result: ScannedRecipeMetadataLines = {};
  for (const child of children) {
    const parsed = parseRecipeMetadataLine(child.title, context);
    if (!parsed) continue;
    Object.assign(result, {
      [parsed.field]: {
        blockId: child.id,
        title: child.title,
        value: parsed.value,
      },
    });
  }
  return result;
}
