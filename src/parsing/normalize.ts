export const VULGAR_FRACTIONS: Readonly<Record<string, number>> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

export function normalizeLookup(value: string, locale: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase(locale);
}

// `String.toLocaleLowerCase()` with no explicit locale argument follows the
// *runtime's* default locale, and Turkish is the one common case where that
// changes the result: under a Turkish locale, ASCII "I" lowercases to "ı"
// (dotless), not "i". Any matching that must behave identically regardless
// of the host environment's locale - e.g. an ingredient name matched
// against a registry mixing English/Turkish/French/German/Spanish aliases,
// where there is no single fixed locale to evaluate it in - needs to
// neutralize that ambiguity itself rather than delegate to the environment.
// This does not touch other accented letters (ş, ğ, ç, ...); only the
// three characters whose casing is genuinely locale-dependent.
export function foldCaseLocaleIndependent(value: string): string {
  return value.normalize("NFKC").replace(/[İIı]/gu, "i").toLocaleLowerCase();
}

/**
 * Label matching for section headings and metadata labels: case, accents,
 * Turkish dotless i and extra spaces don't matter, so "Yapilis",
 * "etapes" and "Preparacion" still match "yapılış", "étapes" and
 * "preparación".
 */
export function foldLabel(value: string): string {
  return foldCaseLocaleIndependent(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/gu, "ss")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeDash(value: string): "-" {
  void value;
  return "-";
}

export function parseSlashFraction(raw: string): number | null {
  const [numeratorRaw, denominatorRaw, extra] = raw.split("/");
  if (extra !== undefined) return null;
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}
