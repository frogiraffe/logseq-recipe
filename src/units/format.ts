import { formatRecipeNumber } from "../domain/fractions";
import type { CanonicalUnit } from "../domain/unit";

export type UiLocale = "en" | "tr";

const UNIT_LABELS: Readonly<
  Record<UiLocale, Readonly<Record<CanonicalUnit, string>>>
> = {
  en: {
    mg: "mg",
    g: "g",
    kg: "kg",
    oz_mass: "oz",
    lb: "lb",
    ml: "ml",
    l: "L",
    tsp_metric: "tsp",
    tbsp_metric: "tbsp",
    cup_metric: "cup",
    tsp_us: "tsp",
    tbsp_us: "tbsp",
    cup_us: "cup",
    fl_oz_us: "fl oz",
    tsp_imperial: "tsp",
    tbsp_imperial: "tbsp",
    cup_imperial: "cup",
    fl_oz_imperial: "fl oz",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "dessert spoon",
    piece: "piece",
    egg: "egg",
    clove: "clove",
    slice: "slice",
    pinch: "pinch",
    second: "s",
    minute: "min",
    hour: "h",
    day: "day",
    celsius: "°C",
    fahrenheit: "°F",
  },
  tr: {
    mg: "mg",
    g: "g",
    kg: "kg",
    oz_mass: "ons",
    lb: "lb",
    ml: "ml",
    l: "L",
    tsp_metric: "çay kaşığı",
    tbsp_metric: "yemek kaşığı",
    cup_metric: "bardak",
    tsp_us: "çay kaşığı (US)",
    tbsp_us: "yemek kaşığı (US)",
    cup_us: "bardak (US)",
    fl_oz_us: "sıvı ons (US)",
    tsp_imperial: "çay kaşığı (İngiliz)",
    tbsp_imperial: "yemek kaşığı (İngiliz)",
    cup_imperial: "bardak (İngiliz)",
    fl_oz_imperial: "sıvı ons (İngiliz)",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "tatlı kaşığı",
    piece: "adet",
    egg: "yumurta",
    clove: "diş",
    slice: "dilim",
    pinch: "tutam",
    second: "sn",
    minute: "dk",
    hour: "sa",
    day: "gün",
    celsius: "°C",
    fahrenheit: "°F",
  },
};

// English pluralizes count-unit nouns ("2 eggs", "3 cloves"); Turkish does
// not inflect a noun for plurality after a number ("2 yumurta", "3 diş" -
// never "yumurtalar"/"dişler" here), so only the English side needs this.
const ENGLISH_COUNT_UNIT_PLURALS: Partial<Record<CanonicalUnit, string>> = {
  piece: "pieces",
  egg: "eggs",
  clove: "cloves",
  slice: "slices",
  pinch: "pinches",
};

function isPluralCount(count: number): boolean {
  return Number.isFinite(count) && Math.abs(count - 1) > 1e-9;
}

/**
 * @param count Representative numeric amount, for English count-unit
 * pluralization ("1 clove" vs "2 cloves"). Omit for a context with no single
 * amount to agree with, such as a generic unit-picker option label.
 */
export function unitLabel(
  unit: CanonicalUnit,
  locale: UiLocale = "en",
  count?: number,
): string {
  if (
    locale === "en" &&
    count !== undefined &&
    isPluralCount(count) &&
    ENGLISH_COUNT_UNIT_PLURALS[unit]
  ) {
    return ENGLISH_COUNT_UNIT_PLURALS[unit];
  }
  return UNIT_LABELS[locale][unit];
}

export function formatMeasurement(
  value: number,
  unit: CanonicalUnit,
  locale: UiLocale = "en",
): string {
  return `${formatRecipeNumber(value)} ${unitLabel(unit, locale, value)}`;
}
