import { describe, expect, it } from "vitest";
import {
  analyzeRecipeConversion,
  type ConversionSourceNode,
} from "../../src/application/convert-recipe";
import { parseRecipeMetadataLine } from "../../src/application/recipe-metadata";
import type { RecipeLocale } from "../../src/domain/recipe";
import { defaultParseContext } from "../../src/parsing/context";
import { parseIngredient } from "../../src/parsing/ingredient";
import { parseStep } from "../../src/parsing/step";

// Every recipe language must handle the same kinds of real-world lines:
// abbreviated units, cl/dl, unit-ingredient connectors, short time units in
// steps, and "<number> h <number> min" metadata.
const CASES: Record<
  RecipeLocale,
  {
    abbreviated: [string, string, string];
    connector: [string, string];
    centiliters: string;
    shortTimes: string;
    cookLine: string;
  }
> = {
  en: {
    abbreviated: ["2 tbs sugar", "tbsp_us", "sugar"],
    connector: ["1 cup of flour", "flour"],
    centiliters: "25 cl milk",
    shortTimes: "Bake 1 h 5 min.",
    cookLine: "Cook: 1 h 5 min",
  },
  tr: {
    abbreviated: ["2 tane yumurta", "piece", "yumurta"],
    connector: ["1 su bardağı un", "un"],
    centiliters: "25 cl süt",
    shortTimes: "1 sa 5 dk pişir.",
    cookLine: "Pişirme: 1 sa 5 dk",
  },
  fr: {
    abbreviated: ["2 c. à s. de sucre", "tbsp_metric", "sucre"],
    connector: ["2 cuillères à soupe d'huile", "huile"],
    centiliters: "25 cl de lait",
    shortTimes: "Cuire 1 h 5 min.",
    cookLine: "Cuisson: 1 h 5 min",
  },
  de: {
    abbreviated: ["3 Stk. Eier", "piece", "Eier"],
    connector: ["2 EL Zucker", "Zucker"],
    centiliters: "25 cl Milch",
    shortTimes: "1 Std. 5 Min. backen.",
    cookLine: "Backzeit: 1 Std. 5 Min.",
  },
  es: {
    abbreviated: ["1 cda de aceite", "tbsp_metric", "aceite"],
    connector: ["1 taza de harina", "harina"],
    centiliters: "25 cl de leche",
    shortTimes: "Hornear 1 h 5 min.",
    cookLine: "Cocción: 1 h 5 min",
  },
};

describe.each(Object.entries(CASES))("%s parity", (locale, cases) => {
  const context = defaultParseContext(locale as RecipeLocale);

  it("reads abbreviated units and drops unit connectors", () => {
    const [line, unit, name] = cases.abbreviated;
    expect(parseIngredient(line, context)).toMatchObject({
      unit,
      ingredientText: name,
    });
    expect(parseIngredient(cases.connector[0], context).ingredientText).toBe(
      cases.connector[1],
    );
  });

  it("reads centiliters", () => {
    expect(parseIngredient(cases.centiliters, context)).toMatchObject({
      amount: { kind: "exact", value: 25 },
      unit: "cl",
    });
  });

  it("finds short-unit durations in steps", () => {
    expect(
      parseStep(cases.shortTimes, context).durations.map((d) => d.unit),
    ).toEqual(["hour", "minute"]);
  });

  it("totals an hour-and-minutes metadata value", () => {
    expect(parseRecipeMetadataLine(cases.cookLine, context)?.value).toBe(65);
  });

  it("accepts English and accent-free labels", () => {
    expect(parseRecipeMetadataLine("Yield: 4", context)?.value).toEqual({
      baseYield: 4,
    });
  });
});

describe("section headings", () => {
  it.each([
    ["tr", "MALZEMELER", "Yapilis", "Ipuclari"],
    ["fr", "Ingredients", "Etapes", "Astuces"],
    ["de", "Zutaten", "Zubereitung", "Tipps"],
    ["es", "Ingredientes", "Preparacion", "Consejos"],
    ["en", "Ingredients", "Method", "Tips"],
  ])(
    "%s accepts accent-free and any-case headings",
    (locale, ing, steps, notes) => {
      const node = (
        id: string,
        title: string,
        children: ConversionSourceNode[] = [],
      ) => ({ id, title, children });
      const draft = analyzeRecipeConversion(
        node("r", "Recipe", [
          node("y", "Yield: 2"),
          node("i", ing, [node("i1", "100 g x")]),
          node("s", steps, [node("s1", "Mix.")]),
          node("n", notes, [node("n1", "Note.")]),
        ]),
        defaultParseContext(locale as RecipeLocale),
      );
      expect(draft.sections.map((s) => s.role)).toEqual([
        "ingredients",
        "steps",
        "notes",
      ]);
    },
  );
});

