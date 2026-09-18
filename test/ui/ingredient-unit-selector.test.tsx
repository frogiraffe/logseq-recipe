import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import { IngredientList } from "../../src/ui/components/IngredientList";
import { enMessages } from "../../src/ui/i18n";

const recipe: Recipe = {
  id: "r1",
  title: "Butter Test",
  baseYield: 1,
  categories: [],
  tags: [],
  ingredients: [
    {
      id: "butter",
      rawText: "14.2 g butter",
      amount: { kind: "exact", value: 14.2 },
      unit: "g",
      ingredientText: "butter",
      scaleMode: "linear",
    },
  ],
  steps: [],
  notes: [],
  schemaVersion: 1,
  ingredientConversionOverrides: [
    {
      ingredientKey: "butter",
      massUnit: "g",
      volumeUnit: "tbsp_us",
      gramsPerVolumeUnit: 14.2,
    },
  ],
};

describe("ingredient display-unit selector", () => {
  it("uses recipe conversion rules without mutating canonical ingredient data", () => {
    render(
      <IngredientList
        recipe={recipe}
        targetYield={1}
        measurementSystem="metric"
        messages={enMessages}
      />,
    );

    const select = screen.getByLabelText(
      `butter ${enMessages.measurementSystem}`,
    );
    fireEvent.change(select, { target: { value: "tbsp_us" } });

    expect(screen.getByText("1 tbsp butter")).toBeTruthy();
    expect(recipe.ingredients[0].rawText).toBe("14.2 g butter");
    expect(recipe.ingredients[0].unit).toBe("g");
  });

  it("keeps egg and generic piece count labels natural while scaling", () => {
    const countRecipe: Recipe = {
      ...recipe,
      id: "counts",
      baseYield: 2,
      ingredientConversionOverrides: [],
      ingredients: [
        {
          id: "eggs",
          rawText: "2 yumurta",
          amount: { kind: "exact", value: 2 },
          unit: "egg",
          ingredientText: "yumurta",
          scaleMode: "linear",
        },
        {
          id: "tomatoes",
          rawText: "2 adet domates",
          amount: { kind: "exact", value: 2 },
          unit: "piece",
          ingredientText: "domates",
          scaleMode: "linear",
        },
      ],
    };

    render(
      <IngredientList
        recipe={countRecipe}
        targetYield={4}
        measurementSystem="metric"
        messages={enMessages}
      />,
    );

    expect(screen.getByText("4 yumurta")).toBeTruthy();
    expect(screen.getByText("4 domates")).toBeTruthy();
    expect(screen.queryByText(/egg yumurta/i)).toBeNull();
    expect(screen.queryByText(/piece domates/i)).toBeNull();
  });
});
