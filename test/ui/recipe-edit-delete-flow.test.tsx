import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  IncompleteSaveError,
  type RecipeEditPatch,
} from "../../src/application/edit-recipe";
import type { ArchivedRecipeSummary } from "../../src/application/types";
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
    listArchivedRecipes: async () => [],
    loadRecipe: async () => recipe(),
    createRecipe: async () => recipe(),
    duplicateRecipe: async () => recipe(),
    commitConversion: async () => undefined,
    splitOutlineAndConvert: async () => {
      throw new Error("not used in this test");
    },
    resolveCover: async () => null,
    listImageAssets: async () => [],
    saveRecipeMeta: async () => undefined,
    setCoverPath: async () => undefined,
    clearCover: async () => undefined,
    saveRecipeEdit: async () => undefined,
    archiveRecipe: async () => undefined,
    restoreRecipe: async () => undefined,
    deleteArchivedRecipe: async () => undefined,
    openInLogseq: () => undefined,
    close: () => undefined,
    ...overrides,
  };
  return controller;
}

describe("recipe edit/archive flow wiring", () => {
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

  it("reloads the recipe and reports an incomplete save", async () => {
    const saveRecipeEdit = vi
      .fn<(id: string, patch: RecipeEditPatch) => Promise<void>>()
      .mockRejectedValue(new IncompleteSaveError(new Error("write failed")));
    const loadRecipe = vi
      .fn<() => Promise<Recipe | null>>()
      .mockResolvedValue(recipe());
    const controller = baseController({ saveRecipeEdit, loadRecipe });

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

    expect(
      await screen.findByText(`${enMessages.saveIncomplete} write failed`),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: enMessages.editRecipe }),
    ).toBeTruthy();
    expect(loadRecipe).toHaveBeenCalledTimes(2);
  });

  it("keeps the editor open when a save is refused before writing", async () => {
    const saveRecipeEdit = vi
      .fn<(id: string, patch: RecipeEditPatch) => Promise<void>>()
      .mockRejectedValue(
        new Error('A Logseq page named "Soup" already exists.'),
      );
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
      target: { value: "Soup" },
    });
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(
      (screen.getByLabelText(enMessages.title) as HTMLInputElement).value,
    ).toBe("Soup");
  });

  it("resets the target yield to the new base yield after editing it, instead of leaving it at the old ratio", async () => {
    const saveRecipeEdit = vi
      .fn<(id: string, patch: RecipeEditPatch) => Promise<void>>()
      .mockResolvedValue(undefined);
    const loadRecipe = vi
      .fn<() => Promise<Recipe | null>>()
      .mockResolvedValueOnce(recipe()) // initial load: baseYield 8
      .mockResolvedValueOnce({ ...recipe(), baseYield: 16 }); // after edit
    const controller = baseController({ saveRecipeEdit, loadRecipe });

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

    expect(
      (await screen.findByLabelText(enMessages.servings)).getAttribute("value"),
    ).toBe("8");

    fireEvent.click(
      await screen.findByRole("button", { name: enMessages.editRecipe }),
    );
    fireEvent.change(screen.getByLabelText(enMessages.servings), {
      target: { value: "16" },
    });
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    await waitFor(() => {
      expect(saveRecipeEdit).toHaveBeenCalledWith(
        "recipe-1",
        expect.objectContaining({ baseYield: 16 }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText(enMessages.servings).getAttribute("value"),
      ).toBe("16");
    });
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

  it("opens the active recipe root in Logseq", async () => {
    const openInLogseq = vi.fn();
    const controller = baseController({ openInLogseq });

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
      await screen.findByRole("button", { name: enMessages.openInLogseq }),
    );
    expect(openInLogseq).toHaveBeenCalledWith("recipe-1");
  });

  it("archives through the controller and returns to the recipes list", async () => {
    const archiveRecipe = vi
      .fn<(id: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const listRecipes = vi.fn().mockResolvedValue([]);
    const controller = baseController({ archiveRecipe, listRecipes });

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
      await screen.findByRole("button", { name: enMessages.archiveRecipe }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: enMessages.archiveRecipeConfirmAction,
      }),
    );

    await waitFor(() => {
      expect(archiveRecipe).toHaveBeenCalledWith("recipe-1");
    });
    expect(await screen.findByText(enMessages.noRecipes)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      enMessages.archivedNotice,
    );
    // Opened straight into a recipe, so the list was never loaded: fetch it
    // once rather than presenting an unfetched empty list as the graph.
    expect(listRecipes).toHaveBeenCalledTimes(1);
  });

  it("restores an archived recipe locally without rescanning both lists", async () => {
    const archived: ArchivedRecipeSummary = {
      id: "recipe-1",
      title: "Cookie",
      categories: [],
      tags: [],
      ingredientTexts: [],
    };
    const listArchivedRecipes = vi.fn().mockResolvedValue([archived]);
    const listRecipes = vi.fn().mockResolvedValue([]);
    const restoreRecipe = vi.fn().mockResolvedValue(undefined);
    const controller = baseController({
      listArchivedRecipes,
      listRecipes,
      restoreRecipe,
    });

    render(
      <DraftRecipeApp
        controller={controller}
        messages={enMessages}
        config={{
          initialView: { kind: "recipes" },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.archivedRecipes }),
    );
    expect(await screen.findByText("Cookie")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore: Cookie" }));

    await waitFor(() => expect(restoreRecipe).toHaveBeenCalledWith("recipe-1"));
    expect(
      await screen.findByRole("heading", { name: enMessages.recipes }),
    ).toBeTruthy();
    expect(screen.getByText("Cookie")).toBeTruthy();
    expect(listArchivedRecipes).toHaveBeenCalledTimes(1);
    expect(listRecipes).toHaveBeenCalledTimes(1);
  });
});
