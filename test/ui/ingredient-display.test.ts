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
    ).toBe("1.5 kg flour");
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

  it("steps US units up and metric/pound units down", () => {
    const line = (amount: number, unit: Ingredient["unit"]): Ingredient => ({
      id: "i1",
      rawText: "",
      amount: { kind: "exact", value: amount },
      unit,
      ingredientText: "flour",
      scaleMode: "linear",
    });
    expect(formatIngredientForDisplay(line(40, "oz_mass"), 1, 1, "us")).toBe(
      "2½ lb flour",
    );
    expect(formatIngredientForDisplay(line(12, "fl_oz_us"), 1, 1, "us")).toBe(
      "1½ cups flour",
    );
    expect(
      formatIngredientForDisplay(line(1.5, "kg"), 4, 1, "metric", "tr"),
    ).toBe("375 g flour");
    expect(formatIngredientForDisplay(line(250, "ml"), 4, 1, "metric")).toBe(
      "62.5 ml flour",
    );
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
