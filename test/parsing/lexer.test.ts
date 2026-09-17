import { describe, expect, it } from "vitest";
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
