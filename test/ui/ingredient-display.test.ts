import { describe, expect, it } from "vitest";
import type { Ingredient, RecipeLocale } from "../../src/domain/recipe";
import { defaultParseContext } from "../../src/parsing/context";
import { parseIngredient } from "../../src/parsing/ingredient";
import {
  ingredientDisplayParts,
  ingredientTargetUnitParts,
  joinIngredientParts,
  shownAmount,
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

  it("shows a small volume in spoons below a fluid ounce, and mg as g", () => {
    const line = (amount: number, unit: Ingredient["unit"]): Ingredient => ({
      id: "i1",
      rawText: "",
      amount: { kind: "exact", value: amount },
      unit,
      ingredientText: "vanilla",
      scaleMode: "linear",
    });
    expect(formatIngredientForDisplay(line(5, "ml"), 1, 1, "us")).toBe(
      "1 tsp vanilla",
    );
    expect(formatIngredientForDisplay(line(15, "ml"), 1, 1, "us")).toBe(
      "1 tbsp vanilla",
    );
    expect(
      formatIngredientForDisplay(line(1, "tatli_kasigi"), 1, 1, "us"),
    ).toBe("2 tsp vanilla");
    expect(formatIngredientForDisplay(line(0.5, "tbsp_us"), 1, 1, "us")).toBe(
      "½ tbsp vanilla",
    );
    expect(formatIngredientForDisplay(line(1000, "mg"), 1, 2, "metric")).toBe(
      "2 g vanilla",
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

describe("an egg's own word after scaling", () => {
  const shown = (
    locale: RecipeLocale,
    rawText: string,
    base: number,
    target: number,
  ) =>
    formatIngredientForDisplay(
      {
        ...parseIngredient(rawText, defaultParseContext(locale)),
        id: "e",
        scaleMode: "linear",
      } as Ingredient,
      base,
      target,
      "metric",
    );

  it.each([
    ["en", "2 eggs", 4, 2, "1 egg"],
    ["en", "1 egg", 4, 8, "2 eggs"],
    ["en", "2 eggs, beaten", 4, 2, "1 egg, beaten"],
    ["fr", "2 œufs", 4, 2, "1 œuf"],
    ["de", "1 Ei", 2, 6, "3 Eier"],
    ["en", "1 egg yolk", 2, 4, "2 egg yolk"],
  ] as const)(
    "%s %s for %i scaled to %i reads %s",
    (locale, rawText, base, target, expected) => {
      expect(shown(locale, rawText, base, target)).toBe(expected);
    },
  );
});

describe("pints, quarts and gallons", () => {
  const shown = (
    rawText: string,
    source: "us" | "imperial",
    system: "metric" | "us" | "imperial",
    target = 1,
  ) =>
    formatIngredientForDisplay(
      {
        ...parseIngredient(rawText, defaultParseContext("en", source)),
        id: "p",
        scaleMode: "linear",
      } as Ingredient,
      1,
      target,
      system,
    );

  it.each([
    ["1 pint heavy cream", "us", "us", 1, "1 pint heavy cream"],
    ["1 quart chicken stock", "us", "us", 2, "2 quarts chicken stock"],
    ["1 pint heavy cream", "us", "metric", 1, "473 ml heavy cream"],
    ["1 pint milk", "imperial", "metric", 1, "568 ml milk"],
    ["1 gal water", "us", "metric", 1, "3.79 L water"],
  ] as const)(
    "%s (%s) in %s, %i×, reads %s",
    (rawText, source, system, target, expected) => {
      expect(shown(rawText, source, system, target)).toBe(expected);
    },
  );
});

describe("shownAmount", () => {
  const none = { find: () => null };

  it("is the number the line shows, in its unit", () => {
    expect(
      shownAmount(gramIngredient(225), 18, 12, "metric", undefined, none),
    ).toEqual({ value: 150, unit: "g" });
    expect(
      shownAmount(gramIngredient(1500), 1, 1, "metric", undefined, none),
    ).toEqual({ value: 1.5, unit: "kg" });
  });

  it("has none for a line that doesn't scale or has no single number", () => {
    const fixed = { ...gramIngredient(5), scaleMode: "fixed" as const };
    const range: Ingredient = {
      ...gramIngredient(1),
      amount: { kind: "range", min: 100, max: 150 },
    };
    expect(shownAmount(fixed, 1, 2, "metric", undefined, none)).toBeNull();
    expect(shownAmount(range, 1, 2, "metric", undefined, none)).toBeNull();
  });
});
