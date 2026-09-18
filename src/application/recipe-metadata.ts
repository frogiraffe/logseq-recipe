import type { ParseContext } from "../parsing/context";
import { parseDurations } from "../parsing/duration";
import { parseIngredient } from "../parsing/ingredient";
import { getLocalePack } from "../parsing/locales";
import type { RecipeMetadataField } from "../parsing/locales/types";
import { normalizeLookup } from "../parsing/normalize";
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
  context: ParseContext,
): RecipeMetadataField | null {
  const pack = getLocalePack(context.locale);
  const normalized = normalizeLookup(label, context.locale);
  for (const [alias, field] of Object.entries(pack.metadataAliases)) {
    if (normalizeLookup(alias, context.locale) === normalized) return field;
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

  let total = 0;
  for (const duration of durations) {
    if (duration.value.kind !== "exact" || !duration.unit) return null;
    total += convertUnit(duration.value.value, duration.unit, "minute");
  }

  return Number.isFinite(total) && total >= 0 ? total : null;
}

function parseSource(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseRecipeMetadataLine(
  text: string,
  context: ParseContext,
): ParsedRecipeMetadataLine | null {
  const pair = splitLabelValue(text);
  if (!pair) return null;
  const field = metadataField(pair.label, context);
  if (!field) return null;

  if (field === "yield") {
    return { field, value: parseYield(pair.value, context) };
  }
  if (field === "source") {
    return { field, value: parseSource(pair.value) };
  }
  return { field, value: parseExactMinutes(pair.value, context) };
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