describe("oven modes", () => {
  it.each([
    ["en", "Bake at 180°C in a fan oven.", "fan"],
    ["tr", "Fırını 190°C alt-üst ayarda önceden ısıt.", "conventional"],
    ["fr", "Cuire à 180°C chaleur tournante.", "fan"],
    ["de", "Bei 180 °C Ober-/Unterhitze backen.", "conventional"],
    ["es", "Hornear a 180°C con aire caliente.", "fan"],
  ])("%s reads the oven mode", (locale, text, mode) => {
    const [temperature] = parseStep(
      text,
      defaultParseContext(locale as RecipeLocale),
    ).temperatures;
    expect(temperature?.ovenMode).toBe(mode);
  });
});

it("reads a Turkish preheat that follows the temperature", () => {
  const [temperature] = parseStep(
    "Fırını 190°C alt-üst ayarda önceden ısıt.",
    defaultParseContext("tr"),
  ).temperatures;
  expect(temperature).toMatchObject({
    value: 190,
    ovenMode: "conventional",
    preheat: true,
  });
});

describe("heat levels and approximate times", () => {
  it.each([
    ["en", "Simmer over medium low heat for around 10 min.", "medium_low"],
    ["tr", "Orta ateşte ortalama 10 dk pişir.", "medium"],
    ["fr", "Cuire à feu doux à peu près 10 min.", "low"],
    ["de", "Bei mittlerer Hitze circa 10 Min. köcheln.", "medium"],
    ["es", "Cocinar a fuego lento unos 10 minutos.", "low"],
  ])("%s", (locale, text, level) => {
    const step = parseStep(text, defaultParseContext(locale as RecipeLocale));
    expect(step.heat[0]?.level).toBe(level);
    expect(step.durations[0]?.value).toEqual({
      kind: "approximate",
      value: 10,
    });
  });
});

describe("instructions not to do something", () => {
  it.each([
    ["en", "Bake 12 minutes; don't bake past 15 minutes.", [false, true]],
    ["tr", "10-12 dakika pişir, 15-16 dakikaya kadar pişirme.", [false, true]],
    ["fr", "Cuire 12 min, ne pas cuire plus de 15 min.", [false, true]],
    ["de", "12 Min. backen, nicht länger als 15 Min. backen.", [false, true]],
    ["es", "Hornear 12 minutos, no hornear más de 15 minutos.", [false, true]],
  ])(
    "%s keeps the timer for the do and drops it for the don't",
    (locale, text, negated) => {
      const durations = parseStep(
        text,
        defaultParseContext(locale as RecipeLocale),
      ).durations;
      expect(durations.map((d) => Boolean(d.negated))).toEqual(negated);
    },
  );

  it("reads Turkish case-suffixed times and the polite negative", () => {
    const [time] = parseStep(
      "Asla 20 dakikadan fazla pişirmeyin.",
      defaultParseContext("tr"),
    ).durations;
    expect(time).toMatchObject({ unit: "minute", negated: true });
  });
});

describe("an amount and a half", () => {
  it.each([
    ["en", "Simmer for 1 and a half hours.", "Bake for an hour and a half."],
    ["tr", "Bir buçuk saat pişir.", "1 buçuk saat pişir."],
    ["fr", "Cuire une heure et demie.", "Cuire 1 heure et demie."],
    ["de", "Anderthalb Stunden garen.", "Eineinhalb Stunden garen."],
    ["es", "Hornear una hora y media.", "Hornear 1 hora y media."],
  ])("%s times", (locale, before, after) => {
    for (const text of [before, after]) {
      const durations = parseStep(
        text,
        defaultParseContext(locale as RecipeLocale),
      ).durations;
      expect(durations.map((d) => [d.value, d.unit])).toEqual([
        [{ kind: "exact", value: 1.5 }, "hour"],
      ]);
    }
  });

  it("does not add a half that carries its own unit", () => {
    const durations = parseStep(
      "Rest 20 minutes and a half hour later glaze.",
      defaultParseContext("en"),
    ).durations;
    expect(durations.map((d) => d.value)).toEqual([
      { kind: "exact", value: 20 },
      { kind: "exact", value: 0.5 },
    ]);
  });

  it.each([
    ["en", "1 and a half cups flour", "cup_us", "flour"],
    ["tr", "bir buçuk su bardağı un", "su_bardagi", "un"],
    ["de", "anderthalb Tassen Mehl", "cup_metric", "Mehl"],
    ["fr", "un et demi tasse de lait", "cup_metric", "lait"],
  ])("%s ingredients", (locale, text, unit, name) => {
    expect(
      parseIngredient(text, defaultParseContext(locale as RecipeLocale)),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit,
      ingredientText: name,
    });
  });
});
