import { describe, expect, it } from "vitest";
import { defaultParseContext } from "../../src/parsing/context";
import { parseIngredient } from "../../src/parsing/ingredient";

describe("parseIngredient", () => {
  it("parses mixed fractions and resolves English cup to the source system", () => {
    expect(
      parseIngredient("1 1/2 cups flour", defaultParseContext("en")),
    ).toMatchObject({
      rawText: "1 1/2 cups flour",
      amount: { kind: "exact", value: 1.5 },
      unit: "cup_us",
      ingredientText: "flour",
      confidence: "exact",
    });
  });

  it("parses decimal-comma Turkish units", () => {
    expect(
      parseIngredient("1,5 yemek kaşığı kakao", defaultParseContext("tr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "tbsp_metric",
      ingredientText: "kakao",
      confidence: "exact",
    });
  });

  it("parses a numeric range as one quantity", () => {
    expect(
      parseIngredient("2-3 tbsp milk", defaultParseContext("en")),
    ).toMatchObject({
      amount: { kind: "range", min: 2, max: 3 },
      unit: "tbsp_us",
      ingredientText: "milk",
    });
  });

  it("supports common quantity words across locales", () => {
    expect(
      parseIngredient("½ tasse de lait", defaultParseContext("fr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 0.5 },
      unit: "cup_metric",
      ingredientText: "de lait",
    });
    expect(
      parseIngredient("1/2 Tasse Mehl", defaultParseContext("de")),
    ).toMatchObject({
      amount: { kind: "exact", value: 0.5 },
      unit: "cup_metric",
      ingredientText: "Mehl",
    });
    expect(
      parseIngredient("media taza de leche", defaultParseContext("es")),
    ).toMatchObject({
      amount: { kind: "exact", value: 0.5 },
      unit: "cup_metric",
      ingredientText: "de leche",
    });
  });

  it("splits only recognized hyphenated quantity-unit compounds", () => {
    expect(
      parseIngredient("demi-tasse de lait", defaultParseContext("fr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 0.5 },
      unit: "cup_metric",
      ingredientText: "de lait",
      confidence: "exact",
    });

    expect(
      parseIngredient("medium-high heat", defaultParseContext("en")),
    ).toEqual({
      rawText: "medium-high heat",
      ingredientText: "medium-high heat",
      confidence: "unparsed",
    });
  });

  it("keeps an ingredient-specific count word as ingredient text", () => {
    expect(parseIngredient("2 eggs", defaultParseContext("en"))).toMatchObject({
      amount: { kind: "exact", value: 2 },
      unit: "egg",
      ingredientText: "eggs",
    });
  });

  it("extracts only an explicit trailing parenthetical note", () => {
    expect(
      parseIngredient(
        "120 g dark chocolate (roughly chopped)",
        defaultParseContext("en"),
      ),
    ).toMatchObject({
      amount: { kind: "exact", value: 120 },
      unit: "g",
      ingredientText: "dark chocolate",
      note: "roughly chopped",
      confidence: "exact",
    });
  });

  it("does not fabricate quantities for qualitative text", () => {
    expect(
      parseIngredient("aldığı kadar un", defaultParseContext("tr")),
    ).toEqual({
      rawText: "aldığı kadar un",
      ingredientText: "aldığı kadar un",
      confidence: "unparsed",
    });
  });

  describe("ingredient-first suffix form", () => {
    it("parses '<ingredient> <amount> <unit>' when no leading quantity is found", () => {
      expect(
        parseIngredient("flour 200 g", defaultParseContext("en")),
      ).toMatchObject({
        amount: { kind: "exact", value: 200 },
        unit: "g",
        ingredientText: "flour",
        confidence: "exact",
      });
      expect(
        parseIngredient("milk 250 ml", defaultParseContext("en")),
      ).toMatchObject({
        amount: { kind: "exact", value: 250 },
        unit: "ml",
        ingredientText: "milk",
        confidence: "exact",
      });
    });

    it("keeps a digit embedded in the ingredient name out of the parsed amount", () => {
      expect(
        parseIngredient("test1 2 grams", defaultParseContext("en")),
      ).toMatchObject({
        amount: { kind: "exact", value: 2 },
        unit: "g",
        ingredientText: "test1",
        confidence: "exact",
      });
    });

    it("supports a trailing range suffix", () => {
      expect(
        parseIngredient("sugar 2-3 tbsp", defaultParseContext("en")),
      ).toMatchObject({
        amount: { kind: "range", min: 2, max: 3 },
        unit: "tbsp_us",
        ingredientText: "sugar",
        confidence: "exact",
      });
    });

    it("still parses the existing amount-first form unchanged", () => {
      expect(
        parseIngredient("120 g butter", defaultParseContext("en")),
      ).toMatchObject({
        amount: { kind: "exact", value: 120 },
        unit: "g",
        ingredientText: "butter",
      });
    });

    it("requires a recognized trailing unit and leaves an unrecognized trailing number unparsed", () => {
      expect(
        parseIngredient("chocolate chips 2", defaultParseContext("en")),
      ).toEqual({
        rawText: "chocolate chips 2",
        ingredientText: "chocolate chips 2",
        confidence: "unparsed",
      });
    });
  });
});
