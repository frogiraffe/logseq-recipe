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

  // Turkish: nouns after numerals don't pluralize, and "kilo" is already far
  // more common in speech than "kilogram".
  it("recognizes the everyday word 'kilo' in Turkish", () => {
    expect(
      parseIngredient("300 kilo beyaz şeker", defaultParseContext("tr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 300 },
      unit: "kg",
      ingredientText: "beyaz şeker",
      confidence: "exact",
    });
    expect(
      parseIngredient("1,5 kilo un", defaultParseContext("tr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "kg",
      ingredientText: "un",
    });
  });

  // English: "kilo"/"kilos" is common outside US usage ("a kilo of flour").
  it("recognizes 'kilo'/'kilos' in English", () => {
    expect(
      parseIngredient("1 kilo flour", defaultParseContext("en")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1 },
      unit: "kg",
      ingredientText: "flour",
    });
    expect(
      parseIngredient("2 kilos sugar", defaultParseContext("en")),
    ).toMatchObject({
      amount: { kind: "exact", value: 2 },
      unit: "kg",
      ingredientText: "sugar",
    });
    expect(
      parseIngredient("1.5 kilos butter", defaultParseContext("en")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "kg",
      ingredientText: "butter",
    });
  });

  // French: "kilo"/"kilos" is everyday usage, more common than "kilogramme".
  it("recognizes 'kilo'/'kilos' in French", () => {
    expect(
      parseIngredient("1 kilo de farine", defaultParseContext("fr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1 },
      unit: "kg",
      ingredientText: "de farine",
    });
    expect(
      parseIngredient("2 kilos de sucre", defaultParseContext("fr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 2 },
      unit: "kg",
      ingredientText: "de sucre",
    });
    expect(
      parseIngredient("1,5 kilo de beurre", defaultParseContext("fr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "kg",
      ingredientText: "de beurre",
    });
  });

  // German: units stay invariant after a numeral ("2 Kilo", never "2
  // Kilos"), matching the existing gramm/liter entries - only the singular
  // form is natural here.
  it("recognizes 'Kilo' (invariant) in German", () => {
    expect(
      parseIngredient("1 Kilo Mehl", defaultParseContext("de")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1 },
      unit: "kg",
      ingredientText: "Mehl",
    });
    expect(
      parseIngredient("2 Kilo Zucker", defaultParseContext("de")),
    ).toMatchObject({
      amount: { kind: "exact", value: 2 },
      unit: "kg",
      ingredientText: "Zucker",
    });
    expect(
      parseIngredient("1,5 Kilo Butter", defaultParseContext("de")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "kg",
      ingredientText: "Butter",
    });
  });

  // Spanish: "kilo"/"kilos" pluralizes normally, as common as "kilogramo".
  it("recognizes 'kilo'/'kilos' in Spanish", () => {
    expect(
      parseIngredient("1 kilo de harina", defaultParseContext("es")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1 },
      unit: "kg",
      ingredientText: "de harina",
    });
    expect(
      parseIngredient("2 kilos de azúcar", defaultParseContext("es")),
    ).toMatchObject({
      amount: { kind: "exact", value: 2 },
      unit: "kg",
      ingredientText: "de azúcar",
    });
    expect(
      parseIngredient("1,5 kilos de mantequilla", defaultParseContext("es")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "kg",
      ingredientText: "de mantequilla",
    });
  });

  // Realistic multilingual corpus: grams, ml/liter, tbsp, a count unit
  // (egg/clove), and a decimal quantity, in natural recipe phrasing for
  // each locale - not a literal translation of the same sentence.
  it("parses a realistic multilingual corpus: grams/ml/tbsp/count-units/decimals", () => {
    expect(
      parseIngredient("250 grammes de farine", defaultParseContext("fr")),
    ).toMatchObject({ unit: "g", ingredientText: "de farine" });
    expect(
      parseIngredient("500 ml de lait", defaultParseContext("fr")),
    ).toMatchObject({ unit: "ml", ingredientText: "de lait" });
    expect(
      parseIngredient(
        "2 cuillères à soupe de sucre",
        defaultParseContext("fr"),
      ),
    ).toMatchObject({ unit: "tbsp_metric", ingredientText: "de sucre" });
    expect(parseIngredient("3 œufs", defaultParseContext("fr"))).toMatchObject({
      unit: "egg",
      ingredientText: "œufs",
    });
    expect(
      parseIngredient("2 gousses de vanille", defaultParseContext("fr")),
    ).toMatchObject({ unit: "clove", ingredientText: "de vanille" });
    expect(
      parseIngredient("1,5 litre de lait", defaultParseContext("fr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "l",
    });

    expect(
      parseIngredient("250 Gramm Mehl", defaultParseContext("de")),
    ).toMatchObject({ unit: "g", ingredientText: "Mehl" });
    expect(
      parseIngredient("500 Milliliter Milch", defaultParseContext("de")),
    ).toMatchObject({ unit: "ml", ingredientText: "Milch" });
    expect(
      parseIngredient("2 Esslöffel Zucker", defaultParseContext("de")),
    ).toMatchObject({ unit: "tbsp_metric", ingredientText: "Zucker" });
    expect(parseIngredient("3 Eier", defaultParseContext("de"))).toMatchObject({
      unit: "egg",
      ingredientText: "Eier",
    });
    expect(
      parseIngredient("2 Zehen Knoblauch", defaultParseContext("de")),
    ).toMatchObject({ unit: "clove", ingredientText: "Knoblauch" });
    expect(
      parseIngredient("1,5 Liter Wasser", defaultParseContext("de")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "l",
    });

    expect(
      parseIngredient("250 gramos de harina", defaultParseContext("es")),
    ).toMatchObject({ unit: "g", ingredientText: "de harina" });
    expect(
      parseIngredient("500 mililitros de leche", defaultParseContext("es")),
    ).toMatchObject({ unit: "ml", ingredientText: "de leche" });
    expect(
      parseIngredient("2 cucharadas de azúcar", defaultParseContext("es")),
    ).toMatchObject({ unit: "tbsp_metric", ingredientText: "de azúcar" });
    expect(
      parseIngredient("3 huevos", defaultParseContext("es")),
    ).toMatchObject({ unit: "egg", ingredientText: "huevos" });
    expect(
      parseIngredient("2 dientes de ajo", defaultParseContext("es")),
    ).toMatchObject({ unit: "clove", ingredientText: "de ajo" });
    expect(
      parseIngredient("1,5 litros de agua", defaultParseContext("es")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "l",
    });

    expect(
      parseIngredient("250 gram un", defaultParseContext("tr")),
    ).toMatchObject({ unit: "g", ingredientText: "un" });
    expect(
      parseIngredient("500 ml süt", defaultParseContext("tr")),
    ).toMatchObject({ unit: "ml", ingredientText: "süt" });
    expect(
      parseIngredient("2 yemek kaşığı şeker", defaultParseContext("tr")),
    ).toMatchObject({ unit: "tbsp_metric", ingredientText: "şeker" });
    expect(
      parseIngredient("3 yumurta", defaultParseContext("tr")),
    ).toMatchObject({ unit: "egg", ingredientText: "yumurta" });
    expect(
      parseIngredient("2 diş sarımsak", defaultParseContext("tr")),
    ).toMatchObject({ unit: "clove", ingredientText: "sarımsak" });
    expect(
      parseIngredient("1,5 litre su", defaultParseContext("tr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "l",
    });

    expect(
      parseIngredient("250 grams flour", defaultParseContext("en")),
    ).toMatchObject({ unit: "g", ingredientText: "flour" });
    expect(
      parseIngredient("500 ml milk", defaultParseContext("en")),
    ).toMatchObject({ unit: "ml", ingredientText: "milk" });
    expect(
      parseIngredient("2 tablespoons sugar", defaultParseContext("en")),
    ).toMatchObject({ unit: "tbsp_us", ingredientText: "sugar" });
    expect(
      parseIngredient("2 cloves garlic", defaultParseContext("en")),
    ).toMatchObject({ unit: "clove", ingredientText: "garlic" });
    expect(
      parseIngredient("1.5 liters water", defaultParseContext("en")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "l",
    });
  });

  it("resolves su bardağı and çay bardağı to their own fixed units, not a generic metric cup", () => {
    expect(
      parseIngredient("1 su bardağı un", defaultParseContext("tr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1 },
      unit: "su_bardagi",
      ingredientText: "un",
    });
    expect(
      parseIngredient("2 çay bardağı süt", defaultParseContext("tr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 2 },
      unit: "cay_bardagi",
      ingredientText: "süt",
    });
    // The bare, unqualified "bardak" stays the generic metric cup - only the
    // explicit su/çay bardağı phrases get their own fixed identity.
    expect(
      parseIngredient("1 bardak şeker", defaultParseContext("tr")),
    ).toMatchObject({
      unit: "cup_metric",
    });
  });

  it("resolves tatlı kaşığı to its own unit, distinct from çay kaşığı/yemek kaşığı", () => {
    expect(
      parseIngredient("1 tatlı kaşığı bal", defaultParseContext("tr")),
    ).toMatchObject({
      amount: { kind: "exact", value: 1 },
      unit: "tatli_kasigi",
      ingredientText: "bal",
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

  it("rejects a reversed range instead of reordering min/max", () => {
    const parsed = parseIngredient("3-2 tbsp milk", defaultParseContext("en"));
    expect(parsed.amount).toBeUndefined();
    expect(parsed.confidence).toBe("unparsed");
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

    it("supports a trailing parenthetical note after the unit", () => {
      expect(
        parseIngredient("flour 200 g (sifted)", defaultParseContext("en")),
      ).toMatchObject({
        amount: { kind: "exact", value: 200 },
        unit: "g",
        ingredientText: "flour",
        note: "sifted",
        confidence: "exact",
      });
    });

    it("rejects trailing text after the unit that isn't a clean parenthetical note", () => {
      expect(
        parseIngredient("flour 200 g plus more", defaultParseContext("en")),
      ).toEqual({
        rawText: "flour 200 g plus more",
        ingredientText: "flour 200 g plus more",
        confidence: "unparsed",
      });
    });
  });
});
