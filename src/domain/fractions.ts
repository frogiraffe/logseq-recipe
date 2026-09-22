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

  // Snapping a near-whole remainder away (2.998 -> "3") is only safe when
  // there is a whole part to keep, or the value really is zero. Without
  // that guard a small quantity expressed in a large unit - half a
  // teaspoon is ~0.0104 cup - falls under EPSILON and renders as "0 cup",
  // claiming the ingredient isn't in the recipe at all.
  if (remainder < EPSILON && (whole > 0 || absolute === 0)) {
    return `${sign}${whole}`;
  }

  for (const [fractionValue, symbol] of FRACTIONS) {
    if (Math.abs(remainder - fractionValue) < EPSILON) {
      return `${sign}${whole > 0 ? `${whole}${symbol}` : symbol}`;
    }
  }

  const rounded = Math.round(absolute * 100) / 100;
  if (rounded > 0) {
    return `${sign}${rounded}`;
  }

  // Smaller than two decimals can show, but still a real amount: keep two
  // significant digits rather than rounding it down to a bare "0".
  return `${sign}${Number(absolute.toPrecision(2))}`;
}
