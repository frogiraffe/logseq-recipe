import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  {
    id: "soup",
    title: "Zucchini Soup",
    categories: ["Savory"],
    tags: [],
    prepMinutes: 5,
    cookMinutes: 5,
    ingredientTexts: ["zucchini"],
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

  it("sorts by title by default and re-sorts by total time on request", () => {
    render(
      <RecipesView
        recipes={recipes}
        messages={enMessages}
        onOpen={() => undefined}
      />,
    );
    const titleOf = (index: number) =>
      screen.getAllByRole("button")[index].textContent;

    expect(titleOf(0)).toContain("Chocolate Cookie");
    expect(titleOf(1)).toContain("Roasted Eggplant");
    expect(titleOf(2)).toContain("Zucchini Soup");

    fireEvent.change(screen.getByLabelText(enMessages.sortBy), {
      target: { value: "totalTime" },
    });

    expect(titleOf(0)).toContain("Zucchini Soup");
    expect(titleOf(1)).toContain("Chocolate Cookie");
    expect(titleOf(2)).toContain("Roasted Eggplant");
  });

  it("shows a loading message instead of 'No recipes yet' while the initial fetch is in flight", () => {
    render(
      <RecipesView
        recipes={[]}
        loading
        messages={enMessages}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText(enMessages.loadingRecipes)).toBeTruthy();
    expect(screen.queryByText(enMessages.noRecipes)).toBeNull();
  });

  it("shows 'No recipes yet' once loading has settled on a genuinely empty graph", () => {
    render(
      <RecipesView
        recipes={[]}
        loading={false}
        messages={enMessages}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText(enMessages.noRecipes)).toBeTruthy();
  });

  it("shows a visible filtered-result count that updates as filters narrow the list", () => {
    render(
      <RecipesView
        recipes={recipes}
        messages={enMessages}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText("3 / 3 Recipes")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(enMessages.searchRecipes), {
      target: { value: "cookie" },
    });
    expect(screen.getByText("1 / 3 Recipes")).toBeTruthy();
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

describe("RecipesView cover thumbnails", () => {
  it("shows a card's cover and a letter placeholder when there is none", async () => {
    const resolveCover = vi.fn(async () => "assets://graph/pie.webp");
    const view = render(
      <RecipesView
        recipes={[
          {
            id: "pie",
            title: "Apple Pie",
            categories: [],
            tags: [],
            ingredientTexts: [],
            cover: { kind: "asset-path", value: "assets/pie.webp" },
          },
          {
            id: "soup",
            title: "soup",
            categories: [],
            tags: [],
            ingredientTexts: [],
          },
        ]}
        messages={enMessages}
        resolveCover={resolveCover}
        onOpen={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
        "assets://graph/pie.webp",
      ),
    );
    expect(resolveCover).toHaveBeenCalledTimes(1);
    expect(screen.getByText("S")).toBeTruthy();
  });
});
