import type { RecipeLocale } from "../domain/recipe";
import type { ParseContext } from "../parsing/context";
import { parseDurations } from "../parsing/duration";
import { parseIngredient } from "../parsing/ingredient";
import { getLocalePack, RECIPE_LOCALES } from "../parsing/locales";
import type { RecipeMetadataField } from "../parsing/locales/types";
import { foldLabel } from "../parsing/normalize";
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

function metadataField(
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
  if (parsed.amount?.kind !== "exact") return null;
  if (!Number.isFinite(parsed.amount.value) || parsed.amount.value <= 0)
    return null;

  const yieldUnit = parsed.ingredientText.trim();
  return {
    baseYield: parsed.amount.value,
    ...(yieldUnit ? { yieldUnit } : {}),
  };
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
  if (!pair) return null;
  // A label in any supported language is accepted; durations try that
  // language first, then the other supported languages.
  let field: RecipeMetadataField | null = null;
  for (const locale of [context.locale, ...RECIPE_LOCALES]) {
    field = metadataField(pair.label, locale);
    if (field) {
      context = { ...context, locale };
      break;
    }
  }
  if (!field) return null;

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
    const line = { blockId: child.id, title: child.title, value: parsed.value };
    switch (parsed.field) {
      case "yield":
        result.yield = line as ScannedMetadataLine<YieldMetadataValue>;
        break;
      case "prep":
        result.prep = line as ScannedMetadataLine<number>;
        break;
      case "chill":
        result.chill = line as ScannedMetadataLine<number>;
        break;
      case "cook":
        result.cook = line as ScannedMetadataLine<number>;
        break;
      case "source":
        result.source = line as ScannedMetadataLine<string>;
        break;
    }
  }
  return result;
}
