import { describe, expect, it } from "vitest";
import { formatRecipeNumber } from "../src/domain/fractions";
import type { Ingredient } from "../src/domain/recipe";
import {
  scaleAmount,
  scaleIngredient,
  scaleQuantity,
  servingFactor,
} from "../src/domain/scaling";

describe("serving scaling", () => {
  it("computes the serving factor", () => {
    expect(servingFactor(4, 6)).toBe(1.5);
  });

  it("scales canonical numeric amounts from the base yield", () => {
    expect(scaleAmount(60, 4, 6)).toBe(90);
    expect(scaleAmount(66, 4, 6)).toBe(99);
    expect(scaleAmount(43, 4, 2)).toBe(21.5);
  });

  it("scales a range without changing source text", () => {
    const ingredient: Ingredient = {
      id: "i1",
      rawText: "2-3 tbsp milk",
      ingredientText: "milk",
      amount: { kind: "range", min: 2, max: 3 },
      unit: "tbsp_us",
      scaleMode: "linear",
    };

    const scaled = scaleIngredient(ingredient, 2, 4);

    expect(scaled.rawText).toBe("2-3 tbsp milk");
    expect(scaled.amount).toEqual({ kind: "range", min: 4, max: 6 });
  });

  it("scales exact, minimum, maximum and approximate quantities", () => {
    expect(scaleQuantity({ kind: "exact", value: 2 }, 3)).toEqual({
      kind: "exact",
      value: 6,
    });
    expect(scaleQuantity({ kind: "minimum", value: 2 }, 3)).toEqual({
      kind: "minimum",
      value: 6,
    });
    expect(scaleQuantity({ kind: "maximum", value: 2 }, 3)).toEqual({
      kind: "maximum",
      value: 6,
    });
    expect(scaleQuantity({ kind: "approximate", value: 2 }, 3)).toEqual({
      kind: "approximate",
      value: 6,
    });
  });

  it("does not invent a scaled value for inexact quantities", () => {
    const quantity = { kind: "inexact", expression: "to taste" } as const;
    expect(scaleQuantity(quantity, 2)).toEqual(quantity);
  });

  it("keeps fixed ingredients unchanged", () => {
    const ingredient: Ingredient = {
      id: "salt-to-taste",
      rawText: "1 pinch salt",
      ingredientText: "salt",
      amount: { kind: "exact", value: 1 },
      unit: "pinch",
      scaleMode: "fixed",
    };

    expect(scaleIngredient(ingredient, 4, 8)).toEqual(ingredient);
  });

  it("rejects invalid yields", () => {
    expect(() => servingFactor(0, 4)).toThrow(RangeError);
    expect(() => servingFactor(4, 0)).toThrow(RangeError);
    expect(() => servingFactor(-1, 4)).toThrow(RangeError);
  });
});

describe("recipe number formatting", () => {
  it("uses friendly common fractions", () => {
    expect(formatRecipeNumber(0.5)).toBe("½");
    expect(formatRecipeNumber(0.25)).toBe("¼");
    expect(formatRecipeNumber(1.5)).toBe("1½");
    expect(formatRecipeNumber(0.75)).toBe("¾");
  });

  it("keeps ordinary decimals readable", () => {
    expect(formatRecipeNumber(64.5)).toBe("64½");
    expect(formatRecipeNumber(21.2)).toBe("21.2");
  });
});
