import type { DurationAnnotation } from "../domain/annotations";
import type { Quantity } from "../domain/quantity";
import type { TimeUnit } from "../domain/unit";
import type { ParseContext } from "./context";
import { lexRecipeText } from "./lexer";
import { getLocalePack } from "./locales";
import { findPhraseSpans } from "./phrases";
import type { Token } from "./token";

interface QuantityAtom {
  value: number;
  nextIndex: number;
  startOffset: number;
  endOffset: number;
}

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

function parseAtom(tokens: Token[], index: number): QuantityAtom | null {
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
    value,
    nextIndex,
    startOffset: token.startOffset,
    endOffset,
  };
}

function applyModifier(kind: string | undefined, value: number): Quantity {
  switch (kind) {
    case "approximate":
      return { kind: "approximate", value };
    case "minimum":
      return { kind: "minimum", value };
    case "maximum":
      return { kind: "maximum", value };
    default:
      return { kind: "exact", value };
  }
}

function parseDurationAt(
  text: string,
  tokens: Token[],
  startIndex: number,
): DurationCandidate | null {
  let index = startIndex;
  let prefixModifier: string | undefined;

  if (tokens[index]?.kind === "modifier") {
    prefixModifier = String(tokens[index].normalized);
    index += 1;
  }

  const first = parseAtom(tokens, index);
  if (!first) return null;

  let quantity: Quantity = applyModifier(prefixModifier, first.value);
  let quantityEndIndex = first.nextIndex;

  if (tokens[first.nextIndex]?.kind === "range") {
    const second = parseAtom(tokens, first.nextIndex + 1);
    if (second) {
      quantity = { kind: "range", min: first.value, max: second.value };
      quantityEndIndex = second.nextIndex;
    }
  }

  const unitToken = tokens[quantityEndIndex];
  if (unitToken?.kind !== "unit" || !isTimeUnit(unitToken.normalized)) {
    return null;
  }

  let nextIndex = quantityEndIndex + 1;
  let endOffset = unitToken.endOffset;
  const suffixModifier = tokens[nextIndex];
  if (suffixModifier?.kind === "modifier" && quantity.kind === "exact") {
    quantity = applyModifier(String(suffixModifier.normalized), quantity.value);
    endOffset = suffixModifier.endOffset;
    nextIndex += 1;
  }

  const startOffset = tokens[startIndex].startOffset;
  return {
    annotation: {
      kind: "duration",
      value: quantity,
      unit: unitToken.normalized,
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

export function parseDurations(
  text: string,
  context: ParseContext,
): DurationAnnotation[] {
  const tokens = lexRecipeText(text, context.locale);
  const numeric: DurationAnnotation[] = [];

  let index = 0;
  while (index < tokens.length) {
    const candidate = parseDurationAt(text, tokens, index);
    if (candidate) {
      numeric.push(candidate.annotation);
      index = candidate.nextIndex;
      continue;
    }
    index += 1;
  }

  const pack = getLocalePack(context.locale);
  const inexact = findPhraseSpans(
    text,
    pack.inexactDurations,
    context.locale,
  ).map<DurationAnnotation>((span) => ({
    kind: "duration",
    value: { kind: "inexact", expression: span.value },
    rawText: span.rawText,
    startOffset: span.startOffset,
    endOffset: span.endOffset,
  }));

  const combined = [...numeric, ...inexact].sort(
    (a, b) => a.startOffset - b.startOffset,
  );
  return attachConditions(text, context, combined);
}
