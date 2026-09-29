import type { DurationAnnotation } from "../domain/annotations";
import { modifiedQuantity, type Quantity } from "../domain/quantity";
import type { RecipeLocale } from "../domain/recipe";
import type { TimeUnit } from "../domain/unit";
import { convertUnit } from "../units/convert";
import type { ParseContext } from "./context";
import { andAHalfAt, isAndWord, lexRecipeText, parseAmountAtom } from "./lexer";
import { getLocalePack, type RecipeLocalePack } from "./locales";
import { escapeRegExp, normalizeLookup } from "./normalize";
import { findPhraseSpans } from "./phrases";
import type { Token } from "./token";

interface DurationCandidate {
  annotation: DurationAnnotation;
  nextIndex: number;
}

function isTimeUnit(value: unknown): value is TimeUnit {
  return (
    value === "second" ||
    value === "minute" ||
    value === "hour" ||
    value === "day"
  );
}

interface TimeAt {
  value: number;
  unit: TimeUnit;
  // Set when minutes followed the hours without a unit ("1 h 30").
  clockHours?: number;
  nextIndex: number;
  endOffset: number;
}

// Minutes written after hours without their unit ("1 h 30", "1h30"): a
// whole number under 60 right after the hour unit, with no unit of its own.
function bareMinutesAt(
  tokens: readonly Token[],
  index: number,
  afterOffset: number,
): number | null {
  const token = tokens[index];
  const value = Number(token?.normalized);
  if (
    token?.kind !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value >= 60 ||
    token.startOffset - afterOffset > 1
  ) {
    return null;
  }
  const next = tokens[index + 1]?.kind;
  return next === "unit" || next === "fraction" ? null : value;
}

// The next smaller unit a time can continue in, and how many make one of it.
const SMALLER_UNIT: Partial<Record<TimeUnit, { unit: TimeUnit; per: number }>> =
  {
    day: { unit: "hour", per: 24 },
    hour: { unit: "minute", per: 60 },
    minute: { unit: "second", per: 60 },
  };

// A time continued in the next smaller unit right after it: "1 hour 15
// minutes", "1 saat 15 dakika", "1 Stunde und 15 Minuten", "2 min 30 s".
// Folded into one time so it offers one 1:15:00 timer, not 1:00:00 + 15:00.
function continueTimeAt(
  tokens: readonly Token[],
  time: TimeAt,
  locale: RecipeLocale,
): void {
  for (;;) {
    const smaller = SMALLER_UNIT[time.unit];
    if (!smaller) return;
    let index = time.nextIndex;
    let afterOffset = time.endOffset;
    if (isAndWord(tokens[index], getLocalePack(locale))) {
      if (tokens[index].startOffset - afterOffset > 1) return;
      afterOffset = tokens[index].endOffset;
      index += 1;
    }
    const atom = parseAmountAtom(tokens, index, locale);
    const unitToken = atom ? tokens[atom.nextIndex] : undefined;
    if (
      !atom ||
      tokens[index].startOffset - afterOffset > 1 ||
      !Number.isInteger(atom.value) ||
      atom.value <= 0 ||
      atom.value >= smaller.per ||
      unitToken?.kind !== "unit" ||
      unitToken.normalized !== smaller.unit
    ) {
      return;
    }
    time.value = time.value * smaller.per + atom.value;
    time.unit = smaller.unit;
    time.nextIndex = atom.nextIndex + 1;
    time.endOffset = unitToken.endOffset;
  }
}

