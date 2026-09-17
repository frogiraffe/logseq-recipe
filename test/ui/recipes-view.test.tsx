import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecipeSummary } from "../../src/application/types";
import { RecipesView } from "../../src/ui/components/RecipesView";
import { enMessages } from "../../src/ui/i18n";

const recipes: RecipeSummary[] = [
  {
    id: "cookie",
    title: "Chocolate Cookie",
    categories: ["Dessert"],
    tags: ["Chocolate"],
    prepMinutes: 15,
    cookMinutes: 12,
    ingredientTexts: ["butter", "chocolate", "flour"],
  },
  {
    id: "eggplant",
    title: "Roasted Eggplant",
    categories: ["Savory"],
    tags: ["Vegetable"],
    prepMinutes: 10,
    cookMinutes: 30,
    ingredientTexts: ["eggplant", "olive oil"],
  },
];

describe("RecipesView", () => {
  it("filters by title and structured ingredient text", () => {
    render(
      <RecipesView
        recipes={recipes}
        messages={enMessages}
        onOpen={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText(enMessages.searchRecipes), {
      target: { value: "cookie" },
    });
    expect(screen.getByText("Chocolate Cookie")).toBeTruthy();
    expect(screen.queryByText("Roasted Eggplant")).toBeNull();

    fireEvent.change(screen.getByLabelText(enMessages.searchRecipes), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText(enMessages.containsIngredient), {
      target: { value: "eggplant" },
    });
    expect(screen.getByText("Roasted Eggplant")).toBeTruthy();
    expect(screen.queryByText("Chocolate Cookie")).toBeNull();
  });

  it("visually distinguishes categories from tags in the recipe list", () => {
    const { container } = render(
      <RecipesView
        recipes={recipes}
        messages={enMessages}
        onOpen={() => undefined}
      />,
    );
    expect(
      container.querySelector(".draft-recipe-category-chip"),
    ).not.toBeNull();
    expect(container.querySelector(".draft-recipe-tag-chip")).not.toBeNull();
  });

  it("opens the selected recipe", () => {
    const onOpen = vi.fn();
    render(
      <RecipesView recipes={recipes} messages={enMessages} onOpen={onOpen} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Chocolate Cookie\b/ }),
    );
    expect(onOpen).toHaveBeenCalledWith("cookie");
  });
});
