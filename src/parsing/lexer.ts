import type { RecipeLocale } from "../domain/recipe";
import { getLocalePack } from "./locales";
import type { RecipeLocalePack } from "./locales/types";
import {
  normalizeDash,
  normalizeLookup,
  parseSlashFraction,
  VULGAR_FRACTIONS,
} from "./normalize";
import type { Token, TokenKind } from "./token";

const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const DIGIT = /[0-9]/;
const DASHES = new Set(["-", "–", "—", "−"]);
const WORD_JOINERS = new Set(["'", "’"]);

interface AliasCandidate {
  parts: string[];
  kind: Extract<
    TokenKind,
    "unit" | "quantity_word" | "modifier" | "sequence" | "heat" | "range"
  >;
  normalized: string | number;
}

function isDigit(value: string | undefined): boolean {
  return value !== undefined && DIGIT.test(value);
}

function isLetterOrMark(value: string | undefined): boolean {
  return value !== undefined && LETTER_OR_MARK.test(value);
}

function acceptedDecimalSeparator(
  char: string,
  pack: RecipeLocalePack,
): boolean {
  return char === pack.decimalSeparator || char === ".";
}

function scanNumber(
  input: string,
  start: number,
  pack: RecipeLocalePack,
): { token: Token; end: number } {
  let end = start;
  while (isDigit(input[end])) end += 1;

  if (input[end] === "/" && isDigit(input[end + 1])) {
    let denominatorEnd = end + 1;
    while (isDigit(input[denominatorEnd])) denominatorEnd += 1;
    const raw = input.slice(start, denominatorEnd);
    const fraction = parseSlashFraction(raw);
    if (fraction !== null) {
      return {
        token: {
          kind: "fraction",
          raw,
          normalized: fraction,
          startOffset: start,
          endOffset: denominatorEnd,
        },
        end: denominatorEnd,
      };
    }
  }

  if (
    acceptedDecimalSeparator(input[end] ?? "", pack) &&
    isDigit(input[end + 1])
  ) {
    end += 1;
    while (isDigit(input[end])) end += 1;
  }

  const raw = input.slice(start, end);
  const normalizedNumber = Number(raw.replace(",", "."));

  return {
    token: {
      kind: "number",
      raw,
      normalized: normalizedNumber,
      startOffset: start,
      endOffset: end,
    },
    end,
  };
}

function scanWord(
  input: string,
  start: number,
  locale: string,
): { token: Token; end: number } {
  let end = start;

  if (input[end] === "°" && isLetterOrMark(input[end + 1])) {
    end += 1;
  }

  while (end < input.length) {
    const char = input[end];
    if (isLetterOrMark(char)) {
      end += 1;
      continue;
    }

    if (
      WORD_JOINERS.has(char) &&
      isLetterOrMark(input[end - 1]) &&
      isLetterOrMark(input[end + 1])
    ) {
      end += 1;
      continue;
    }

    if (
      char === "-" &&
      isLetterOrMark(input[end - 1]) &&
      isLetterOrMark(input[end + 1])
    ) {
      end += 1;
      continue;
    }

    break;
  }

  const raw = input.slice(start, end);
  return {
    token: {
      kind: "word",
      raw,
      normalized: normalizeLookup(raw, locale),
      startOffset: start,
      endOffset: end,
    },
    end,
  };
}

function scanRawTokens(input: string, pack: RecipeLocalePack): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const char = input[cursor];

    if (/\s/u.test(char)) {
      cursor += 1;
      continue;
    }

    if (isDigit(char)) {
      const scanned = scanNumber(input, cursor, pack);
      tokens.push(scanned.token);
      cursor = scanned.end;
      continue;
    }

    if (char in VULGAR_FRACTIONS) {
      tokens.push({
        kind: "fraction",
        raw: char,
        normalized: VULGAR_FRACTIONS[char],
        startOffset: cursor,
        endOffset: cursor + 1,
      });
      cursor += 1;
      continue;
    }

    if (DASHES.has(char)) {
      tokens.push({
        kind: "range",
        raw: char,
        normalized: normalizeDash(char),
        startOffset: cursor,
        endOffset: cursor + 1,
      });
      cursor += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({
        kind: "lparen",
        raw: char,
        normalized: char,
        startOffset: cursor,
        endOffset: cursor + 1,
      });
      cursor += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({
        kind: "rparen",
        raw: char,
        normalized: char,
        startOffset: cursor,
        endOffset: cursor + 1,
      });
      cursor += 1;
      continue;
    }

    if (char === ",") {
      tokens.push({
        kind: "comma",
        raw: char,
        normalized: char,
        startOffset: cursor,
        endOffset: cursor + 1,
      });
      cursor += 1;
      continue;
    }

    if (
      isLetterOrMark(char) ||
      (char === "°" && isLetterOrMark(input[cursor + 1]))
    ) {
      const scanned = scanWord(input, cursor, pack.code);
      tokens.push(scanned.token);
      cursor = scanned.end;
      continue;
    }

    tokens.push({
      kind: "symbol",
      raw: char,
      normalized: char,
      startOffset: cursor,
      endOffset: cursor + 1,
    });
    cursor += 1;
  }

  return tokens;
}

