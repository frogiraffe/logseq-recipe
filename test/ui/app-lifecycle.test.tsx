import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import { DraftRecipeApp } from "../../src/ui/app";
import { enMessages } from "../../src/ui/i18n";
import type {
  DraftRecipeAppConfig,
  DraftRecipeUiController,
} from "../../src/ui/state";

function recipe(stepText: string): Recipe {
  return {
    id: "recipe-1",
    title: "Lifecycle Recipe",
    baseYield: 2,
    categories: [],
    tags: [],
    ingredients: [
      {
        id: "ingredient-1",
        rawText: "100 g flour",
        amount: { kind: "exact", value: 100 },
        unit: "g",
        ingredientText: "flour",
        scaleMode: "linear",
      },
    ],
    steps: [
      {
        id: "step-1",
        rawText: stepText,
        durations: [],
        temperatures: [],
        heat: [],
      },
    ],
    notes: [],
    schemaVersion: 1,
    ingredientConversionOverrides: [],
  };
}

function controllerHarness() {
  let watchListener: (() => void) | null = null;
  const loadRecipe = vi
    .fn<(_: string) => Promise<Recipe | null>>()
    .mockResolvedValueOnce(recipe("Mix."))
    .mockResolvedValue(recipe("Mix thoroughly."));

  const controller: DraftRecipeUiController = {
    listRecipes: async () => [],
    loadRecipe,
    createRecipe: async () => recipe("Mix."),
    commitConversion: async () => undefined,
    resolveCover: async () => null,
    listImageAssets: async () => [],
    saveRecipeMeta: async () => undefined,
    setCoverPath: async () => undefined,
    clearCover: async () => undefined,
    saveRecipeEdit: async () => undefined,
    deleteRecipe: async () => undefined,
    watchRecipe: (_id, listener) => {
      watchListener = listener;
      return () => {
        watchListener = null;
      };
    },
    close: () => undefined,
  };

  return {
    controller,
    triggerWatch() {
      watchListener?.();
    },
  };
}

describe("DraftRecipeApp recipe refresh lifecycle", () => {
  it("marks the app shell with the runtime theme mode", () => {
    const harness = controllerHarness();
    const config = {
      initialView: { kind: "create" },
      globalMeasurementSystem: "metric",
      defaultParserLocale: "en",
      defaultSourceMeasurementSystem: "us",
      themeMode: "dark",
    } as DraftRecipeAppConfig & { themeMode: "dark" };

    const { container } = render(
      <DraftRecipeApp
        controller={harness.controller}
        messages={enMessages}
        config={config}
      />,
    );

    expect(
      container
        .querySelector(".draft-recipe-app")
        ?.getAttribute("data-theme-mode"),
    ).toBe("dark");
  });

  it("applies resolved host theme tokens to the app shell", () => {
    const harness = controllerHarness();
    const config = {
      initialView: { kind: "create" },
      globalMeasurementSystem: "metric",
      defaultParserLocale: "en",
      defaultSourceMeasurementSystem: "us",
      themeMode: "dark",
      themeCssProperties: {
        "--ls-primary-background-color": "rgb(12, 13, 14)",
        "--ls-primary-text-color": "rgb(240, 241, 242)",
      },
    } as DraftRecipeAppConfig & {
      themeMode: "dark";
      themeCssProperties: Record<string, string>;
    };

    const { container } = render(
      <DraftRecipeApp
        controller={harness.controller}
        messages={enMessages}
        config={config}
      />,
    );

    const shell = container.querySelector(".draft-recipe-app") as HTMLElement;
    expect(shell.style.getPropertyValue("--ls-primary-background-color")).toBe(
      "rgb(12, 13, 14)",
    );
    expect(shell.style.getPropertyValue("--ls-primary-text-color")).toBe(
      "rgb(240, 241, 242)",
    );
  });

  it("refreshes recipe data without leaving Cooking Mode", async () => {
    const harness = controllerHarness();
    render(
      <DraftRecipeApp
        controller={harness.controller}
        messages={enMessages}
        config={{
          initialView: { kind: "recipe", recipeId: "recipe-1" },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    const start = await screen.findByRole("button", {
      name: enMessages.startCooking,
    });
    fireEvent.click(start);
    expect(screen.getByText("Mix.")).toBeTruthy();

    await act(async () => {
      harness.triggerWatch();
    });

    await waitFor(() => {
      expect(screen.getByText("Mix thoroughly.")).toBeTruthy();
    });
    expect(
      screen.queryByRole("button", { name: enMessages.startCooking }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: enMessages.previous }),
    ).toBeTruthy();
  });
});
