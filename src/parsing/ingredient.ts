import type { Quantity } from "../domain/quantity";
import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import type { ParseContext } from "./context";
import { lexRecipeText } from "./lexer";
import type { UnitLexeme } from "./locales";
import type { Token } from "./token";

export type ParseConfidence = "exact" | "partial" | "unparsed";

export interface ParsedIngredient {
  rawText: string;
  amount?: Quantity;
  unit?: CanonicalUnit;
  ingredientText: string;
  note?: string;
  confidence: ParseConfidence;
}

interface QuantityParse {
  quantity: Quantity;
  nextIndex: number;
  endOffset: number;
}

function resolveCookingUnit(
  generic: "tsp" | "tbsp" | "cup",
  system: MeasurementSystem,
): CanonicalUnit {
  if (system === "us") return `${generic}_us` as CanonicalUnit;
  if (system === "imperial") return `${generic}_imperial` as CanonicalUnit;
  return `${generic}_metric` as CanonicalUnit;
}

export function resolveUnitLexeme(
  unit: UnitLexeme,
  system: MeasurementSystem,
): CanonicalUnit {
  switch (unit) {
    case "tsp":
    case "tbsp":
    case "cup":
      return resolveCookingUnit(unit, system);
    case "fl_oz":
      return system === "imperial" ? "fl_oz_imperial" : "fl_oz_us";
    default:
      return unit;
  }
}

function numericAtom(tokens: Token[], index: number): QuantityParse | null {
  const token = tokens[index];
  if (!token) return null;

  if (
    token.kind !== "number" &&
    token.kind !== "fraction" &&
    token.kind !== "quantity_word"
  ) {
    return null;
  }

  let value = Number(token.normalized);
  let nextIndex = index + 1;
  let endOffset = token.endOffset;

  if (token.kind === "number" && tokens[nextIndex]?.kind === "fraction") {
    value += Number(tokens[nextIndex].normalized);
    endOffset = tokens[nextIndex].endOffset;
    nextIndex += 1;
  }

  return {
    quantity: { kind: "exact", value },
    nextIndex,
    endOffset,
  };
}

function applyModifier(modifier: string, quantity: Quantity): Quantity {
  if (quantity.kind !== "exact") return quantity;

  if (modifier === "approximate") {
    return { kind: "approximate", value: quantity.value };
  }
  if (modifier === "minimum") {
    return { kind: "minimum", value: quantity.value };
  }
  if (modifier === "maximum") {
    return { kind: "maximum", value: quantity.value };
  }
  return quantity;
}

function parseQuantity(tokens: Token[]): QuantityParse | null {
  let index = 0;
  let modifier: string | undefined;

  if (tokens[index]?.kind === "modifier") {
    modifier = String(tokens[index].normalized);
    index += 1;
  }

  const first = numericAtom(tokens, index);
  if (!first) return null;

  const rangeToken = tokens[first.nextIndex];
  if (rangeToken?.kind === "range") {
    const second = numericAtom(tokens, first.nextIndex + 1);
    if (
      second &&
      first.quantity.kind === "exact" &&
      second.quantity.kind === "exact"
    ) {
      // A reversed range ("3-2 tbsp") is not a valid structured quantity.
      // Reject the whole quantity rather than silently keeping just the
      // first number (misleadingly confident) or reordering min/max
      // (guessing the author's intent).
      if (second.quantity.value < first.quantity.value) return null;
      return {
        quantity: {
          kind: "range",
          min: first.quantity.value,
          max: second.quantity.value,
        },
        nextIndex: second.nextIndex,
        endOffset: second.endOffset,
      };
    }
  }

  return {
    quantity: modifier
      ? applyModifier(modifier, first.quantity)
      : first.quantity,
    nextIndex: first.nextIndex,
    endOffset: first.endOffset,
  };
}

interface SuffixQuantityParse {
  ingredientText: string;
  quantity: Quantity;
  unit: CanonicalUnit;
}

// Conservative fallback for "<ingredient> <amount> <unit>" (e.g. "flour 200 g"):
// only triggers when the text does not start with a quantity, and only accepts
// a match where the amount+unit run all the way to the end of the text and is
// immediately followed by a *recognized unit token* - never a bare trailing
// number - so arbitrary numbers inside ingredient names are not reinterpreted.
function parseIngredientFirstSuffix(
  tokens: Token[],
  text: string,
  context: ParseContext,
): SuffixQuantityParse | null {
  // Scan candidate amount-start positions left to right so a "<n>-<n> <unit>"
  // range is matched as a whole (via the same parseQuantity used for the
  // amount-first form) instead of a rightmost bare number winning first.
  for (let index = 1; index < tokens.length; index += 1) {
    const amount = parseQuantity(tokens.slice(index));
    if (!amount) continue;

    const unitIndex = index + amount.nextIndex;
    const unitToken = tokens[unitIndex];
    if (unitToken?.kind !== "unit" || unitIndex + 1 !== tokens.length) continue;

    const ingredientText = text.slice(0, tokens[index].startOffset).trim();
    if (!ingredientText) continue;

    return {
      ingredientText,
      quantity: amount.quantity,
      unit: resolveUnitLexeme(
        String(unitToken.normalized) as UnitLexeme,
        context.sourceMeasurementSystem,
      ),
    };
  }
  return null;
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

export function parseIngredient(
  text: string,
  context: ParseContext,
): ParsedIngredient {
  const tokens = lexRecipeText(text, context.locale);
  const quantity = parseQuantity(tokens);

  if (!quantity) {
    const suffix = parseIngredientFirstSuffix(tokens, text, context);
    if (suffix) {
      return {
        rawText: text,
        amount: suffix.quantity,
        unit: suffix.unit,
        ingredientText: suffix.ingredientText,
        confidence: "exact",
      };
    }
    return {
      rawText: text,
      ingredientText: text.trim(),
      confidence: "unparsed",
    };
  }

  let nextIndex = quantity.nextIndex;
  let consumedEnd = quantity.endOffset;
  let unit: CanonicalUnit | undefined;
  let ingredientStartOffset = consumedEnd;

  const unitToken = tokens[nextIndex];
  if (unitToken?.kind === "unit") {
    unit = resolveUnitLexeme(
      String(unitToken.normalized) as UnitLexeme,
      context.sourceMeasurementSystem,
    );
    consumedEnd = unitToken.endOffset;
    ingredientStartOffset =
      unit === "egg" ? unitToken.startOffset : consumedEnd;
    nextIndex += 1;
  }

  const remaining = text.slice(ingredientStartOffset).trim();
  const split = splitTrailingParenthetical(remaining);

  let ingredientText = split.ingredientText;
  if (!ingredientText && unitToken) {
    ingredientText = unitToken.raw.trim();
  }

  return {
    rawText: text,
    amount: quantity.quantity,
    unit,
    ingredientText,
    ...(split.note ? { note: split.note } : {}),
    confidence: ingredientText ? "exact" : "partial",
  };
}
