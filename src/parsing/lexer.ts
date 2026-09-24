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
// "1⁄2" typed with the Unicode fraction or division slash reads as "1/2".
const FRACTION_SLASHES = new Set(["/", "⁄", "∕"]);
// "°C", "ºC" (the ordinal sign Spanish keyboards type), "˚F".
const DEGREE_SIGNS = new Set(["°", "º", "˚"]);
// "~200 g", "≈ 10 min": the sign reads like "about".
const APPROXIMATE_SIGNS = new Set(["~", "≈"]);
// Spaces only typesetting puts between thousands groups ("1 000 g").
const THIN_SPACES = new Set([" ", " ", " "]);

interface AliasCandidate {
  parts: string[];
  kind: Extract<
    TokenKind,
    "unit" | "quantity_word" | "modifier" | "sequence" | "heat" | "range"
  >;
  normalized: string | number;
}

interface Scanned {
  token: Token;
  end: number;
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

function isThousandsSeparator(
  char: string | undefined,
  pack: RecipeLocalePack,
): boolean {
  if (char === undefined) return false;
  if (THIN_SPACES.has(char)) return true;
  if (char === " ") return pack.spaceThousandsSeparator;
  return char === (pack.decimalSeparator === "." ? "," : ".");
}

// "3'er dakika", "180'de": a Turkish case ending after the apostrophe
// belongs to the number, not to the next word.
function withNumberSuffix(
  input: string,
  scanned: Scanned,
  pack: RecipeLocalePack,
): Scanned {
  let end = scanned.end;
  if (
    !pack.apostropheSuffixes ||
    !WORD_JOINERS.has(input[end]) ||
    !isLetterOrMark(input[end + 1])
  ) {
    return scanned;
  }
  end += 1;
  while (isLetterOrMark(input[end])) end += 1;
  return {
    token: {
      ...scanned.token,
      raw: input.slice(scanned.token.startOffset, end),
      endOffset: end,
    },
    end,
  };
}

function scanNumber(
  input: string,
  start: number,
  pack: RecipeLocalePack,
): Scanned {
  let end = start;
  while (isDigit(input[end])) end += 1;

  const invalid = (invalidEnd: number): Scanned => {
    while (/[0-9.,/⁄∕]/u.test(input[invalidEnd] ?? "")) invalidEnd += 1;
    return {
      token: {
        kind: "invalid_number",
        raw: input.slice(start, invalidEnd),
        normalized: input.slice(start, invalidEnd),
        startOffset: start,
        endOffset: invalidEnd,
      },
      end: invalidEnd,
    };
  };

  if (FRACTION_SLASHES.has(input[end]) && isDigit(input[end + 1])) {
    let denominatorEnd = end + 1;
    while (isDigit(input[denominatorEnd])) denominatorEnd += 1;
    const raw = input.slice(start, denominatorEnd);
    const fraction = parseSlashFraction(raw.replace(/[⁄∕]/gu, "/"));
    if (fraction !== null && !FRACTION_SLASHES.has(input[denominatorEnd])) {
      return withNumberSuffix(
        input,
        {
          token: {
            kind: "fraction",
            raw,
            normalized: fraction,
            startOffset: start,
            endOffset: denominatorEnd,
          },
          end: denominatorEnd,
        },
        pack,
      );
    }
    while (
      FRACTION_SLASHES.has(input[denominatorEnd]) &&
      isDigit(input[denominatorEnd + 1])
    ) {
      denominatorEnd += 1;
      while (isDigit(input[denominatorEnd])) denominatorEnd += 1;
    }
    return invalid(denominatorEnd);
  }

  const groupSeparator = pack.decimalSeparator === "." ? "," : ".";
  if (
    groupSeparator === "," &&
    end - start > 3 &&
    input[end] === "," &&
    isDigit(input[end + 1])
  )
    return invalid(end);
  // Thousands groups ("1,000", "1.000", "1 000") come in threes after one
  // to three leading digits, never after a lone zero: "0.500 kg" is half a
  // kilo in every language, not 500.
  const firstGroupDigits = end - start;
  let digits = input.slice(start, end);
  let groupedBy: string | null = null;
  while (
    firstGroupDigits <= 3 &&
    input[start] !== "0" &&
    isThousandsSeparator(input[end], pack) &&
    (groupedBy === null || input[end] === groupedBy) &&
    isDigit(input[end + 1]) &&
    isDigit(input[end + 2]) &&
    isDigit(input[end + 3]) &&
    !isDigit(input[end + 4])
  ) {
    groupedBy = input[end];
    digits += input.slice(end + 1, end + 4);
    end += 4;
  }

  if (groupSeparator === "," && input[end] === "," && isDigit(input[end + 1])) {
    let invalidEnd = end + 1;
    while (isDigit(input[invalidEnd])) invalidEnd += 1;
    return invalid(invalidEnd);
  }

  if (
    input[end] !== groupedBy &&
    acceptedDecimalSeparator(input[end] ?? "", pack) &&
    isDigit(input[end + 1])
  ) {
    const decimalsStart = end + 1;
    end += 1;
    while (isDigit(input[end])) end += 1;
    digits += `.${input.slice(decimalsStart, end)}`;
  }

  if ((input[end] === "." || input[end] === ",") && isDigit(input[end + 1])) {
    let invalidEnd = end;
    do {
      invalidEnd += 1;
      while (isDigit(input[invalidEnd])) invalidEnd += 1;
    } while (
      (input[invalidEnd] === "." || input[invalidEnd] === ",") &&
      isDigit(input[invalidEnd + 1])
    );
    return invalid(invalidEnd);
  }

  if (
    /[eE]/u.test(input[end] ?? "") &&
    (isDigit(input[end + 1]) ||
      ((input[end + 1] === "+" || input[end + 1] === "-") &&
        isDigit(input[end + 2])))
  ) {
    let invalidEnd = end + 1;
    if (input[invalidEnd] === "+" || input[invalidEnd] === "-") invalidEnd += 1;
    while (isDigit(input[invalidEnd])) invalidEnd += 1;
    return invalid(invalidEnd);
  }

  const normalizedNumber = Number(digits);
  if (!Number.isFinite(normalizedNumber)) return invalid(end);

  return withNumberSuffix(
    input,
    {
      token: {
        kind: "number",
        raw: input.slice(start, end),
        normalized: normalizedNumber,
        startOffset: start,
        endOffset: end,
      },
      end,
    },
    pack,
  );
}

function scanWord(input: string, start: number, locale: string): Scanned {
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

// "°C", "° F", "ºC", "˚F", "°C'de": one "°c"/"°f" word whatever the degree
// sign, and across the space some write before the scale letter.
function scanDegree(
  input: string,
  start: number,
  locale: string,
): Scanned | null {
  const spaced = input[start + 1] === " ";
  const letter = start + (spaced ? 2 : 1);
  if (!/[cf]/iu.test(input[letter] ?? "")) return null;
  const word = scanWord(input, letter, locale);
  if (!/^[cf](?:['’]\p{L}+)?$/iu.test(word.token.raw)) return null;
  return {
    token: {
      kind: "word",
      raw: input.slice(start, word.end),
      normalized: `°${word.token.normalized}`,
      startOffset: start,
      endOffset: word.end,
    },
    end: word.end,
  };
}

function symbolToken(
  kind: TokenKind,
  char: string,
  normalized: string,
  at: number,
): Token {
  return { kind, raw: char, normalized, startOffset: at, endOffset: at + 1 };
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
      // "1-1/2 cups": the hyphen joins a whole number to its fraction; it
      // isn't a (reversed) range.
      if (
        scanned.token.kind === "number" &&
        /^\d+$/u.test(scanned.token.raw) &&
        input[cursor] === "-" &&
        isDigit(input[cursor + 1])
      ) {
        const fraction = scanNumber(input, cursor + 1, pack);
        if (
          fraction.token.kind === "fraction" &&
          Number(fraction.token.normalized) < 1
        ) {
          tokens.push(fraction.token);
          cursor = fraction.end;
        }
      }
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
      tokens.push(symbolToken("range", char, normalizeDash(char), cursor));
      cursor += 1;
      continue;
    }

    if (APPROXIMATE_SIGNS.has(char)) {
      tokens.push(symbolToken("modifier", char, "approximate", cursor));
      cursor += 1;
      continue;
    }

    if (char === "(" || char === ")" || char === ",") {
      const kind = char === "(" ? "lparen" : char === ")" ? "rparen" : "comma";
      tokens.push(symbolToken(kind, char, char, cursor));
      cursor += 1;
      continue;
    }

    const degree = DEGREE_SIGNS.has(char)
      ? scanDegree(input, cursor, pack.code)
      : null;
    if (degree) {
      tokens.push(degree.token);
      cursor = degree.end;
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

    tokens.push(symbolToken("symbol", char, char, cursor));
    cursor += 1;
  }

  return tokens;
}

interface NormalizedVocabulary {
  quantities: Map<string, number>;
  units: Map<string, string>;
}

const vocabularyCache = new WeakMap<RecipeLocalePack, NormalizedVocabulary>();

function normalizedVocabulary(pack: RecipeLocalePack): NormalizedVocabulary {
  const cached = vocabularyCache.get(pack);
  if (cached) return cached;
  const normalize = <T>(record: Readonly<Record<string, T>>) =>
    new Map(
      Object.entries(record).map(([alias, value]) => [
        normalizeLookup(alias, pack.code),
        value,
      ]),
    );
  const vocabulary = {
    quantities: normalize(pack.quantityWords),
    units: normalize<string>(pack.unitAliases),
  };
  vocabularyCache.set(pack, vocabulary);
  return vocabulary;
}

function isTens(value: number): boolean {
  return value >= 10 && value <= 90 && value % 10 === 0;
}

// Hyphenated compounds of known words: a quantity and a unit ("demi-tasse",
// "une demi-heure") split in two, and two quantities ("twenty-five",
// "vingt-cinq", "soixante-dix", "one-half") join into one number.
function expandHyphenatedCompounds(
  tokens: Token[],
  pack: RecipeLocalePack,
): Token[] {
  const { quantities, units } = normalizedVocabulary(pack);
  const expanded: Token[] = [];

  for (const token of tokens) {
    const hyphenOffset = token.raw.indexOf("-");
    if (
      token.kind !== "word" ||
      hyphenOffset <= 0 ||
      hyphenOffset !== token.raw.lastIndexOf("-") ||
      hyphenOffset >= token.raw.length - 1
    ) {
      expanded.push(token);
      continue;
    }

    const leftRaw = token.raw.slice(0, hyphenOffset);
    const rightRaw = token.raw.slice(hyphenOffset + 1);
    const quantity = quantities.get(normalizeLookup(leftRaw, pack.code));
    const rightKey = normalizeLookup(rightRaw, pack.code);
    const unit = units.get(rightKey);
    const ones = quantities.get(rightKey);

    if (quantity !== undefined && ones !== undefined) {
      const joined =
        isTens(quantity) && ones < quantity
          ? quantity + ones
          : quantity === 1 || ones === 1
            ? quantity * ones // "one-half"
            : null;
      if (joined !== null) {
        expanded.push({ ...token, kind: "quantity_word", normalized: joined });
        continue;
      }
    }

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

// An alias is scanned exactly like recipe text, so punctuation inside it
// ("c. à s.", "Std.", "Ober-/Unterhitze") must appear the same way in the
// text: words compare normalized, everything else by its raw character.
function aliasParts(alias: string, pack: RecipeLocalePack): string[] {
  return scanRawTokens(alias, pack).map((token) =>
    token.kind === "word" ? String(token.normalized) : `\u0000${token.raw}`,
  );
}

// Built once per locale pack and keyed by an alias's first word, longest
// alias first: every lexed line would otherwise try the pack's ~200 aliases
// at every word, and per-line language detection lexes each line in every
// language.
const candidateCache = new WeakMap<
  RecipeLocalePack,
  Map<string, AliasCandidate[]>
>();

function aliasCandidates(
  pack: RecipeLocalePack,
): Map<string, AliasCandidate[]> {
  const cached = candidateCache.get(pack);
  if (cached) return cached;
  const byFirstPart = new Map<string, AliasCandidate[]>();
  for (const candidate of buildAliasCandidates(pack)) {
    const list = byFirstPart.get(candidate.parts[0]);
    if (list) list.push(candidate);
    else byFirstPart.set(candidate.parts[0], [candidate]);
  }
  candidateCache.set(pack, byFirstPart);
  return byFirstPart;
}

function buildAliasCandidates(pack: RecipeLocalePack): AliasCandidate[] {
  const candidates: AliasCandidate[] = [];
  const add = (
    kind: AliasCandidate["kind"],
    alias: string,
    normalized: string | number,
  ) => candidates.push({ parts: aliasParts(alias, pack), kind, normalized });

  for (const [alias, value] of Object.entries(pack.unitAliases)) {
    add("unit", alias, value);
  }
  for (const [alias, value] of Object.entries(pack.quantityWords)) {
    add("quantity_word", alias, value);
  }
  for (const [alias, value] of Object.entries(pack.temporalModifiers)) {
    add("modifier", alias, value);
  }
  for (const [alias, value] of Object.entries(pack.sequenceConnectors)) {
    add("sequence", alias, value);
  }
  for (const alias of Object.keys(pack.heatAliases)) {
    add("heat", alias, normalizeLookup(alias, pack.code));
  }
  for (const alias of pack.rangeWords) {
    add("range", alias, "-");
  }

  return candidates.sort((a, b) => b.parts.length - a.parts.length);
}

function candidateMatches(
  tokens: readonly Token[],
  start: number,
  candidate: AliasCandidate,
): boolean {
  if (start + candidate.parts.length > tokens.length) return false;

  for (let offset = 0; offset < candidate.parts.length; offset += 1) {
    const token = tokens[start + offset];
    const part = candidate.parts[offset];
    if (part.startsWith("\u0000")) {
      if (token.kind === "word" || token.raw !== part.slice(1)) return false;
      continue;
    }
    if (token.kind !== "word") return false;
    if (token.normalized !== part) return false;
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

    const key = String(token.normalized);
    let match = candidates
      .get(key)
      ?.find((candidate) => candidateMatches(tokens, index, candidate));
    // "200 ml'lik", "250 gr'lık", "180°C'de": a case ending after the
    // apostrophe leaves the unit underneath.
    if (!match && pack.apostropheSuffixes) {
      const stem = key.split(/['’]/u)[0];
      if (stem !== key) {
        match = candidates
          .get(stem)
          ?.find((candidate) => candidate.parts.length === 1);
      }
    }

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

function isAndWord(token: Token | undefined, pack: RecipeLocalePack): boolean {
  if (token?.kind !== "word") return false;
  const word = String(token.normalized);
  return (
    Object.hasOwn(pack.relationConnectors, word) &&
    pack.relationConnectors[word] === "and"
  );
}

// "between 10 and 15 minutes", "entre 10 et 15", "zwischen 10 und 15": the
// "and" joins a range exactly like "10-15".
function joinBetweenRanges(tokens: Token[], pack: RecipeLocalePack): void {
  for (let index = 0; index < tokens.length; index += 1) {
    const opener = tokens[index];
    if (
      opener.kind !== "word" ||
      !pack.rangeOpeners.includes(String(opener.normalized))
    ) {
      continue;
    }
    const low = parseAmountAtom(tokens, index + 1, pack.code);
    if (!low || !isAndWord(tokens[low.nextIndex], pack)) continue;
    if (!parseAmountAtom(tokens, low.nextIndex + 1, pack.code)) continue;
    tokens[low.nextIndex] = {
      ...tokens[low.nextIndex],
      kind: "range",
      normalized: "-",
    };
  }
}

export interface AmountAtom {
  value: number;
  nextIndex: number;
  startOffset: number;
  endOffset: number;
}

/**
 * The "and a half" at tokens[index] that adds ½ to what precedes it ("1 and
 * a half", "un et demi", "une heure et demie", "bir buçuk"): the index just
 * past it, or null.
 */
export function andAHalfAt(
  tokens: readonly Token[],
  index: number,
  locale: RecipeLocale,
): number | null {
  const token = tokens[index];
  if (token?.kind !== "word") return null;
  const pack = getLocalePack(locale);
  if (pack.halfSuffixes.includes(String(token.normalized))) return index + 1;
  if (!isAndWord(token, pack)) return null;
  const half = parseAmountAtom(tokens, index + 1, locale);
  return half?.value === 0.5 ? half.nextIndex : null;
}

function quantityWordValue(token: Token | undefined): number | null {
  return token?.kind === "quantity_word" ? Number(token.normalized) : null;
}

/**
 * One amount starting at tokens[index]: a number, fraction or quantity
 * word, a whole number with a fraction ("1 ½"), tens with units ("twenty
 * five", "otuz beş", "treinta y cinco", "vingt et un"), an article with a
 * fraction word in either order ("half a cup", "a half cup", "eine halbe
 * Stunde", "une demi-heure"), or a whole amount and a half ("1 and a
 * half", "bir buçuk").
 */
export function parseAmountAtom(
  tokens: readonly Token[],
  index: number,
  locale: RecipeLocale,
): AmountAtom | null {
  const token = tokens[index];
  if (
    !token ||
    (token.kind !== "number" &&
      token.kind !== "fraction" &&
      token.kind !== "quantity_word")
  ) {
    return null;
  }

  const pack = getLocalePack(locale);
  let value = Number(token.normalized);
  let nextIndex = index + 1;
  let endOffset = token.endOffset;
  const take = (joined: number, last: number) => {
    value = joined;
    endOffset = tokens[last].endOffset;
    nextIndex = last + 1;
  };

  const next = tokens[nextIndex];
  const onesIndex = isAndWord(next, pack) ? nextIndex + 1 : nextIndex;
  const ones = quantityWordValue(tokens[onesIndex]);
  if (
    token.kind === "quantity_word" &&
    isTens(value) &&
    ones !== null &&
    Number.isInteger(ones) &&
    ones >= 1 &&
    ones <= 9 &&
    // "twenty and a half" is not twenty-one
    !(onesIndex > nextIndex && quantityWordValue(tokens[onesIndex + 1]) === 0.5)
  ) {
    take(value + ones, onesIndex);
  } else if (token.kind === "number" && next?.kind === "fraction") {
    take(value + Number(next.normalized), nextIndex);
  } else if (
    token.kind === "quantity_word" &&
    next?.kind === "quantity_word" &&
    (value === 1 || Number(next.normalized) === 1)
  ) {
    take(value * Number(next.normalized), nextIndex);
  }

  if (value >= 1) {
    const afterHalf = andAHalfAt(tokens, nextIndex, locale);
    if (afterHalf !== null) take(value + 0.5, afterHalf - 1);
  }

  return { value, nextIndex, startOffset: token.startOffset, endOffset };
}

// parseStep reads each line three times (durations, temperatures, heat) and
// per-line language detection reads it in all five languages, then again in
// the one it picks: the same (language, line) is lexed over and over. The
// tokens are frozen so a shared result can't be changed by one reader.
const LEX_CACHE_SIZE = 256;
const lexCache = new Map<string, readonly Token[]>();

export function lexRecipeText(
  input: string,
  locale: RecipeLocale,
): readonly Token[] {
  const key = `${locale}\u0000${input}`;
  const cached = lexCache.get(key);
  if (cached) return cached;

  const pack = getLocalePack(locale);
  const rawTokens = scanRawTokens(input, pack);
  const expanded = expandHyphenatedCompounds(rawTokens, pack);
  const classified = classifyAliases(input, expanded, pack);
  joinBetweenRanges(classified, pack);
  const tokens = Object.freeze(classified);

  if (lexCache.size >= LEX_CACHE_SIZE) {
    lexCache.delete(lexCache.keys().next().value as string);
  }
  lexCache.set(key, tokens);
  return tokens;
}