function normalizedAliasValue<T>(
  aliases: Readonly<Record<string, T>>,
  candidate: string,
  locale: string,
): T | undefined {
  for (const [alias, value] of Object.entries(aliases)) {
    if (normalizeLookup(alias, locale) === candidate) return value;
  }
  return undefined;
}

function expandHyphenatedQuantityUnitCompounds(
  tokens: Token[],
  pack: RecipeLocalePack,
): Token[] {
  const expanded: Token[] = [];

  for (const token of tokens) {
    if (token.kind !== "word") {
      expanded.push(token);
      continue;
    }

    const hyphenOffset = token.raw.indexOf("-");
    if (
      hyphenOffset <= 0 ||
      hyphenOffset !== token.raw.lastIndexOf("-") ||
      hyphenOffset >= token.raw.length - 1
    ) {
      expanded.push(token);
      continue;
    }

    const leftRaw = token.raw.slice(0, hyphenOffset);
    const rightRaw = token.raw.slice(hyphenOffset + 1);
    const left = normalizeLookup(leftRaw, pack.code);
    const right = normalizeLookup(rightRaw, pack.code);
    const quantity = normalizedAliasValue(pack.quantityWords, left, pack.code);
    const unit = normalizedAliasValue(pack.unitAliases, right, pack.code);

    if (quantity === undefined || unit === undefined) {
      expanded.push(token);
      continue;
    }

    const separatorOffset = token.startOffset + hyphenOffset;
    expanded.push(
      {
        kind: "quantity_word",
        raw: leftRaw,
        normalized: quantity,
        startOffset: token.startOffset,
        endOffset: separatorOffset,
      },
      {
        kind: "unit",
        raw: rightRaw,
        normalized: unit,
        startOffset: separatorOffset + 1,
        endOffset: token.endOffset,
      },
    );
  }

  return expanded;
}

function aliasParts(alias: string, pack: RecipeLocalePack): string[] {
  return alias
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => normalizeLookup(part, pack.code));
}

function aliasCandidates(pack: RecipeLocalePack): AliasCandidate[] {
  const candidates: AliasCandidate[] = [];

  for (const [alias, value] of Object.entries(pack.unitAliases)) {
    candidates.push({
      parts: aliasParts(alias, pack),
      kind: "unit",
      normalized: value,
    });
  }
  for (const [alias, value] of Object.entries(pack.quantityWords)) {
    candidates.push({
      parts: aliasParts(alias, pack),
      kind: "quantity_word",
      normalized: value,
    });
  }
  for (const [alias, value] of Object.entries(pack.temporalModifiers)) {
    candidates.push({
      parts: aliasParts(alias, pack),
      kind: "modifier",
      normalized: value,
    });
  }
  for (const [alias, value] of Object.entries(pack.sequenceConnectors)) {
    candidates.push({
      parts: aliasParts(alias, pack),
      kind: "sequence",
      normalized: value,
    });
  }
  for (const alias of Object.keys(pack.heatAliases)) {
    candidates.push({
      parts: aliasParts(alias, pack),
      kind: "heat",
      normalized: normalizeLookup(alias, pack.code),
    });
  }
  for (const alias of pack.rangeWords) {
    candidates.push({
      parts: aliasParts(alias, pack),
      kind: "range",
      normalized: "-",
    });
  }

  return candidates.sort((a, b) => b.parts.length - a.parts.length);
}

function candidateMatches(
  tokens: Token[],
  start: number,
  candidate: AliasCandidate,
): boolean {
  if (start + candidate.parts.length > tokens.length) return false;

  for (let offset = 0; offset < candidate.parts.length; offset += 1) {
    const token = tokens[start + offset];
    if (token.kind !== "word") return false;
    if (token.normalized !== candidate.parts[offset]) return false;
  }

  return true;
}

function classifyAliases(
  input: string,
  tokens: Token[],
  pack: RecipeLocalePack,
): Token[] {
  const candidates = aliasCandidates(pack);
  const classified: Token[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.kind !== "word") {
      classified.push(token);
      index += 1;
      continue;
    }

    const match = candidates.find((candidate) =>
      candidateMatches(tokens, index, candidate),
    );

    if (!match) {
      classified.push(token);
      index += 1;
      continue;
    }

    const last = tokens[index + match.parts.length - 1];
    classified.push({
      kind: match.kind,
      raw: input.slice(token.startOffset, last.endOffset),
      normalized: match.normalized,
      startOffset: token.startOffset,
      endOffset: last.endOffset,
    });
    index += match.parts.length;
  }

  return classified;
}

export function lexRecipeText(input: string, locale: RecipeLocale): Token[] {
  const pack = getLocalePack(locale);
  const rawTokens = scanRawTokens(input, pack);
  const expanded = expandHyphenatedQuantityUnitCompounds(rawTokens, pack);
  return classifyAliases(input, expanded, pack);
}
