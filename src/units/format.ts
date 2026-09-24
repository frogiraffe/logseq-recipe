import { formatRecipeNumber } from "../domain/fractions";
import type { CanonicalUnit } from "../domain/unit";

export type UiLocale = "en" | "tr" | "fr" | "de" | "es";

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
    cl: "cl",
    dl: "dl",
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
    cl: "cl",
    dl: "dl",
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
  fr: {
    mg: "mg",
    g: "g",
    kg: "kg",
    oz_mass: "oz",
    lb: "lb",
    ml: "ml",
    cl: "cl",
    dl: "dl",
    l: "L",
    tsp_metric: "c. à c.",
    tbsp_metric: "c. à s.",
    cup_metric: "tasse",
    tsp_us: "c. à c.",
    tbsp_us: "c. à s.",
    cup_us: "tasse",
    fl_oz_us: "oz liq.",
    tsp_imperial: "c. à c.",
    tbsp_imperial: "c. à s.",
    cup_imperial: "tasse",
    fl_oz_imperial: "oz liq.",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "c. à dessert",
    piece: "pièce",
    egg: "œuf",
    clove: "gousse",
    slice: "tranche",
    pinch: "pincée",
    second: "s",
    minute: "min",
    hour: "h",
    day: "jour",
    celsius: "°C",
    fahrenheit: "°F",
  },
  de: {
    mg: "mg",
    g: "g",
    kg: "kg",
    oz_mass: "oz",
    lb: "lb",
    ml: "ml",
    cl: "cl",
    dl: "dl",
    l: "l",
    tsp_metric: "TL",
    tbsp_metric: "EL",
    cup_metric: "Tasse",
    tsp_us: "TL",
    tbsp_us: "EL",
    cup_us: "Cup",
    fl_oz_us: "fl oz",
    tsp_imperial: "TL",
    tbsp_imperial: "EL",
    cup_imperial: "Cup",
    fl_oz_imperial: "fl oz",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "Dessertlöffel",
    piece: "Stück",
    egg: "Ei",
    clove: "Zehe",
    slice: "Scheibe",
    pinch: "Prise",
    second: "Sek.",
    minute: "Min.",
    hour: "Std.",
    day: "Tag",
    celsius: "°C",
    fahrenheit: "°F",
  },
  es: {
    mg: "mg",
    g: "g",
    kg: "kg",
    oz_mass: "oz",
    lb: "lb",
    ml: "ml",
    cl: "cl",
    dl: "dl",
    l: "L",
    tsp_metric: "cdta.",
    tbsp_metric: "cda.",
    cup_metric: "taza",
    tsp_us: "cdta.",
    tbsp_us: "cda.",
    cup_us: "taza",
    fl_oz_us: "oz líq.",
    tsp_imperial: "cdta.",
    tbsp_imperial: "cda.",
    cup_imperial: "taza",
    fl_oz_imperial: "oz líq.",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "cda. de postre",
    piece: "pieza",
    egg: "huevo",
    clove: "diente",
    slice: "rebanada",
    pinch: "pizca",
    second: "s",
    minute: "min",
    hour: "h",
    day: "día",
    celsius: "°C",
    fahrenheit: "°F",
  },
};

// Count-unit nouns inflect for plurality in English, French, German, and
// Spanish ("2 eggs", "2 œufs", "2 Eier", "2 huevos"). Turkish never does
// after a number ("2 yumurta"), so it has no table. Tables only cover count
// units; abbreviations and °C stay invariant.
const COUNT_UNIT_PLURALS: Partial<
  Record<UiLocale, Partial<Record<CanonicalUnit, string>>>
> = {
  en: {
    piece: "pieces",
    cup_metric: "cups",
    cup_us: "cups",
    cup_imperial: "cups",
    egg: "eggs",
    clove: "cloves",
    slice: "slices",
    pinch: "pinches",
    day: "days",
  },
  fr: {
    piece: "pièces",
    egg: "œufs",
    clove: "gousses",
    slice: "tranches",
    pinch: "pincées",
    cup_metric: "tasses",
    cup_us: "tasses",
    cup_imperial: "tasses",
    day: "jours",
  },
  de: {
    egg: "Eier",
    clove: "Zehen",
    slice: "Scheiben",
    pinch: "Prisen",
    cup_metric: "Tassen",
    cup_us: "Cups",
    cup_imperial: "Cups",
    day: "Tage",
  },
  es: {
    piece: "piezas",
    egg: "huevos",
    clove: "dientes",
    slice: "rebanadas",
    pinch: "pizcas",
    cup_metric: "tazas",
    cup_us: "tazas",
    cup_imperial: "tazas",
    day: "días",
  },
};

const pluralRules = new Map<UiLocale, Intl.PluralRules>();

// CLDR rules, not "!== 1": French treats 0 and 1.5 as singular. A fraction
// of one unit reads singular everywhere ("½ cup", "½ Tasse", "½ taza"),
// though CLDR files 0.5 under "other".
function isPluralCount(count: number, locale: UiLocale): boolean {
  if (!Number.isFinite(count) || (count > 0 && count < 1)) return false;
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(count) !== "one";
}

const DECIMAL_COMMA_LOCALES = new Set<UiLocale>(["tr", "fr", "de", "es"]);

/** Recipe number (fractions kept) with the locale's decimal separator. */
export function formatLocalizedNumber(
  value: number,
  locale: UiLocale = "en",
): string {
  const text = formatRecipeNumber(value);
  return DECIMAL_COMMA_LOCALES.has(locale) ? text.replace(".", ",") : text;
}

const DECIMAL_UNITS = new Set<CanonicalUnit>([
  "mg",
  "g",
  "kg",
  "ml",
  "cl",
  "dl",
  "l",
]);

/**
 * Metric mass/volume reads as a plain decimal ("62.5 ml", "188 g"), never a
 * kitchen fraction ("62½ ml"): whole numbers from 100 up, one decimal from
 * 10, two below that, and two significant digits under 1 so a pinch-sized
 * amount never rounds to 0. Other units keep formatLocalizedNumber's
 * fractions.
 */
export function formatNumberForUnit(
  value: number,
  unit: CanonicalUnit | undefined,
  locale: UiLocale = "en",
): string {
  if (!unit || !DECIMAL_UNITS.has(unit) || !Number.isFinite(value)) {
    return formatLocalizedNumber(value, locale);
  }
  const size = Math.abs(value);
  const rounded =
    size >= 100
      ? value.toFixed(0)
      : size >= 10
        ? value.toFixed(1)
        : size >= 1
          ? value.toFixed(2)
          : value.toPrecision(2);
  const text = String(Number(rounded));
  return DECIMAL_COMMA_LOCALES.has(locale) ? text.replace(".", ",") : text;
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
  const plural = COUNT_UNIT_PLURALS[locale]?.[unit];
  if (plural && count !== undefined && isPluralCount(count, locale)) {
    return plural;
  }
  return UNIT_LABELS[locale][unit];
}

export function formatMeasurement(
  value: number,
  unit: CanonicalUnit,
  locale: UiLocale = "en",
): string {
  return `${formatLocalizedNumber(value, locale)} ${unitLabel(unit, locale, value)}`;
}
