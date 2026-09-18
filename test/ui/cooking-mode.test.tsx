import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import { CookingMode } from "../../src/ui/components/CookingMode";
import { enMessages } from "../../src/ui/i18n";

const recipe: Recipe = {
  id: "r1",
  title: "Pan Recipe",
  baseYield: 2,
  yieldUnit: "servings",
  categories: [],
  tags: [],
  ingredients: [
    {
      id: "i1",
      rawText: "100 g flour",
      amount: { kind: "exact", value: 100 },
      unit: "g",
      ingredientText: "flour",
      scaleMode: "linear",
    },
  ],
  steps: [
    {
      id: "s1",
      rawText: "Cook over medium heat for 5 minutes.",
      durations: [
        {
          kind: "duration",
          value: { kind: "exact", value: 5 },
          unit: "minute",
          rawText: "5 minutes",
          startOffset: 26,
          endOffset: 35,
        },
      ],
      temperatures: [],
      heat: [
        {
          kind: "heat",
          level: "medium",
          rawText: "medium heat",
          startOffset: 10,
          endOffset: 21,
        },
      ],
    },
    {
      id: "s2",
      rawText: "Bake in a preheated fan oven at 180°C for 10-12 minutes.",
      durations: [
        {
          kind: "duration",
          value: { kind: "range", min: 10, max: 12 },
          unit: "minute",
          rawText: "10-12 minutes",
          startOffset: 44,
          endOffset: 57,
        },
      ],
      temperatures: [
        {
          kind: "temperature",
          value: 180,
          unit: "celsius",
          ovenMode: "fan",
          preheat: true,
          rawText: "180°C",
          startOffset: 35,
          endOffset: 40,
        },
      ],
      heat: [],
    },
  ],
  notes: [],
  schemaVersion: 1,
  ingredientConversionOverrides: [],
};

function cookingMode(
  currentRecipe: Recipe,
  onExit: () => void = () => undefined,
) {
  return (
    <CookingMode
      recipe={currentRecipe}
      targetYield={2}
      measurementSystem="metric"
      messages={enMessages}
      onExit={onExit}
    />
  );
}

describe("CookingMode", () => {
  it("navigates step boundaries and keeps qualitative heat non-numeric", () => {
    render(cookingMode(recipe));

    expect(
      screen.getByText("Cook over medium heat for 5 minutes."),
    ).toBeTruthy();
    expect(screen.getByText("medium heat")).toBeTruthy();
    expect(screen.queryByText(/medium heat.*°/i)).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: enMessages.previous,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: enMessages.next }));
    expect(
      screen.getByText(
        "Bake in a preheated fan oven at 180°C for 10-12 minutes.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Fan · 180 °C · Preheated")).toBeTruthy();
    expect(screen.getByText("10–12 min")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: enMessages.next,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("supports keyboard navigation and Escape", () => {
    const onExit = vi.fn();
    render(cookingMode(recipe, onExit));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      screen.getByText(
        "Bake in a preheated fan oven at 180°C for 10-12 minutes.",
      ),
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(
      screen.getByText("Cook over medium heat for 5 minutes."),
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("shows scaled ingredients in the drawer", () => {
    render(
      <CookingMode
        recipe={recipe}
        targetYield={4}
        measurementSystem="metric"
        messages={enMessages}
        onExit={() => undefined}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );
    expect(screen.getByText("200 g flour")).toBeTruthy();
  });

  it("lets the cook check off ingredients as they're used", () => {
    render(
      <CookingMode
        recipe={recipe}
        targetYield={2}
        measurementSystem="metric"
        messages={enMessages}
        onExit={() => undefined}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );

    const checkbox = screen.getByRole("checkbox", { name: /flour/i });
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(checkbox.closest("label")?.className).toContain(
      "draft-recipe-ingredient-checked",
    );

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it("renders the resolved cover when cooking mode receives one", () => {
    render(
      <CookingMode
        recipe={recipe}
        targetYield={2}
        measurementSystem="metric"
        messages={enMessages}
        coverUrl="file:///graph/assets/pan.jpg"
        onExit={() => undefined}
      />,
    );
    const cover = screen.getByTestId("cooking-cover");
    expect(cover.querySelector("img")?.getAttribute("src")).toBe(
      "file:///graph/assets/pan.jpg",
    );
  });

  it("shows recipe notes in a boxed section, and hides it when there are none", () => {
    const { rerender } = render(cookingMode(recipe));
    expect(screen.queryByText(enMessages.notes)).toBeNull();

    const withNotes: Recipe = {
      ...recipe,
      notes: [{ id: "n1", text: "Centers stay soft, that is fine." }],
    };
    rerender(cookingMode(withNotes));
    expect(screen.getByText(enMessages.notes)).toBeTruthy();
    expect(screen.getByText("Centers stay soft, that is fine.")).toBeTruthy();
  });

  it("clamps the active step when a live recipe refresh removes later steps", () => {
    const rendered = render(cookingMode(recipe));
    fireEvent.click(screen.getByRole("button", { name: enMessages.next }));
    expect(
      screen.getByText(
        "Bake in a preheated fan oven at 180°C for 10-12 minutes.",
      ),
    ).toBeTruthy();

    const shortened: Recipe = { ...recipe, steps: recipe.steps.slice(0, 1) };
    rendered.rerender(cookingMode(shortened));

    expect(
      screen.getByText("Cook over medium heat for 5 minutes."),
    ).toBeTruthy();
    expect(screen.getByText("1 / 1")).toBeTruthy();
  });
});
