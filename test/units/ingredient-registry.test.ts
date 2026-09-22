import { describe, expect, it } from "vitest";
import { convertIngredientMassVolume } from "../../src/units/convert";
import {
  BUILTIN_INGREDIENT_RULES,
  builtInIngredientConversionProvider,
  composeIngredientConversionProviders,
  createIngredientConversionProvider,
  type IngredientConversionProvider,
  normalizeIngredientText,
} from "../../src/units/ingredient-registry";

describe("ingredient conversion registry", () => {
  it("ships sourced rules for common ingredients", () => {
    expect(BUILTIN_INGREDIENT_RULES.map((rule) => rule.key)).toContain(
      "all-purpose-flour",
    );
    expect(BUILTIN_INGREDIENT_RULES.map((rule) => rule.key)).toContain(
      "butter",
    );
    expect(BUILTIN_INGREDIENT_RULES.map((rule) => rule.key)).toContain(
      "granulated-sugar",
    );
  });

  it("finds aliases without language-specific parser code", () => {
    expect(builtInIngredientConversionProvider.find("un")?.key).toBe(
      "all-purpose-flour",
    );
    expect(builtInIngredientConversionProvider.find("beurre")?.key).toBe(
      "butter",
    );
    expect(builtInIngredientConversionProvider.find("harina")?.key).toBe(
      "all-purpose-flour",
    );
  });

  it("ships sourced rules for a conservative set of common baking ingredients", () => {
    const keys = BUILTIN_INGREDIENT_RULES.map((rule) => rule.key);
    for (const key of [
      "bread-flour",
      "whole-wheat-flour",
      "brown-sugar",
      "confectioners-sugar",
      "cocoa-powder",
      "honey",
      "vegetable-oil",
      "milk",
      "rolled-oats",
      "cornstarch",
    ]) {
      expect(keys).toContain(key);
    }
    for (const rule of BUILTIN_INGREDIENT_RULES) {
      expect(rule.sourceNote.length).toBeGreaterThan(0);
      expect(rule.gramsPerMilliliter).toBeGreaterThan(0);
    }
  });

  it("finds locale aliases for the expanded ingredients", () => {
    expect(builtInIngredientConversionProvider.find("esmer şeker")?.key).toBe(
      "brown-sugar",
    );
    expect(builtInIngredientConversionProvider.find("kakao")?.key).toBe(
      "cocoa-powder",
    );
    expect(builtInIngredientConversionProvider.find("süt")?.key).toBe("milk");
    expect(builtInIngredientConversionProvider.find("miel")?.key).toBe("honey");
  });

  it("converts brown sugar mass to US cups using the sourced rule", () => {
    const result = convertIngredientMassVolume(
      213,
      "g",
      "cup_us",
      "brown sugar",
      builtInIngredientConversionProvider,
    );
    expect(result).not.toBeNull();
    expect(result ?? 0).toBeCloseTo(1, 10);
  });

  it("converts flour mass to US cups using the ingredient rule", () => {
    const result = convertIngredientMassVolume(
      120,
      "g",
      "cup_us",
      "all-purpose flour",
      builtInIngredientConversionProvider,
    );
    expect(result).not.toBeNull();
    expect(result ?? 0).toBeCloseTo(1, 10);
  });

  it("returns null instead of guessing for an unknown ingredient", () => {
    expect(
      convertIngredientMassVolume(
        100,
        "g",
        "cup_us",
        "mystery powder",
        builtInIngredientConversionProvider,
      ),
    ).toBeNull();
  });

  it("lets a generic user provider override built-in matching without storage coupling", () => {
    const userProvider: IngredientConversionProvider = {
      find: (ingredientText) =>
        ingredientText.toLowerCase().includes("flour")
          ? {
              key: "my-flour",
              aliases: ["flour"],
              gramsPerMilliliter: 0.6,
              sourceNote: "User override",
            }
          : null,
    };

    const provider = composeIngredientConversionProviders(
      userProvider,
      builtInIngredientConversionProvider,
    );
    expect(provider.find("flour")?.key).toBe("my-flour");
  });

  it("converts a per-recipe override into a density and gives it precedence", () => {
    const provider = createIngredientConversionProvider([
      {
        ingredientKey: "all-purpose flour",
        massUnit: "g",
        volumeUnit: "cup_us",
        gramsPerVolumeUnit: 150,
      },
    ]);

    const rule = provider.find("all-purpose flour");
    expect(rule?.key).toBe("all-purpose flour");
    expect(rule?.sourceNote).toContain("Recipe override");

    const result = convertIngredientMassVolume(
      150,
      "g",
      "cup_us",
      "all-purpose flour",
      provider,
    );
    expect(result).toBeCloseTo(1, 10);
  });

  describe("specificity: a compound name never inherits a generic word's density", () => {
    it("matches bread flour to its own rule, not generic flour", () => {
      expect(builtInIngredientConversionProvider.find("bread flour")?.key).toBe(
        "bread-flour",
      );
    });

    it("matches whole wheat flour to its own rule, not generic flour", () => {
      expect(
        builtInIngredientConversionProvider.find("whole wheat flour")?.key,
      ).toBe("whole-wheat-flour");
    });

    it("returns no rule for almond flour instead of guessing all-purpose flour's density", () => {
      expect(
        builtInIngredientConversionProvider.find("almond flour"),
      ).toBeNull();
    });

    it("returns no rule for peanut butter instead of guessing butter's density", () => {
      expect(
        builtInIngredientConversionProvider.find("peanut butter"),
      ).toBeNull();
    });

    it("returns no rule for milk powder instead of guessing liquid milk's density", () => {
      expect(
        builtInIngredientConversionProvider.find("milk powder"),
      ).toBeNull();
    });

    it("still matches the bare generic word on its own", () => {
      expect(builtInIngredientConversionProvider.find("flour")?.key).toBe(
        "all-purpose-flour",
      );
      expect(builtInIngredientConversionProvider.find("butter")?.key).toBe(
        "butter",
      );
      expect(builtInIngredientConversionProvider.find("milk")?.key).toBe(
        "milk",
      );
    });
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    "ignores invalid per-recipe conversion weight %s",
    (gramsPerVolumeUnit) => {
      const provider = createIngredientConversionProvider(
        [
          {
            ingredientKey: "mystery flour",
            massUnit: "g",
            volumeUnit: "tbsp_metric",
            gramsPerVolumeUnit,
          },
        ],
        [],
      );
      expect(provider.find("mystery flour")).toBeNull();
    },
  );

  it("resolves conflicting overrides for the same normalized ingredient key deterministically (last one wins)", () => {
    const provider = createIngredientConversionProvider([
      {
        ingredientKey: "Un",
        massUnit: "g",
        volumeUnit: "cup_metric",
        gramsPerVolumeUnit: 120,
      },
      {
        ingredientKey: "un",
        massUnit: "g",
        volumeUnit: "tbsp_metric",
        gramsPerVolumeUnit: 8,
      },
    ]);

    const rules = [...Array(1)].map(() => provider.find("un"));
    expect(rules).toHaveLength(1);
    expect(rules[0]?.sourceNote).toContain("tbsp_metric");
  });

  it("normalizes every Turkish I-family character (I, İ, ı, i) to the same result", () => {
    // The alias is "tereyağı" (dotless ı). A user typing it with an ASCII
    // capital I, a Turkish capital İ, or already-correct casing must all
    // match the same rule - String.toLocaleLowerCase() with no locale
    // argument is the one thing that could make this depend on the host
    // environment's default locale (Turkish vs. anything else disagree on
    // how ASCII "I" lowercases).
    const variants = ["tereyağı", "TEREYAĞI", "tereyağİ", "Tereyağı"];
    const normalized = variants.map(normalizeIngredientText);
    expect(new Set(normalized).size).toBe(1);
    for (const variant of variants) {
      expect(builtInIngredientConversionProvider.find(variant)?.key).toBe(
        "butter",
      );
    }
  });
});
