import type { TemperatureAnnotation } from "../domain/annotations";
import type { TemperatureUnit } from "../domain/unit";
import type { ParseContext } from "./context";
import { lexRecipeText } from "./lexer";
import { getLocalePack, RECIPE_LOCALES } from "./locales";
import { normalizeLookup } from "./normalize";
import { findPhraseSpans } from "./phrases";
import type { Token } from "./token";

function temperatureUnitFromToken(
  token: Token | undefined,
): TemperatureUnit | null {
  if (!token) return null;
  if (token.kind === "unit") {
    if (token.normalized === "celsius") return "celsius";
    if (token.normalized === "fahrenheit") return "fahrenheit";
  }

  const normalized = String(token.normalized).toLocaleLowerCase();
  if (normalized.startsWith("°c")) return "celsius";
  if (normalized.startsWith("°f")) return "fahrenheit";
  return null;
}

const RANGE_JOINERS = new Set(
  RECIPE_LOCALES.flatMap((locale) => {
    const pack = getLocalePack(locale);
    return [...pack.rangeWords, ...Object.keys(pack.relationConnectors)].map(
      (word) => normalizeLookup(word, locale),
    );
  }),
);

// "180C", "350F": a capital scale letter written right against the number.
// A spaced or lower-case one ("2 c flour") isn't read as a temperature.
function bareScaleUnit(
  number: Token,
  token: Token | undefined,
): TemperatureUnit | null {
  if (token?.kind !== "word" || token.startOffset !== number.endOffset) {
    return null;
  }
  if (token.raw === "C") return "celsius";
  if (token.raw === "F") return "fahrenheit";
  return null;
}

function hasStraddledPreheatAlias(
  text: string,
  temperatureStart: number,
  temperatureEnd: number,
  aliases: readonly string[],
  locale: string,
): boolean {
  const before = text.slice(
    Math.max(0, temperatureStart - 64),
    temperatureStart,
  );
  const after = text.slice(
    temperatureEnd,
    Math.min(text.length, temperatureEnd + 32),
  );

  for (const alias of aliases) {
    const words = alias.trim().split(/\s+/u).filter(Boolean);
    if (words.length < 2) continue;

    for (let split = 1; split < words.length; split += 1) {
      const left = words.slice(0, split).join(" ");
      const right = words.slice(split).join(" ");
      const leftMatches = findPhraseSpans(before, { [left]: true }, locale);
      if (leftMatches.length === 0) continue;
      const rightMatches = findPhraseSpans(after, { [right]: true }, locale);
      if (rightMatches.length > 0) return true;
    }
  }

  return false;
}

interface Span {
  startOffset: number;
  endOffset: number;
}

// The phrase closest before the temperature ("preheat to 180°C"), else the
// first one after it but before the next temperature ("190°C'de önceden
// ısıt", "180 °C Ober-/Unterhitze"): verb-final languages and many recipe
// styles name the oven mode or preheat after the number.
function nearbySpan<T extends Span>(
  text: string,
  spans: readonly T[],
  start: number,
  end: number,
  nextStart: number,
  before: number,
  after: number,
): T | undefined {
  const prior = spans.filter(
    (span) =>
      span.endOffset <= start &&
      start - span.endOffset <= before &&
      !/[.!?]/u.test(text.slice(span.endOffset, start)),
  );
  if (prior.length > 0) return prior[prior.length - 1];
  return spans.find(
    (span) =>
      span.startOffset >= end &&
      span.startOffset - end <= after &&
      span.endOffset <= nextStart &&
      !/[.!?]/u.test(text.slice(end, span.startOffset)),
  );
}

export function parseTemperatures(
  text: string,
  context: ParseContext,
): TemperatureAnnotation[] {
  const tokens = lexRecipeText(text, context.locale);
  const pack = getLocalePack(context.locale);
  const ovenModes = findPhraseSpans(text, pack.ovenModeAliases, context.locale);
  const preheatAliases = Object.fromEntries(
    pack.preheatAliases.map((alias) => [alias, true] as const),
  );
  const preheat = findPhraseSpans(text, preheatAliases, context.locale);

  const found: Array<{
    number: Token;
    unitToken: Token;
    unit: TemperatureUnit;
  }> = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const number = tokens[index];
    if (number.kind !== "number") continue;
    // The upper end of a range or alternative ("180-200°C", "between 180
    // and 200°C", "180 ou 200 °C") is not a temperature on its own. The
    // joining word counts in any language: a temperature reads the same in
    // every one, so otherwise another language would pick up the "200°C"
    // this one deliberately left.
    const joiner = tokens[index - 1];
    if (
      tokens[index - 2]?.kind === "number" &&
      (joiner?.kind === "range" ||
        (joiner?.kind === "word" &&
          RANGE_JOINERS.has(String(joiner.normalized))))
    )
      continue;
    const unitToken = tokens[index + 1];
    const unit =
      temperatureUnitFromToken(unitToken) ?? bareScaleUnit(number, unitToken);
    if (unit) found.push({ number, unitToken, unit });
  }

  return found.map(({ number, unitToken, unit }, index) => {
    const start = number.startOffset;
    const end = unitToken.endOffset;
    const nextStart = found[index + 1]?.number.startOffset ?? text.length;
    const nearbyMode = nearbySpan(
      text,
      ovenModes,
      start,
      end,
      nextStart,
      24,
      24,
    );
    const isPreheated =
      Boolean(nearbySpan(text, preheat, start, end, nextStart, 64, 40)) ||
      hasStraddledPreheatAlias(
        text,
        start,
        end,
        pack.preheatAliases,
        context.locale,
      );

    return {
      kind: "temperature",
      value: Number(number.normalized),
      unit,
      ...(nearbyMode ? { ovenMode: nearbyMode.value } : {}),
      ...(isPreheated ? { preheat: true } : {}),
      rawText: text.slice(start, end),
      startOffset: start,
      endOffset: end,
    };
  });
}
