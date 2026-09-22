import type { TemperatureAnnotation } from "../domain/annotations";
import type { TemperatureUnit } from "../domain/unit";
import type { ParseContext } from "./context";
import { lexRecipeText } from "./lexer";
import { getLocalePack } from "./locales";
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
  const annotations: TemperatureAnnotation[] = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const number = tokens[index];
    if (number.kind !== "number") continue;

    const unitToken = tokens[index + 1];
    const unit = temperatureUnitFromToken(unitToken);
    if (!unit) continue;

    const nearbyMode = [...ovenModes]
      .reverse()
      .find(
        (span) =>
          span.endOffset <= number.startOffset &&
          number.startOffset - span.endOffset <= 24,
      );
    const nearbyPreheat = [...preheat]
      .reverse()
      .find(
        (span) =>
          span.endOffset <= number.startOffset &&
          number.startOffset - span.endOffset <= 64,
      );
    const isPreheated =
      Boolean(nearbyPreheat) ||
      hasStraddledPreheatAlias(
        text,
        number.startOffset,
        unitToken.endOffset,
        pack.preheatAliases,
        context.locale,
      );

    annotations.push({
      kind: "temperature",
      value: Number(number.normalized),
      unit,
      ...(nearbyMode ? { ovenMode: nearbyMode.value } : {}),
      ...(isPreheated ? { preheat: true } : {}),
      rawText: text.slice(number.startOffset, unitToken.endOffset),
      startOffset: number.startOffset,
      endOffset: unitToken.endOffset,
    });
  }

  return annotations;
}
