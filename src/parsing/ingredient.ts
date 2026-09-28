import { modifiedQuantity, type Quantity } from "../domain/quantity";
import type { RecipeLocale } from "../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import { COUNT_UNITS } from "../units/definitions";
import type { ParseContext } from "./context";
import { andAHalfAt, lexRecipeText, parseAmountAtom } from "./lexer";
import { getLocalePack, type UnitLexeme } from "./locales";
import type { Token, TokenKind } from "./token";

export type ParseConfidence = "exact" | "partial" | "unparsed";

export interface ParsedIngredient {
  rawText: string;
  amount?: Quantity;
  unit?: CanonicalUnit;
  ingredientText: string;
  note?: string;
  confidence: ParseConfidence;
  /**
   * A number was there but couldn't be used safely (two amounts, a
   * malformed number, 1250 kg): the line needs a person's decision.
   */
  ambiguous?: true;
}

interface QuantityParse {
  quantity: Quantity;
  nextIndex: number;
  endOffset: number;
}

function resolveUnitLexeme(
  unit: UnitLexeme,
  system: MeasurementSystem,
): CanonicalUnit {
  switch (unit) {
    case "tsp":
    case "tbsp":
    case "cup":
      return `${unit}_${system}`;
    case "fl_oz":
      return system === "imperial" ? "fl_oz_imperial" : "fl_oz_us";
    default:
      return unit;
  }
}

function parseQuantity(
  tokens: readonly Token[],
  locale: RecipeLocale,
): QuantityParse | null {
  const modifier =
    tokens[0]?.kind === "modifier" ? String(tokens[0].normalized) : undefined;
  const first = parseAmountAtom(tokens, modifier === undefined ? 0 : 1, locale);
  if (!first) return null;

  const second =
    tokens[first.nextIndex]?.kind === "range"
      ? parseAmountAtom(tokens, first.nextIndex + 1, locale)
      : null;
  if (second) {
    // A reversed range ("3-2 tbsp") is not a valid structured quantity.
    // Reject the whole quantity rather than silently keeping just the
    // first number (misleadingly confident) or reordering min/max
    // (guessing the author's intent).
    if (second.value < first.value) return null;
    return {
      quantity: { kind: "range", min: first.value, max: second.value },
      nextIndex: second.nextIndex,
      endOffset: second.endOffset,
    };
  }

  return {
    quantity: modifiedQuantity(modifier, first.value),
    nextIndex: first.nextIndex,
    endOffset: first.endOffset,
  };
}

interface SuffixQuantityParse {
  ingredientText: string;
  quantity: Quantity;
  unit: CanonicalUnit;
  note?: string;
}

// A trailing parenthetical note is the only thing allowed to follow the
// unit - a bare "(sifted)" wrapping the *entire* remainder, never partial
// text or a nested/unbalanced form. Anything else after the unit means this
// isn't cleanly "<ingredient> <amount> <unit> (note)", so it's rejected
// rather than guessed at.
function trailingParentheticalNote(trailing: string): string | null {
  const match = /^\(([^()]+)\)$/u.exec(trailing.trim());
  const note = match?.[1]?.trim();
  return note ? note : null;
}

function unitQualifier(
  tokens: readonly Token[],
  index: number,
  locale: RecipeLocale,
): Token | undefined {
  const token = tokens[index];
  return token?.kind === "word" &&
    getLocalePack(locale).unitQualifiers.includes(String(token.normalized))
    ? token
    : undefined;
}

function joinedNote(...parts: Array<string | undefined>): string | undefined {
  return parts.filter(Boolean).join("; ") || undefined;
}

const AMOUNT_KINDS = new Set<TokenKind>([
  "number",
  "fraction",
  "invalid_number",
  "quantity_word",
]);

// What a second amount on the line would be measured in. Counts ("cut into
// 8 slices"), times and temperatures describe the ingredient, not how much
// of it there is.
const MEASURE_UNITS = new Set<string>([
  "mg",
  "g",
  "kg",
  "oz_mass",
  "lb",
  "ml",
  "cl",
  "dl",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "fl_oz",
  "su_bardagi",
  "cay_bardagi",
  "tatli_kasigi",
] satisfies UnitLexeme[]);

function isMultiplier(token: Token | undefined): boolean {
  return (
    (token?.kind === "word" && token.normalized === "x") ||
    (token?.kind === "symbol" && (token.raw === "×" || token.raw === "*"))
  );
}