// One time at tokens[index]: an amount with its time unit, "and a half"
// after it ("an hour and a half", "une heure et demie") - but not "20 min
// and a half hour later", where the half has its own unit - and minutes
// written after the hours, with their unit or without ("1 h 30").
function parseTimeAt(
  tokens: readonly Token[],
  index: number,
  locale: RecipeLocale,
): TimeAt | null {
  const atom = parseAmountAtom(tokens, index, locale);
  if (!atom) return null;
  const unitToken = tokens[atom.nextIndex];
  if (unitToken?.kind !== "unit" || !isTimeUnit(unitToken.normalized)) {
    return null;
  }
  const time: TimeAt = {
    value: atom.value,
    unit: unitToken.normalized,
    nextIndex: atom.nextIndex + 1,
    endOffset: unitToken.endOffset,
  };
  const afterHalf = andAHalfAt(tokens, time.nextIndex, locale);
  if (afterHalf !== null && tokens[afterHalf]?.kind !== "unit") {
    time.value += 0.5;
    time.endOffset = tokens[afterHalf - 1].endOffset;
    time.nextIndex = afterHalf;
  }
  const minutes =
    time.unit === "hour"
      ? bareMinutesAt(tokens, time.nextIndex, time.endOffset)
      : null;
  if (minutes !== null) {
    time.clockHours = time.value;
    time.value = time.value * 60 + minutes;
    time.unit = "minute";
    time.endOffset = tokens[time.nextIndex].endOffset;
    time.nextIndex += 1;
  } else if (Number.isInteger(time.value)) {
    continueTimeAt(tokens, time, locale);
  }
  return time;
}

// The upper end of "<time> - <time>" when each end carries its unit ("10
// min to 15 min", "1 h 30 à 2 h") or continues the hours ("1 h 30-40"),
// in the lower end's unit.
function rangeUpperAt(
  tokens: readonly Token[],
  index: number,
  lower: TimeAt,
  locale: RecipeLocale,
): {
  value: number;
  unit: TimeUnit;
  nextIndex: number;
  endOffset: number;
} | null {
  const upper = parseTimeAt(tokens, index, locale);
  if (upper) {
    const unit = upper.unit === lower.unit ? lower.unit : "minute";
    return {
      value: convertUnit(upper.value, upper.unit, unit),
      unit,
      nextIndex: upper.nextIndex,
      endOffset: upper.endOffset,
    };
  }
  const minutes =
    lower.clockHours === undefined
      ? null
      : bareMinutesAt(tokens, index, tokens[index - 1].endOffset);
  if (minutes === null || lower.clockHours === undefined) return null;
  return {
    value: lower.clockHours * 60 + minutes,
    unit: "minute",
    nextIndex: index + 1,
    endOffset: tokens[index].endOffset,
  };
}

function postposition(
  modifier: Token,
  pack: RecipeLocalePack,
): string | undefined {
  const word = normalizeLookup(modifier.raw, pack.code);
  return Object.hasOwn(pack.postpositionalModifiers, word)
    ? pack.postpositionalModifiers[word]
    : undefined;
}

