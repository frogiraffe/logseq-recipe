import { describe, expect, it } from "vitest";
import { convertIngredientMassVolume } from "../../src/units/convert";
import {
  BUILTIN_INGREDIENT_RULES,
  builtInIngredientConversionProvider,
  composeIngredientConversionProviders,
  createIngredientConversionProvider,
  type IngredientConversionProvider,
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
});
