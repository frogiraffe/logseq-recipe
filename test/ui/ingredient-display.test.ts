import { describe, expect, it } from "vitest";
import type { Ingredient } from "../../src/domain/recipe";
import {
  ingredientDisplayParts,
  ingredientTargetUnitParts,
  joinIngredientParts,
} from "../../src/ui/ingredient-display";

const formatIngredientForDisplay = (
  ...args: Parameters<typeof ingredientDisplayParts>
) => joinIngredientParts(ingredientDisplayParts(...args));

const formatIngredientForTargetUnit = (
  ...args: Parameters<typeof ingredientTargetUnitParts>
) => {
  const parts = ingredientTargetUnitParts(...args);
  return parts ? joinIngredientParts(parts) : null;
};

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

describe("container count units", () => {
  it("pluralizes them after a number where the language does", () => {
    const cans: Ingredient = {
      id: "t",
      rawText: "1 can tomatoes",
      amount: { kind: "exact", value: 1 },
      unit: "can",
      ingredientText: "tomatoes",
      scaleMode: "linear",
    };
    const text = (locale: "en" | "de" | "tr") =>
      joinIngredientParts(ingredientDisplayParts(cans, 1, 2, "us", locale));
    expect(text("en")).toBe("2 cans tomatoes");
    expect(text("de")).toBe("2 Dosen tomatoes");
    expect(text("tr")).toBe("2 kutu tomatoes");
  });
});

describe("linking words", () => {
  const line = (rawText: string, ingredientText: string): Ingredient => ({
    id: "i",
    rawText,
    amount: { kind: "exact", value: 1 },
    unit: "cup_metric",
    ingredientText,
    scaleMode: "linear",
  });
  const text = (ingredient: Ingredient, locale: "fr" | "en" | "tr") =>
    ingredientDisplayParts(ingredient, 1, 2, "metric", locale).name;

  it("keeps the one the cook wrote between the unit and the name", () => {
    expect(text(line("1 tasse de farine", "farine"), "fr")).toBe("de farine");
    expect(text(line("1 tasse d'huile", "huile"), "fr")).toBe("d'huile");
    expect(text(line("1 tasse d’huile", "huile"), "fr")).toBe("d’huile");
    expect(text(line("1 cup of flour", "flour"), "en")).toBe("of flour");
  });

  it("adds none where none was written", () => {
    expect(text(line("1 tasse farine", "farine"), "fr")).toBe("farine");
    expect(text(line("1 su bardağı un", "un"), "tr")).toBe("un");
  });
});