// A time word in the dative: another form of the same unit with the ending
// glued on ("dakika" + "ya"), or the ending after an apostrophe ("dk'ya").
function isDative(word: Token, pack: RecipeLocalePack): boolean {
  if (word.kind !== "unit") return false;
  const [stem, ending] = normalizeLookup(word.raw, pack.code).split(/['’]/u);
  return pack.dativeEndings.some((dative) =>
    ending === undefined
      ? stem.endsWith(dative) &&
        pack.unitAliases[stem.slice(0, -dative.length)] === word.normalized
      : ending === dative,
  );
}

// What a modifier after a time means: a postposition has its own meaning
// after the time word as is ("10 dakika kadar", about ten minutes) and its
// modifier one after the dative ("10 dakikaya kadar", up to ten).
function suffixModifierMeaning(
  modifier: Token,
  timeWord: Token,
  pack: RecipeLocalePack,
): string {
  const bare = postposition(modifier, pack);
  return bare === undefined || isDative(timeWord, pack)
    ? String(modifier.normalized)
    : bare;
}

function parseDurationAt(
  text: string,
  tokens: readonly Token[],
  startIndex: number,
  locale: RecipeLocale,
): DurationCandidate | null {
  const pack = getLocalePack(locale);
  let index = startIndex;
  let prefixModifier: string | undefined;

  if (tokens[index]?.kind === "modifier") {
    // "köpük kıvamına gelene kadar 5 dakika": the postposition closes the
    // clause before it; the time starts at its number.
    if (postposition(tokens[index], pack) !== undefined) return null;
    prefixModifier = String(tokens[index].normalized);
    index += 1;
  }

  const first = parseAmountAtom(tokens, index, locale);
  if (!first) return null;

  let quantity: Quantity;
  let unit: TimeUnit;
  let nextIndex: number;
  let endOffset: number;

  if (tokens[first.nextIndex]?.kind === "range") {
    // "10-12 min": two numbers sharing one unit. A reversed range ("12-10
    // min") is not a valid structured quantity - reject it outright rather
    // than keep just the first number or reorder min/max.
    const second = parseAmountAtom(tokens, first.nextIndex + 1, locale);
    if (!second) return null;
    if (second.value < first.value) return null;
    const unitToken = tokens[second.nextIndex];
    if (unitToken?.kind !== "unit" || !isTimeUnit(unitToken.normalized)) {
      return null;
    }
    quantity = { kind: "range", min: first.value, max: second.value };
    unit = unitToken.normalized;
    nextIndex = second.nextIndex + 1;
    endOffset = unitToken.endOffset;
  } else {
    const time = parseTimeAt(tokens, index, locale);
    if (!time) return null;
    quantity = modifiedQuantity(prefixModifier, time.value);
    unit = time.unit;
    nextIndex = time.nextIndex;
    endOffset = time.endOffset;

    const upper =
      quantity.kind === "exact" && tokens[nextIndex]?.kind === "range"
        ? rangeUpperAt(tokens, nextIndex + 1, time, locale)
        : null;
    if (upper) {
      const low = convertUnit(time.value, unit, upper.unit);
      if (upper.value <= low) return null;
      quantity = { kind: "range", min: low, max: upper.value };
      unit = upper.unit;
      nextIndex = upper.nextIndex;
      endOffset = upper.endOffset;
    }
  }

  const suffixModifier = tokens[nextIndex];
  if (suffixModifier?.kind === "modifier" && quantity.kind === "exact") {
    quantity = modifiedQuantity(
      suffixModifierMeaning(suffixModifier, tokens[nextIndex - 1], pack),
      quantity.value,
    );
    endOffset = suffixModifier.endOffset;
    nextIndex += 1;
  }

  const startOffset = tokens[startIndex].startOffset;
  return {
    annotation: {
      kind: "duration",
      value: quantity,
      unit,
      rawText: text.slice(startOffset, endOffset),
      startOffset,
      endOffset,
    },
    nextIndex,
  };
}

function attachConditions(
  text: string,
  context: ParseContext,
  annotations: DurationAnnotation[],
): DurationAnnotation[] {
  const pack = getLocalePack(context.locale);
  const relations = findPhraseSpans(
    text,
    pack.relationConnectors,
    context.locale,
  );
  const maximumMarkers = findPhraseSpans(
    text,
    Object.fromEntries(
      Object.entries(pack.temporalModifiers).filter(
        ([, value]) => value === "maximum",
      ),
    ),
    context.locale,
  );

  return annotations.map((annotation, index) => {
    const nextDurationStart =
      annotations[index + 1]?.startOffset ?? text.length;
    const relation = relations.find(
      (candidate) =>
        candidate.startOffset >= annotation.endOffset &&
        candidate.startOffset < nextDurationStart,
    );
    if (!relation) return annotation;

    const afterRelation = text.slice(relation.endOffset, nextDurationStart);
    const leadingWhitespace =
      afterRelation.length - afterRelation.trimStart().length;
    const conditionStart = relation.endOffset + leadingWhitespace;
    if (conditionStart >= nextDurationStart) return annotation;

    const maxMarker = maximumMarkers.find(
      (candidate) =>
        candidate.startOffset >= conditionStart &&
        candidate.endOffset <= nextDurationStart,
    );
    const conditionEnd = maxMarker?.endOffset ?? nextDurationStart;
    const conditionText = text.slice(conditionStart, conditionEnd).trim();
    if (!conditionText) return annotation;

    return {
      ...annotation,
      relation: relation.value,
      conditionText,
    };
  });
}

// A clause ends at . ; ! ? or a comma, except inside a number ("1,5 saat",
// "1.5 h") and at an abbreviation's dot followed by more of the sentence in
// lower case ("10 Min. backen").
function isClauseBoundary(text: string, index: number): boolean {
  const char = text[index];
  if (!/[.;!?,]/u.test(char)) return false;
  if ((char === "," || char === ".") && /\d/u.test(text[index - 1] ?? "")) {
    if (/\d/u.test(text[index + 1] ?? "")) return false;
  }
  if (char === ".") {
    const rest = text.slice(index + 1);
    if (/^\s+\p{Ll}/u.test(rest)) return false;
  }
  return true;
}

function clauseEnds(
  text: string,
  start: number,
  end: number,
): { from: number; to: number } {
  let from = start;
  while (from > 0 && !isClauseBoundary(text, from - 1)) from -= 1;
  let to = end;
  while (to < text.length && !isClauseBoundary(text, to)) to += 1;
  return { from, to };
}

/**
 * Whether the clause holding text[start, end) tells the cook NOT to do
 * something: a negation word anywhere in it, or (for suffix-negating
 * languages) a negative imperative as its last word after the duration -
 * "15-16 dakikaya kadar pişirme", not a noun earlier in the clause.
 */
function inNegatedClause(
  text: string,
  start: number,
  end: number,
  context: ParseContext,
): boolean {
  const pack = getLocalePack(context.locale);
  const clause = clauseEnds(text, start, end);
  const whole = text.slice(clause.from, clause.to);
  for (const word of pack.negationWords) {
    const elided = word.endsWith("'");
    const stem = escapeRegExp(elided ? word.slice(0, -1) : word);
    const pattern = new RegExp(
      `(?<!\\p{L})${stem}${elided ? "['’]" : "(?!\\p{L})"}`,
      "iu",
    );
    if (pattern.test(whole)) return true;
  }
  const words = text.slice(end, clause.to).match(/\p{L}+/gu);
  const last = words?.[words.length - 1]?.toLocaleLowerCase(context.locale);
  return Boolean(
    last &&
      pack.negativeImperativeSuffixes.some(
        (suffix) => last.length > suffix.length + 2 && last.endsWith(suffix),
      ),
  );
}

export function parseDurations(
  text: string,
  context: ParseContext,
): DurationAnnotation[] {
  const tokens = lexRecipeText(text, context.locale);
  const numeric: DurationAnnotation[] = [];

  let index = 0;
  while (index < tokens.length) {
    const candidate = parseDurationAt(text, tokens, index, context.locale);
    if (candidate) {
      numeric.push(candidate.annotation);
      index = candidate.nextIndex;
      continue;
    }
    const first = parseAmountAtom(tokens, index, context.locale);
    const second =
      first && tokens[first.nextIndex]?.kind === "range"
        ? parseAmountAtom(tokens, first.nextIndex + 1, context.locale)
        : null;
    if (second) {
      index = second.nextIndex;
      continue;
    }
    index += 1;
  }

  const pack = getLocalePack(context.locale);
  // Overlapping phrases ("bir gece boyunca" holds "bir gece" and "gece
  // boyunca") name one duration: keep the first.
  let coveredUntil = -1;
  const inexact = findPhraseSpans(text, pack.inexactDurations, context.locale)
    .filter((span) => {
      if (span.startOffset < coveredUntil) return false;
      coveredUntil = span.endOffset;
      return true;
    })
    .map<DurationAnnotation>((span) => ({
      kind: "duration",
      value: { kind: "inexact", expression: span.value },
      rawText: span.rawText,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
    }));

  const combined = [...numeric, ...inexact].sort(
    (a, b) => a.startOffset - b.startOffset,
  );
  return attachConditions(text, context, combined).map((annotation) =>
    inNegatedClause(text, annotation.startOffset, annotation.endOffset, context)
      ? { ...annotation, negated: true as const }
      : annotation,
  );
}
