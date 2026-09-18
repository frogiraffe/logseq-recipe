import { describe, expect, it } from "vitest";
import type { Ingredient, Recipe, RecipeStep } from "../../src/domain/recipe";

function ingredient(): Ingredient {
  return {
    id: "i1",
    rawText: "2-3 tbsp milk",
    ingredientText: "milk",
    amount: { kind: "range", min: 2, max: 3 },
    unit: "tbsp_us",
    scaleMode: "linear",
  };
}

describe("recipe domain", () => {
  it("keeps original ingredient and step text alongside derived structure", () => {
    const step: RecipeStep = {
      id: "s1",
      rawText: "Bake for 10-12 minutes at 180°C.",
      durations: [
        {
          kind: "duration",
          value: { kind: "range", min: 10, max: 12 },
          unit: "minute",
          rawText: "10-12 minutes",
          startOffset: 9,
          endOffset: 22,
        },
      ],
      temperatures: [
        {
          kind: "temperature",
          value: 180,
          unit: "celsius",
          rawText: "180°C",
          startOffset: 26,
          endOffset: 31,
        },
      ],
      heat: [],
    };

    const recipe: Recipe = {
      id: "r1",
      title: "Cookie",
      baseYield: 8,
      yieldUnit: "cookies",
      categories: ["Dessert"],
      tags: ["Chocolate"],
      ingredients: [ingredient()],
      steps: [step],
      notes: [],
      schemaVersion: 1,
      parserLocale: "en",
      measurementSystemOverride: "metric",
      ingredientConversionOverrides: [],
    };

    expect(recipe.ingredients[0].rawText).toBe("2-3 tbsp milk");
    expect(recipe.steps[0].rawText).toContain("180°C");
    expect(recipe.steps[0].durations[0].startOffset).toBe(9);
    expect(recipe.ingredientConversionOverrides).toEqual([]);
  });
});