/**
 * Whether tokens[from, to) hold another measured amount outside
 * parentheses ("1 kg flour + 200 g sugar", "1 cup plus 2 tbsp flour").
 * Scaling only the first would silently be wrong, so such a line is left
 * for review. A number that only describes the ingredient doesn't count:
 * "(about 100 g)", "about 300 g", "1 x 400 g tin", "cut into 8 wedges",
 * "70% dark".
 */
function hasSecondAmount(
  tokens: readonly Token[],
  from: number,
  to: number,
  locale: RecipeLocale,
): boolean {
  let depth = 0;
  for (let index = 0; index < to; index += 1) {
    const token = tokens[index];
    if (token.kind === "lparen") depth += 1;
    if (token.kind === "rparen") depth = Math.max(0, depth - 1);
    if (index < from || depth > 0 || !AMOUNT_KINDS.has(token.kind)) continue;

    let unitIndex = index + 1;
    if (unitQualifier(tokens, unitIndex, locale)) unitIndex += 1;
    const unit = tokens[unitIndex];
    if (unit?.kind !== "unit" || !MEASURE_UNITS.has(String(unit.normalized)))
      continue;

    // Back to where this amount starts: "1 ½", "200-300", "half a".
    let start = index;
    while (
      start > 0 &&
      (AMOUNT_KINDS.has(tokens[start - 1].kind) ||
        (tokens[start - 1].kind === "range" &&
          AMOUNT_KINDS.has(tokens[start - 2]?.kind)))
    ) {
      start -= 1;
    }
    const before = tokens[start - 1];
    if (before?.kind === "modifier" || isMultiplier(before)) continue;
    return true;
  }
  return false;
}

// "a little oil", "un peu de sel", "ein paar Blätter": the article isn't a
// count, so there is nothing to scale.
function isVagueAmount(
  tokens: readonly Token[],
  quantity: QuantityParse,
  locale: RecipeLocale,
): boolean {
  const next = tokens[quantity.nextIndex];
  return (
    quantity.quantity.kind === "exact" &&
    quantity.quantity.value === 1 &&
    tokens[quantity.nextIndex - 1]?.kind === "quantity_word" &&
    next?.kind === "word" &&
    getLocalePack(locale).vagueQuantityWords.includes(String(next.normalized))
  );
}

// An abbreviation's own dot written against it ("tbsp.", "Msp.", "gestr."):
// the index just past it, or the same index when there is none.
function pastAbbreviationDot(tokens: readonly Token[], index: number): number {
  const dot = tokens[index];
  return dot?.raw === "." && dot.startOffset === tokens[index - 1]?.endOffset
    ? index + 1
    : index;
}

// Conservative fallback for "<ingredient> <amount> <unit>" (e.g. "flour 200 g",
// optionally with a trailing "(note)"): only triggers when the text does not
// start with a quantity, and only accepts a match immediately followed by a
// *recognized unit token* - never a bare trailing number - so arbitrary
// numbers inside ingredient names are not reinterpreted.
function parseIngredientFirstSuffix(
  tokens: readonly Token[],
  text: string,
  context: ParseContext,
): SuffixQuantityParse | "ambiguous" | null {
  // Scan candidate amount-start positions left to right so a "<n>-<n> <unit>"
  // range is matched as a whole (via the same parseQuantity used for the
  // amount-first form) instead of a rightmost bare number winning first.
  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index - 1]?.kind === "range") continue;
    const amount = parseQuantity(tokens.slice(index), context.locale);
    if (!amount) continue;

    let unitIndex = index + amount.nextIndex;
    const leadingQualifier = unitQualifier(tokens, unitIndex, context.locale);
    if (leadingQualifier) unitIndex += 1;
    const unitToken = tokens[unitIndex];
    if (unitToken?.kind !== "unit") continue;

    const trailingQualifier = unitQualifier(
      tokens,
      unitIndex + 1,
      context.locale,
    );

    const ingredientText = text.slice(0, tokens[index].startOffset).trim();
    if (!ingredientText) continue;

    const trailing = text.slice((trailingQualifier ?? unitToken).endOffset);
    let note: string | undefined;
    if (unitIndex + 1 + Number(Boolean(trailingQualifier)) !== tokens.length) {
      const parsedNote = trailingParentheticalNote(trailing);
      if (!parsedNote) continue;
      note = parsedNote;
    }

    // "flour 1 kg + sugar 200 g" names two amounts; "type 00 flour 200 g"
    // and "vitamin B12 1 tsp" name one.
    if (hasSecondAmount(tokens, 0, index, context.locale)) return "ambiguous";

    note = joinedNote(leadingQualifier?.raw, trailingQualifier?.raw, note);

    return {
      ingredientText,
      quantity: amount.quantity,
      unit: resolveUnitLexeme(
        String(unitToken.normalized) as UnitLexeme,
        context.sourceMeasurementSystem,
      ),
      ...(note ? { note } : {}),
    };
  }
  return null;
}

