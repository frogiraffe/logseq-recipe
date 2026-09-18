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
