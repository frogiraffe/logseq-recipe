import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import { RecipeCard } from "../../src/ui/components/RecipeCard";
import { enMessages, trMessages } from "../../src/ui/i18n";

const recipe: Recipe = {
  id: "r1",
  title: "Cookie",
  baseYield: 2,
  yieldUnit: "cookies",
  categories: ["Dessert"],
  tags: ["Chocolate"],
  ingredients: [
    {
      id: "i1",
      rawText: "120 g butter",
      amount: { kind: "exact", value: 120 },
      unit: "g",
      ingredientText: "butter",
      scaleMode: "linear",
    },
    {
      id: "i2",
      rawText: "1 pinch salt",
      amount: { kind: "exact", value: 1 },
      unit: "pinch",
      ingredientText: "salt",
      scaleMode: "fixed",
    },
  ],
  steps: [],
  notes: [],
  schemaVersion: 1,
  ingredientConversionOverrides: [],
};

function Harness() {
  const [targetYield, setTargetYield] = useState(recipe.baseYield);
  return (
    <RecipeCard
      recipe={recipe}
      targetYield={targetYield}
      measurementSystem="metric"
      messages={enMessages}
      onTargetYieldChange={setTargetYield}
    />
  );
}

describe("RecipeCard", () => {
  it("scales from canonical amounts without mutating source recipe text", () => {
    render(<Harness />);
    expect(screen.getByText("120 g butter")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));

    expect(screen.getByText("240 g butter")).toBeTruthy();
    expect(screen.getByText("1 pinch salt")).toBeTruthy();
    expect(recipe.ingredients[0].rawText).toBe("120 g butter");
    expect(recipe.ingredients[0].amount).toEqual({ kind: "exact", value: 120 });
  });

  it("renders user-facing recipe metadata already stored in the domain model", () => {
    const metadataRecipe: Recipe = {
      ...recipe,
      prepMinutes: 15,
      chillMinutes: 30,
      cookMinutes: 12,
      categories: ["Dessert"],
      tags: ["Chocolate", "Quick"],
      sourceUrl: "https://example.com/cookie",
    };

    render(
      <RecipeCard
        recipe={metadataRecipe}
        targetYield={2}
        measurementSystem="metric"
        messages={enMessages}
        onTargetYieldChange={() => undefined}
      />,
    );

    expect(screen.getByText("Prep time: 15 min")).toBeTruthy();
    expect(screen.getByText("Chill / rest: 30 min")).toBeTruthy();
    expect(screen.getByText("Cook time: 12 min")).toBeTruthy();
    expect(screen.getByText("Total time: 57 min")).toBeTruthy();
    expect(screen.getByText("cookies")).toBeTruthy();
    expect(screen.getByText("Dessert")).toBeTruthy();
    expect(screen.getByText("Chocolate")).toBeTruthy();
    expect(screen.getByText("Quick")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Source" }).getAttribute("href"),
    ).toBe("https://example.com/cookie");
  });

  it("translates the minutes unit instead of hardcoding English", () => {
    const metadataRecipe: Recipe = { ...recipe, prepMinutes: 15 };

    render(
      <RecipeCard
        recipe={metadataRecipe}
        targetYield={2}
        measurementSystem="metric"
        messages={trMessages}
        onTargetYieldChange={() => undefined}
      />,
    );

    expect(screen.getByText(`${trMessages.prepTime}: 15 dk`)).toBeTruthy();
  });

  it("does not render an unsafe source URL as a clickable link", () => {
    const unsafeRecipe: Recipe = {
      ...recipe,
      sourceUrl: "javascript:alert(1)",
    };

    render(
      <RecipeCard
        recipe={unsafeRecipe}
        targetYield={2}
        measurementSystem="metric"
        messages={enMessages}
        onTargetYieldChange={() => undefined}
      />,
    );

    expect(screen.queryByRole("link", { name: "Source" })).toBeNull();
  });

  it("does not reserve a giant empty hero region when there is no cover", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector(".draft-recipe-cover")).toBeNull();
    expect(screen.queryByTestId("recipe-cover-placeholder")).toBeNull();
  });

  it("shows the cover hero once a cover URL resolves", () => {
    const { container } = render(
      <RecipeCard
        recipe={recipe}
        targetYield={recipe.baseYield}
        measurementSystem="metric"
        messages={enMessages}
        coverUrl="asset://cover.jpg"
        onTargetYieldChange={() => undefined}
      />,
    );
    expect(container.querySelector(".draft-recipe-cover img")).toHaveProperty(
      "src",
      "asset://cover.jpg",
    );
  });

  it("requires an explicit confirmation naming the recipe before deleting", () => {
    const onDeleteRecipe = vi.fn();
    render(
      <RecipeCard
        recipe={recipe}
        targetYield={recipe.baseYield}
        measurementSystem="metric"
        messages={enMessages}
        onTargetYieldChange={() => undefined}
        onDeleteRecipe={onDeleteRecipe}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.deleteRecipe }),
    );
    expect(screen.getByTestId("delete-confirm")).toBeTruthy();
    expect(screen.getAllByText(recipe.title).length).toBeGreaterThan(0);
    expect(onDeleteRecipe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));
    expect(screen.queryByTestId("delete-confirm")).toBeNull();
    expect(onDeleteRecipe).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.deleteRecipe }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: enMessages.deleteRecipeConfirmAction,
      }),
    );
    expect(onDeleteRecipe).toHaveBeenCalledTimes(1);
  });

  it("disables Start Cooking for a recipe with zero steps", () => {
    render(
      <RecipeCard
        recipe={recipe}
        targetYield={recipe.baseYield}
        measurementSystem="metric"
        messages={enMessages}
        onTargetYieldChange={() => undefined}
        onStartCooking={() => undefined}
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: enMessages.startCooking,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("enables Start Cooking once the recipe has at least one step", () => {
    const recipeWithStep: Recipe = {
      ...recipe,
      steps: [
        {
          id: "s1",
          rawText: "Mix well.",
          durations: [],
          temperatures: [],
          heat: [],
        },
      ],
    };

    render(
      <RecipeCard
        recipe={recipeWithStep}
        targetYield={recipeWithStep.baseYield}
        measurementSystem="metric"
        messages={enMessages}
        onTargetYieldChange={() => undefined}
        onStartCooking={() => undefined}
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: enMessages.startCooking,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
