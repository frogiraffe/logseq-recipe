import { describe, expect, it } from "vitest";
import type { Ingredient } from "../../src/domain/recipe";
import {
  formatIngredientForDisplay,
  formatIngredientForTargetUnit,
} from "../../src/ui/ingredient-display";

function gramIngredient(value: number): Ingredient {
  return {
    id: "i1",
    rawText: `${value} g flour`,
    amount: { kind: "exact", value },
    unit: "g",
    ingredientText: "flour",
    scaleMode: "linear",
  };
}

function mlIngredient(value: number): Ingredient {
  return {
    id: "i1",
    rawText: `${value} ml milk`,
    amount: { kind: "exact", value },
    unit: "ml",
    ingredientText: "milk",
    scaleMode: "linear",
  };
}

describe("adaptive same-family display units", () => {
  it("bumps 1500 g up to 1.5 kg", () => {
    expect(
      formatIngredientForDisplay(gramIngredient(1500), 1, 1, "metric"),
    ).toBe("1½ kg flour");
  });

  it("bumps exactly 1000 ml up to 1 L", () => {
    expect(formatIngredientForDisplay(mlIngredient(1000), 1, 1, "metric")).toBe(
      "1 L milk",
    );
  });

  it("leaves a sub-1000 value in its original unit", () => {
    expect(
      formatIngredientForDisplay(gramIngredient(500), 1, 1, "metric"),
    ).toBe("500 g flour");
  });

  it("does not touch non-metric mass/volume families (oz/lb, US/imperial cups)", () => {
    const ounces: Ingredient = {
      id: "i1",
      rawText: "40 oz flour",
      amount: { kind: "exact", value: 40 },
      unit: "oz_mass",
      ingredientText: "flour",
      scaleMode: "linear",
    };
    expect(formatIngredientForDisplay(ounces, 1, 1, "us")).toBe("40 oz flour");
  });

  it("never applies once the user has explicitly picked a display unit", () => {
    const result = formatIngredientForTargetUnit(
      gramIngredient(1500),
      1,
      1,
      "g",
      { find: () => null },
    );
    expect(result).toBe("1500 g flour");
  });
});
