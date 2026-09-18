import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecipeEditPatch } from "../../src/application/edit-recipe";
import type { Recipe } from "../../src/domain/recipe";
import { DraftRecipeApp } from "../../src/ui/app";
import { enMessages } from "../../src/ui/i18n";
import type { DraftRecipeUiController } from "../../src/ui/state";

function recipe(): Recipe {
  return {
    id: "recipe-1",
    title: "Cookie",
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

function baseController(overrides: Partial<DraftRecipeUiController> = {}) {
  const controller: DraftRecipeUiController = {
    listRecipes: async () => [],
    loadRecipe: async () => recipe(),
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
    ...overrides,
  };
  return controller;
}

describe("recipe edit/delete flow wiring", () => {
  it("saves an edit through the controller and returns to the recipe view", async () => {
    const saveRecipeEdit = vi
      .fn<(id: string, patch: RecipeEditPatch) => Promise<void>>()
      .mockResolvedValue(undefined);
    const controller = baseController({ saveRecipeEdit });

    render(
      <DraftRecipeApp
        controller={controller}
        messages={enMessages}
        config={{
          initialView: { kind: "recipe", recipeId: "recipe-1" },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: enMessages.editRecipe }),
    );
    fireEvent.change(screen.getByLabelText(enMessages.title), {
      target: { value: "New Title" },
    });
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    await waitFor(() => {
      expect(saveRecipeEdit).toHaveBeenCalledWith(
        "recipe-1",
        expect.objectContaining({ title: "New Title" }),
      );
    });
    expect(
      await screen.findByRole("button", { name: enMessages.editRecipe }),
    ).toBeTruthy();
  });

  it("duplicates through the controller and opens the copy", async () => {
    const duplicated: Recipe = {
      ...recipe(),
      id: "recipe-2",
      title: "Cookie (copy)",
    };
    const duplicateRecipe = vi
      .fn<(id: string) => Promise<Recipe>>()
      .mockResolvedValue(duplicated);
    const controller = baseController({ duplicateRecipe });

    render(
      <DraftRecipeApp
        controller={controller}
        messages={enMessages}
        config={{
          initialView: { kind: "recipe", recipeId: "recipe-1" },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: enMessages.duplicateRecipe }),
    );

    await waitFor(() => {
      expect(duplicateRecipe).toHaveBeenCalledWith("recipe-1");
    });
    expect(await screen.findByText("Cookie (copy)")).toBeTruthy();
  });

  it("deletes through the controller and returns to the recipes list", async () => {
    const deleteRecipe = vi
      .fn<(id: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const listRecipes = vi.fn().mockResolvedValue([]);
    const controller = baseController({ deleteRecipe, listRecipes });

    render(
      <DraftRecipeApp
        controller={controller}
        messages={enMessages}
        config={{
          initialView: { kind: "recipe", recipeId: "recipe-1" },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: enMessages.deleteRecipe }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: enMessages.deleteRecipeConfirmAction,
      }),
    );

    await waitFor(() => {
      expect(deleteRecipe).toHaveBeenCalledWith("recipe-1");
    });
    expect(await screen.findByText(enMessages.noRecipes)).toBeTruthy();
  });
});
