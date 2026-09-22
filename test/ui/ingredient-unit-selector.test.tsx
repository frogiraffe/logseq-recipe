import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../../src/domain/unit";
import { IngredientList } from "../../src/ui/components/IngredientList";
import { enMessages } from "../../src/ui/i18n";

function Harness({
  recipe,
  targetYield,
  measurementSystem = "metric",
}: {
  recipe: Recipe;
  targetYield: number;
  measurementSystem?: MeasurementSystem;
}) {
  const [unitOverrides, setUnitOverrides] = useState<
    Record<string, CanonicalUnit>
  >({});
  return (
    <IngredientList
      recipe={recipe}
      targetYield={targetYield}
      measurementSystem={measurementSystem}
      messages={enMessages}
      unitOverrides={unitOverrides}
      onUnitOverrideChange={(id, unit) =>
        setUnitOverrides((current) => {
          if (!unit) {
            const next = { ...current };
            delete next[id];
            return next;
          }
          return { ...current, [id]: unit };
        })
      }
    />
  );
}

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
    render(<Harness recipe={recipe} targetYield={1} />);

    const select = screen.getByLabelText(
      `butter ${enMessages.measurementSystem}`,
    );
    fireEvent.change(select, { target: { value: "tbsp_us" } });

    expect(screen.getByText("1 tbsp butter")).toBeTruthy();
    expect(recipe.ingredients[0].rawText).toBe("14.2 g butter");
    expect(recipe.ingredients[0].unit).toBe("g");
  });

  it("keeps egg self-naming while giving generic piece its own pluralized label", () => {
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

    render(<Harness recipe={countRecipe} targetYield={4} />);

    // egg's own word is already in ingredientText ("yumurta") - no separate
    // unit label, and never duplicated.
    expect(screen.getByText("4 yumurta")).toBeTruthy();
    expect(screen.queryByText(/egg yumurta/i)).toBeNull();
    // generic piece has no such self-naming word to fall back on - its
    // label must survive (pluralized for count 4), or "pieces" is lost
    // entirely rather than merely deduplicated.
    expect(screen.getByText("4 pieces domates")).toBeTruthy();
  });
});