// "(1 stick) butter", "(14 oz) can tomatoes": a parenthetical right after
// the amount describes it, so it joins the note and the name stays clean.
function splitLeadingParenthetical(value: string): {
  rest: string;
  note?: string;
} {
  if (!value.startsWith("(")) return { rest: value };
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    if (value[index] === ")") depth -= 1;
    if (depth === 0) {
      const note = value.slice(1, index).trim();
      const rest = value.slice(index + 1).trim();
      return note && rest ? { rest, note } : { rest: value };
    }
  }
  return { rest: value };
}

function splitTrailingParenthetical(value: string): {
  ingredientText: string;
  note?: string;
} {
  const trimmed = value.trim();
  if (!trimmed.endsWith(")")) return { ingredientText: trimmed };

  let depth = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const char = trimmed[index];
    if (char === ")") depth += 1;
    if (char === "(") {
      depth -= 1;
      if (depth === 0) {
        const ingredientText = trimmed.slice(0, index).trim();
        const note = trimmed.slice(index + 1, -1).trim();
        if (ingredientText && note) return { ingredientText, note };
        return { ingredientText: trimmed };
      }
    }
  }

  return { ingredientText: trimmed };
}

// "of flour" -> "flour", "d'huile" -> "huile": the linking word between a
// unit and its ingredient isn't part of the ingredient's name.
function stripUnitConnector(text: string, locale: RecipeLocale): string {
  for (const connector of getLocalePack(locale).unitConnectors) {
    const elided = connector.endsWith("'");
    const stem = connector.replace(/'$/u, "");
    const match = new RegExp(`^${stem}${elided ? "['’]" : "\\s+"}`, "iu").exec(
      text,
    );
    if (match && text.length > match[0].length) {
      return text.slice(match[0].length);
    }
  }
  return text;
}

const BULK_UNITS = new Set<CanonicalUnit>(["kg", "l", "lb"]);

// No home recipe needs a thousand kilos or litres: "1.250 kg Mehl" is 1.25 kg
// written with a thousands dot (or a typo), so it goes to review instead of
// scaling as 1250 kg.
function isImplausibleBulk(quantity: Quantity, unit?: CanonicalUnit): boolean {
  if (!unit || !BULK_UNITS.has(unit)) return false;
  const largest =
    quantity.kind === "range"
      ? quantity.max
      : quantity.kind === "inexact"
        ? 0
        : quantity.value;
  return largest >= 1000;
}

function unparsedIngredient(text: string, ambiguous = false): ParsedIngredient {
  return {
    rawText: text,
    ingredientText: text.trim(),
    confidence: "unparsed",
    ...(ambiguous ? { ambiguous: true as const } : {}),
  };
}

export function parseIngredient(
  text: string,
  context: ParseContext,
): ParsedIngredient {
  const parsed = readIngredient(text, context);
  return parsed.amount && isImplausibleBulk(parsed.amount, parsed.unit)
    ? unparsedIngredient(text, true)
    : parsed;
}

function readIngredient(text: string, context: ParseContext): ParsedIngredient {
  const tokens = lexRecipeText(text, context.locale);
  const quantity = parseQuantity(tokens, context.locale);

  if (!quantity) {
    // A leading number the parser couldn't use ("3-2 tbsp", "1,2,3 g") must
    // not be read as plain text, nor the line re-read from a later number.
    const lead = tokens[0]?.kind === "modifier" ? tokens[1] : tokens[0];
    if (lead && AMOUNT_KINDS.has(lead.kind)) {
      return unparsedIngredient(text, true);
    }
    if (tokens[0]?.kind === "modifier") return unparsedIngredient(text);
    const suffix = parseIngredientFirstSuffix(tokens, text, context);
    if (suffix === "ambiguous") return unparsedIngredient(text, true);
    if (suffix) {
      return {
        rawText: text,
        amount: suffix.quantity,
        unit: suffix.unit,
        ingredientText: suffix.ingredientText,
        ...(suffix.note ? { note: suffix.note } : {}),
        confidence: "exact",
      };
    }
    return unparsedIngredient(text);
  }
  if (isVagueAmount(tokens, quantity, context.locale)) {
    return unparsedIngredient(text);
  }

  let amount = quantity.quantity;
  let nextIndex = quantity.nextIndex;
  let consumedEnd = quantity.endOffset;
  let unit: CanonicalUnit | undefined;
  let ingredientStartOffset = consumedEnd;

  // "1 heaped tbsp", "1 gestr. TL": kept as a note, never extra volume.
  const leadingQualifier = unitQualifier(tokens, nextIndex, context.locale);
  let leadingNote: string | undefined;
  if (leadingQualifier) {
    const unitIndex = pastAbbreviationDot(tokens, nextIndex + 1);
    if (tokens[unitIndex]?.kind === "unit") {
      leadingNote = text.slice(
        leadingQualifier.startOffset,
        tokens[unitIndex - 1].endOffset,
      );
      nextIndex = unitIndex;
    }
  }
  // "1 (400 g) can tomatoes", "2 (15 oz) cans": the size sits between the
  // count and the counted unit, and joins the note.
  let sizeNote: string | undefined;
  if (tokens[nextIndex]?.kind === "lparen") {
    const close = tokens.findIndex(
      (token, index) =>
        index > nextIndex &&
        (token.kind === "rparen" || token.kind === "lparen"),
    );
    const counted = tokens[close + 1];
    if (
      close > nextIndex + 1 &&
      tokens[close].kind === "rparen" &&
      counted?.kind === "unit" &&
      COUNT_UNITS.has(
        resolveUnitLexeme(
          String(counted.normalized) as UnitLexeme,
          context.sourceMeasurementSystem,
        ),
      )
    ) {
      sizeNote = text
        .slice(tokens[nextIndex].endOffset, tokens[close].startOffset)
        .trim();
      nextIndex = close + 1;
    }
  }
  const unitToken = tokens[nextIndex];
  let trailingQualifier: Token | undefined;
  if (unitToken?.kind === "unit") {
    unit = resolveUnitLexeme(
      String(unitToken.normalized) as UnitLexeme,
      context.sourceMeasurementSystem,
    );
    nextIndex = pastAbbreviationDot(tokens, nextIndex + 1);
    consumedEnd = tokens[nextIndex - 1].endOffset;
    ingredientStartOffset =
      unit === "egg" ? unitToken.startOffset : consumedEnd;
    trailingQualifier = unitQualifier(tokens, nextIndex, context.locale);
    if (trailingQualifier) {
      consumedEnd = trailingQualifier.endOffset;
      ingredientStartOffset = consumedEnd;
      nextIndex += 1;
    }
    // "1 taza y media", "1 tasse et demie", "1 cup and a half of flour"
    const afterHalf =
      unit !== "egg" && amount.kind === "exact"
        ? andAHalfAt(tokens, nextIndex, context.locale)
        : null;
    if (afterHalf !== null && amount.kind === "exact") {
      amount = { kind: "exact", value: amount.value + 0.5 };
      consumedEnd = tokens[afterHalf - 1].endOffset;
      ingredientStartOffset = consumedEnd;
      nextIndex = afterHalf;
    }
  }

  if (hasSecondAmount(tokens, nextIndex, tokens.length, context.locale)) {
    return unparsedIngredient(text, true);
  }

  const leading = splitLeadingParenthetical(
    text.slice(ingredientStartOffset).trim(),
  );
  // "1 cup of flour", and "une douzaine d'œufs" with no unit at all.
  const remaining =
    (unit && unit !== "egg") ||
    (!unit && tokens[quantity.nextIndex - 1]?.kind === "quantity_word")
      ? stripUnitConnector(leading.rest, context.locale)
      : leading.rest;
  const split = splitTrailingParenthetical(remaining);

  let ingredientText = split.ingredientText;
  if (!ingredientText && unitToken) {
    ingredientText = unitToken.raw.trim();
  }

  const note = joinedNote(
    sizeNote,
    unit ? leadingNote : undefined,
    trailingQualifier?.raw,
    leading.note,
    split.note,
  );

  return {
    rawText: text,
    amount,
    unit,
    ingredientText,
    ...(note ? { note } : {}),
    confidence: ingredientText ? "exact" : "partial",
  };
}
