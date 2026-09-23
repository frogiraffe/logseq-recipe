import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import { RecipeCard } from "../../src/ui/components/RecipeCard";
import { enMessages, trMessages } from "../../src/ui/i18n";
import { ingredientLine } from "./ingredient-line";

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
      ingredientUnitOverrides={{}}
      onIngredientUnitOverrideChange={() => undefined}
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
    expect(screen.getByText(ingredientLine("120 g butter"))).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.moreServings }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.moreServings }),
    );

    expect(screen.getByText(ingredientLine("240 g butter"))).toBeTruthy();
    expect(screen.getByText(ingredientLine("1 pinch salt"))).toBeTruthy();
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
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
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
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
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
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
        recipe={unsafeRecipe}
        targetYield={2}
        measurementSystem="metric"
        messages={enMessages}
        onTargetYieldChange={() => undefined}
      />,
    );

    expect(screen.queryByRole("link", { name: "Source" })).toBeNull();
  });

  it("renders a non-URL source as plain text instead of hiding it", () => {
    const freeTextRecipe: Recipe = {
      ...recipe,
      sourceUrl: "me myself and i",
    };

    render(
      <RecipeCard
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
        recipe={freeTextRecipe}
        targetYield={2}
        measurementSystem="metric"
        messages={enMessages}
        onTargetYieldChange={() => undefined}
      />,
    );

    expect(screen.queryByRole("link", { name: "Source" })).toBeNull();
    expect(screen.getByText("Source: me myself and i")).toBeTruthy();
  });

  it("shows onboarding guidance and a direct Edit recipe action for a brand new, fully empty recipe", () => {
    const emptyRecipe: Recipe = { ...recipe, ingredients: [], steps: [] };
    const onEditRecipe = vi.fn();
    render(
      <RecipeCard
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
        recipe={emptyRecipe}
        targetYield={emptyRecipe.baseYield}
        measurementSystem="metric"
        messages={enMessages}
        onTargetYieldChange={() => undefined}
        onEditRecipe={onEditRecipe}
      />,
    );

    expect(screen.getByText(enMessages.newRecipeGuidance)).toBeTruthy();
    // Ingredients/Steps stay visible (not hidden) even though empty.
    expect(screen.getByText(enMessages.ingredients)).toBeTruthy();
    expect(screen.getByText(enMessages.steps)).toBeTruthy();

    // Exactly one Edit recipe action - the redundant one in the actions row
    // is suppressed while the onboarding block already offers it.
    const editButtons = screen.getAllByRole("button", {
      name: enMessages.editRecipe,
    });
    expect(editButtons).toHaveLength(1);
    fireEvent.click(editButtons[0]);
    expect(onEditRecipe).toHaveBeenCalledTimes(1);
  });

  it("does not show onboarding guidance once the recipe has ingredients or steps", () => {
    render(<Harness />);
    expect(screen.queryByText(enMessages.newRecipeGuidance)).toBeNull();
  });

  it("does not reserve a giant empty hero region when there is no cover", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector(".draft-recipe-cover")).toBeNull();
    expect(screen.queryByTestId("recipe-cover-placeholder")).toBeNull();
  });

  it("shows the cover hero once a cover URL resolves", () => {
    const { container } = render(
      <RecipeCard
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
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

  it("falls back after a cover fails and retries when the cover changes", () => {
    const props = {
      ingredientUnitOverrides: {},
      onIngredientUnitOverrideChange: () => undefined,
      recipe,
      targetYield: recipe.baseYield,
      measurementSystem: "metric" as const,
      messages: enMessages,
      onTargetYieldChange: () => undefined,
    };
    const { container, rerender } = render(
      <RecipeCard {...props} coverUrl="asset://missing.jpg" />,
    );

    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("recipe-cover-placeholder")).toBeTruthy();

    rerender(<RecipeCard {...props} coverUrl="asset://replacement.jpg" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "asset://replacement.jpg",
    );
  });

  it("requires an explicit confirmation naming the recipe before archiving", () => {
    const onArchiveRecipe = vi.fn();
    render(
      <RecipeCard
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
        recipe={recipe}
        targetYield={recipe.baseYield}
        measurementSystem="metric"
        messages={enMessages}
        onTargetYieldChange={() => undefined}
        onArchiveRecipe={onArchiveRecipe}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.archiveRecipe }),
    );
    expect(screen.getByTestId("archive-confirm")).toBeTruthy();
    expect(screen.getByText(enMessages.archiveRecipeConfirm)).toBeTruthy();
    expect(screen.getAllByText(recipe.title).length).toBeGreaterThan(0);
    expect(onArchiveRecipe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));
    expect(screen.queryByTestId("archive-confirm")).toBeNull();
    expect(onArchiveRecipe).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.archiveRecipe }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: enMessages.archiveRecipeConfirmAction,
      }),
    );
    expect(onArchiveRecipe).toHaveBeenCalledTimes(1);
  });

  it("disables Start Cooking for a recipe with zero steps", () => {
    render(
      <RecipeCard
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
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
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
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

describe("RecipeCard step children", () => {
  it("renders step notes, graph images, and a fallback for missing files", async () => {
    const withMedia: Recipe = {
      ...recipe,
      steps: [
        {
          id: "s-media",
          rawText: "Shape the dough.",
          durations: [],
          temperatures: [],
          heat: [],
          children: [
            { id: "c1", kind: "note", text: "Wet your hands first." },
            {
              id: "c2",
              kind: "image",
              text: "![shape](../assets/shape.png)",
              path: "assets/shape.png",
              alt: "shape",
            },
            {
              id: "c3",
              kind: "audio",
              text: "![tip](../assets/gone.mp3)",
              path: "assets/gone.mp3",
              alt: "tip",
            },
          ],
        },
      ],
    };
    render(
      <RecipeCard
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
        recipe={withMedia}
        targetYield={2}
        measurementSystem="metric"
        messages={enMessages}
        resolveAssetUrl={async (path) =>
          path === "assets/shape.png" ? "assets://graph/shape.png" : null
        }
        onTargetYieldChange={() => undefined}
      />,
    );

    expect(screen.getByText("Wet your hands first.")).toBeTruthy();
    const image = (await screen.findByRole("img", {
      name: "shape",
    })) as HTMLImageElement;
    expect(image.getAttribute("src")).toBe("assets://graph/shape.png");
    expect(
      await screen.findByText(`${enMessages.mediaMissing}: assets/gone.mp3`),
    ).toBeTruthy();
  });
});
