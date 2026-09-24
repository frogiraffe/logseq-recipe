import { describe, expect, it } from "vitest";
import type { RecipeLocale } from "../../src/domain/recipe";
import { lexRecipeText } from "../../src/parsing/lexer";
import { deLexerCases } from "./fixtures/de";
import { enLexerCases } from "./fixtures/en";
import { esLexerCases } from "./fixtures/es";
import { frLexerCases } from "./fixtures/fr";
import { trLexerCases } from "./fixtures/tr";

const cases = [
  ...enLexerCases.map((fixture) => ({ locale: "en" as const, ...fixture })),
  ...trLexerCases.map((fixture) => ({ locale: "tr" as const, ...fixture })),
  ...frLexerCases.map((fixture) => ({ locale: "fr" as const, ...fixture })),
  ...deLexerCases.map((fixture) => ({ locale: "de" as const, ...fixture })),
  ...esLexerCases.map((fixture) => ({ locale: "es" as const, ...fixture })),
];

describe("lexRecipeText", () => {
  for (const fixture of cases) {
    it(`lexes ${fixture.locale}: ${fixture.text}`, () => {
      const tokens = lexRecipeText(fixture.text, fixture.locale);

      expect(tokens.map((token) => token.kind)).toEqual(fixture.kinds);
      expect(tokens.map((token) => token.normalized)).toEqual(
        fixture.normalized,
      );

      for (const token of tokens) {
        expect(fixture.text.slice(token.startOffset, token.endOffset)).toBe(
          token.raw,
        );
      }
    });
  }

  it("normalizes dash variants without changing source spans", () => {
    const text = "10–12 dakika";
    const tokens = lexRecipeText(text, "tr");
    expect(tokens.map((token) => token.kind)).toEqual([
      "number",
      "range",
      "number",
      "unit",
    ]);
    expect(tokens[1].raw).toBe("–");
    expect(tokens[1].normalized).toBe("-");
  });
});

describe("lexRecipeText edge forms", () => {
  const kinds = (text: string, locale: RecipeLocale) =>
    lexRecipeText(text, locale).map(
      (token) => `${token.kind}:${token.normalized}`,
    );

  it.each([
    ["180 ºC", "es"],
    ["180˚C", "en"],
    ["350° F", "en"],
    ["180 °C", "de"],
  ] as const)("reads the degree sign in %s", (text, locale) => {
    const [, scale] = lexRecipeText(text, locale);
    expect(scale.kind).toBe("unit");
    expect(scale.raw).toBe(text.slice(text.search(/[°º˚]/u)));
  });

  it("keeps a word after a spaced degree sign separate", () => {
    expect(kinds("350° Cook", "en")).toEqual([
      "number:350",
      "symbol:°",
      "word:cook",
    ]);
  });

  it.each([
    ["1⁄2 cup", ["fraction:0.5", "unit:cup"]],
    ["1-1/2 cups", ["number:1", "fraction:0.5", "unit:cup"]],
    ["1/2-1 cup", ["fraction:0.5", "range:-", "number:1", "unit:cup"]],
    ["~200 g", ["modifier:approximate", "number:200", "unit:g"]],
    ["1 000 g", ["number:1000", "unit:g"]],
  ] as const)("%s", (text, expected) => {
    expect(kinds(text, "en")).toEqual(expected);
  });

  it("groups thousands with a plain space only where the language does", () => {
    expect(kinds("1 500 g", "fr")).toEqual(["number:1500", "unit:g"]);
    expect(kinds("1 500 g", "en")).toEqual([
      "number:1",
      "number:500",
      "unit:g",
    ]);
  });

  it("reads Turkish case endings after an apostrophe", () => {
    expect(kinds("3'er dakika", "tr")).toEqual(["number:3", "unit:minute"]);
    expect(kinds("200 ml'lik krema", "tr")).toEqual([
      "number:200",
      "unit:ml",
      "word:krema",
    ]);
    // Only Turkish: in French "l'" is an article, never a litre.
    expect(kinds("l'eau", "fr")).toEqual(["word:l'eau"]);
  });

  it.each([
    ["between 10 and 15 minutes", "en"],
    ["entre 10 et 15 minutes", "fr"],
    ["zwischen 10 und 15 Minuten", "de"],
    ["entre 10 y 15 minutos", "es"],
  ] as const)("turns %s into a range", (text, locale) => {
    expect(lexRecipeText(text, locale).map((token) => token.kind)).toEqual([
      "word",
      "number",
      "range",
      "number",
      "unit",
    ]);
  });

  it.each([
    ["twenty-five", "en", 25],
    ["vingt-cinq", "fr", 25],
    ["soixante-dix", "fr", 70],
    ["one-half", "en", 0.5],
  ] as const)("joins the hyphenated number %s", (text, locale, value) => {
    expect(kinds(text, locale)).toEqual([`quantity_word:${value}`]);
  });

  it("returns the same frozen tokens for a repeated line", () => {
    const first = lexRecipeText("2 cups flour", "en");
    expect(lexRecipeText("2 cups flour", "en")).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
