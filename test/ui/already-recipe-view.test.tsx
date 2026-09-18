import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import { DraftRecipeApp } from "../../src/ui/app";
import { enMessages } from "../../src/ui/i18n";
import type { DraftRecipeUiController } from "../../src/ui/state";

function recipe(): Recipe {
  return {
    id: "recipe-1",
    title: "Existing Cookie",
    baseYield: 8,
    categories: [],
    tags: [],
    ingredients: [],
    steps: [],
    notes: [],
    schemaVersion: 1,
    ingredientConversionOverrides: [],
  };
}

describe("already-recipe view", () => {
  it("offers to open the existing recipe instead of presenting a confusing conversion flow", async () => {
    const loadRecipe = vi.fn().mockResolvedValue(recipe());
    const controller: DraftRecipeUiController = {
      listRecipes: async () => [],
      loadRecipe,
      createRecipe: async () => recipe(),
      duplicateRecipe: async () => recipe(),
      commitConversion: async () => undefined,
      resolveCover: async () => null,
      listImageAssets: async () => [],
      saveRecipeMeta: async () => undefined,
      setCoverPath: async () => undefined,
      clearCover: async () => undefined,
      saveRecipeEdit: async () => undefined,
      deleteRecipe: async () => undefined,
      close: () => undefined,
    };

    render(
      <DraftRecipeApp
        controller={controller}
        messages={enMessages}
        config={{
          initialView: {
            kind: "already-recipe",
            recipeId: "recipe-1",
            title: "Existing Cookie",
          },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    expect(screen.getByText(enMessages.alreadyRecipe)).toBeTruthy();
    expect(screen.getByText("Existing Cookie")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.openRecipe }),
    );

    expect(loadRecipe).toHaveBeenCalledWith("recipe-1");
    expect(await screen.findByText("Existing Cookie")).toBeTruthy();
  });
});
