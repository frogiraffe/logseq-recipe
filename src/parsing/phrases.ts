export interface PhraseSpan<T> {
  rawText: string;
  startOffset: number;
  endOffset: number;
  value: T;
  alias: string;
}

const LETTER_OR_MARK_OR_DIGIT = /[\p{L}\p{M}\p{N}]/u;

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && LETTER_OR_MARK_OR_DIGIT.test(value);
}

function hasValidBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : undefined;
  const after = end < text.length ? text[end] : undefined;
  return !isWordCharacter(before) && !isWordCharacter(after);
}

// Lowercase without changing the length: outside Turkish, "İ" lowercases to
// two code units ("i̇"), which would shift every offset after it.
function lowerKeepingOffsets(value: string, locale: string): string {
  return value.replace(/İ/gu, "i").toLocaleLowerCase(locale);
}

export function findPhraseSpans<T>(
  text: string,
  aliases: Readonly<Record<string, T>>,
  locale: string,
): PhraseSpan<T>[] {
  const lower = lowerKeepingOffsets(text, locale);
  const spans: PhraseSpan<T>[] = [];

  for (const [alias, value] of Object.entries(aliases)) {
    const normalizedAlias = lowerKeepingOffsets(alias, locale);
    let from = 0;

    while (from <= lower.length - normalizedAlias.length) {
      const start = lower.indexOf(normalizedAlias, from);
      if (start < 0) break;
      const end = start + normalizedAlias.length;
      if (hasValidBoundary(lower, start, end)) {
        spans.push({
          rawText: text.slice(start, end),
          startOffset: start,
          endOffset: end,
          value,
          alias,
        });
      }
      from = Math.max(end, start + 1);
    }
  }

  return spans.sort(
    (a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset,
  );
}
