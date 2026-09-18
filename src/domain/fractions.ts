const FRACTIONS: Array<[number, string]> = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [0.875, "⅞"],
];

const EPSILON = 0.015;

export function formatRecipeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const remainder = absolute - whole;

  if (remainder < EPSILON) {
    return `${sign}${whole}`;
  }

  for (const [fractionValue, symbol] of FRACTIONS) {
    if (Math.abs(remainder - fractionValue) < EPSILON) {
      return `${sign}${whole > 0 ? `${whole}${symbol}` : symbol}`;
    }
  }

  const rounded = Math.round(absolute * 100) / 100;
  return `${sign}${rounded}`;
}
