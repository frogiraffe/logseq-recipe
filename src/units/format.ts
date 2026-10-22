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
    pint_us: "pint",
    quart_us: "quart",
    gallon_us: "gallon",
    tsp_imperial: "tsp",
    tbsp_imperial: "tbsp",
    cup_imperial: "cup",
    fl_oz_imperial: "fl oz",
    pint_imperial: "pint",
    quart_imperial: "quart",
    gallon_imperial: "gallon",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "dessert spoon",
    piece: "piece",
    egg: "egg",
    clove: "clove",
    slice: "slice",
    pinch: "pinch",
    can: "can",
    package: "package",
    bunch: "bunch",
    jar: "jar",
    sprig: "sprig",
    head: "head",
    stick: "stick",
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
    tsp_us: "çay kaşığı (ABD)",
    tbsp_us: "yemek kaşığı (ABD)",
    cup_us: "bardak (ABD)",
    fl_oz_us: "sıvı ons (ABD)",
    pint_us: "pint (ABD)",
    quart_us: "quart (ABD)",
    gallon_us: "galon (ABD)",
    tsp_imperial: "çay kaşığı (İngiliz)",
    tbsp_imperial: "yemek kaşığı (İngiliz)",
    cup_imperial: "bardak (İngiliz)",
    fl_oz_imperial: "sıvı ons (İngiliz)",
    pint_imperial: "pint (İngiliz)",
    quart_imperial: "quart (İngiliz)",
    gallon_imperial: "galon (İngiliz)",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "tatlı kaşığı",
    piece: "adet",
    egg: "yumurta",
    clove: "diş",
    slice: "dilim",
    pinch: "tutam",
    can: "kutu",
    package: "paket",
    bunch: "demet",
    jar: "kavanoz",
    sprig: "dal",
    head: "baş",
    stick: "çubuk",
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
    pint_us: "pinte",
    quart_us: "quart",
    gallon_us: "gallon",
    tsp_imperial: "c. à c.",
    tbsp_imperial: "c. à s.",
    cup_imperial: "tasse",
    fl_oz_imperial: "oz liq.",
    pint_imperial: "pinte",
    quart_imperial: "quart",
    gallon_imperial: "gallon",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "c. à dessert",
    piece: "pièce",
    egg: "œuf",
    clove: "gousse",
    slice: "tranche",
    pinch: "pincée",
    can: "boîte",
    package: "paquet",
    bunch: "botte",
    jar: "bocal",
    sprig: "brin",
    head: "tête",
    stick: "bâton",
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
    pint_us: "Pint",
    quart_us: "Quart",
    gallon_us: "Gallone",
    tsp_imperial: "TL",
    tbsp_imperial: "EL",
    cup_imperial: "Cup",
    fl_oz_imperial: "fl oz",
    pint_imperial: "Pint",
    quart_imperial: "Quart",
    gallon_imperial: "Gallone",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "Dessertlöffel",
    piece: "Stück",
    egg: "Ei",
    clove: "Zehe",
    slice: "Scheibe",
    pinch: "Prise",
    can: "Dose",
    package: "Packung",
    bunch: "Bund",
    jar: "Glas",
    sprig: "Zweig",
    head: "Kopf",
    stick: "Stange",
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
    pint_us: "pinta",
    quart_us: "cuarto de galón",
    gallon_us: "galón",
    tsp_imperial: "cdta.",
    tbsp_imperial: "cda.",
    cup_imperial: "taza",
    fl_oz_imperial: "oz líq.",
    pint_imperial: "pinta",
    quart_imperial: "cuarto de galón",
    gallon_imperial: "galón",
    su_bardagi: "su bardağı",
    cay_bardagi: "çay bardağı",
    tatli_kasigi: "cda. de postre",
    piece: "pieza",
    egg: "huevo",
    clove: "diente",
    slice: "rebanada",
    pinch: "pizca",
    can: "lata",
    package: "paquete",
    bunch: "manojo",
    jar: "frasco",
    sprig: "ramita",
    head: "cabeza",
    stick: "barra",
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
    pint_us: "pints",
    quart_us: "quarts",
    gallon_us: "gallons",
    pint_imperial: "pints",
    quart_imperial: "quarts",
    gallon_imperial: "gallons",
    egg: "eggs",
    clove: "cloves",
    slice: "slices",
    pinch: "pinches",
    day: "days",
    can: "cans",
    package: "packages",
    bunch: "bunches",
    jar: "jars",
    sprig: "sprigs",
    head: "heads",
    stick: "sticks",
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
    pint_us: "pintes",
    quart_us: "quarts",
    gallon_us: "gallons",
    pint_imperial: "pintes",
    quart_imperial: "quarts",
    gallon_imperial: "gallons",
    day: "jours",
    can: "boîtes",
    package: "paquets",
    bunch: "bottes",
    jar: "bocaux",
    sprig: "brins",
    head: "têtes",
    stick: "bâtons",
  },
  de: {
    egg: "Eier",
    clove: "Zehen",
    slice: "Scheiben",
    pinch: "Prisen",
    cup_metric: "Tassen",
    cup_us: "Cups",
    cup_imperial: "Cups",
    pint_us: "Pints",
    quart_us: "Quarts",
    gallon_us: "Gallonen",
    pint_imperial: "Pints",
    quart_imperial: "Quarts",
    gallon_imperial: "Gallonen",
    day: "Tage",
    can: "Dosen",
    package: "Packungen",
    jar: "Gläser",
    sprig: "Zweige",
    head: "Köpfe",
    stick: "Stangen",
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
    pint_us: "pintas",
    quart_us: "cuartos de galón",
    gallon_us: "galones",
    pint_imperial: "pintas",
    quart_imperial: "cuartos de galón",
    gallon_imperial: "galones",
    day: "días",
    can: "latas",
    package: "paquetes",
    bunch: "manojos",
    jar: "frascos",
    sprig: "ramitas",
    head: "cabezas",
    stick: "barras",
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
  // The number as shown: 1.0144 cups reads "1 cup".
  const shown = formatRecipeNumber(count);
  return rules.select(/^\d+$/.test(shown) ? Number(shown) : count) !== "one";
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

// Kitchen spoons differ by under 2% between systems (a US teaspoon is 4.93
// ml), far less than any spoon is filled to: 2 US tsp in metric is 2 tsp,
// not 1.97.
function nearWholeSpoons(value: number, unit: CanonicalUnit | undefined) {
  if (!unit || !/^t(b)?sp_/.test(unit)) return value;
  const whole = Math.round(value);
  return whole > 0 && Math.abs(value - whole) <= value * 0.02 ? whole : value;
}

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
    return formatLocalizedNumber(nearWholeSpoons(value, unit), locale);
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
