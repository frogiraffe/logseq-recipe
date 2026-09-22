import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecipeSummary } from "../../src/application/types";
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
    duplicateRecipe: async () => recipe("Mix."),
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

  it("navigates back to the Recipes view when the open recipe is deleted/recycled externally", async () => {
    const harness = controllerHarness();
    harness.controller.loadRecipe = vi
      .fn<(_: string) => Promise<Recipe | null>>()
      .mockResolvedValueOnce(recipe("Mix."))
      .mockResolvedValueOnce(null);

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

    await screen.findByText("Lifecycle Recipe");

    await act(async () => {
      harness.triggerWatch();
    });

    await waitFor(() => {
      expect(screen.queryByText("Lifecycle Recipe")).toBeNull();
    });
    expect(
      screen.getByRole("button", { name: enMessages.createRecipe }),
    ).toBeTruthy();
  });

  it("does not let an out-of-order stale load overwrite a newer one", async () => {
    const harness = controllerHarness();
    let resolveSlow: ((value: Recipe | null) => void) | undefined;
    let calls = 0;
    harness.controller.loadRecipe = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return recipe("Mix."); // initial mount load
      if (calls === 2) {
        // first watch trigger: slow - resolved manually, later
        return new Promise<Recipe | null>((resolve) => {
          resolveSlow = resolve;
        });
      }
      return recipe("Second, faster load."); // second watch trigger: fast
    });

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

    await screen.findByText("Mix.");

    // The slow load starts (watcher fires), then a second, faster load
    // starts before the slow one resolves.
    await act(async () => {
      harness.triggerWatch();
      harness.triggerWatch();
    });
    await waitFor(() => {
      expect(screen.getByText("Second, faster load.")).toBeTruthy();
    });

    // The slow first load finally resolves - it must not clobber the newer state.
    await act(async () => {
      resolveSlow?.(recipe("First, slower load - should be discarded."));
    });

    expect(screen.getByText("Second, faster load.")).toBeTruthy();
    expect(
      screen.queryByText("First, slower load - should be discarded."),
    ).toBeNull();
  });

  it("ignores a second Delete click while the first delete is still in flight", async () => {
    const harness = controllerHarness();
    let resolveDelete: (() => void) | undefined;
    const deleteRecipe = vi.fn<() => Promise<void>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve as () => void;
        }),
    );
    harness.controller.deleteRecipe = deleteRecipe;

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

    await screen.findByText("Lifecycle Recipe");
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.deleteRecipe }),
    );
    const confirmButton = await screen.findByRole("button", {
      name: enMessages.deleteRecipeConfirmAction,
    });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(deleteRecipe).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete?.();
    });
  });

  it("exposes dialog semantics and moves focus into the shell on open", async () => {
    const harness = controllerHarness();
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    const { unmount } = render(
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

    const shell = await screen.findByRole("dialog");
    expect(shell.getAttribute("aria-modal")).toBe("true");
    await waitFor(() => {
      expect(document.activeElement).toBe(shell);
    });

    unmount();
    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
  });

  it("preserves a per-ingredient display-unit choice when entering Cooking Mode", async () => {
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

    await screen.findByText("100 g flour");
    fireEvent.change(
      screen.getByLabelText(`flour ${enMessages.measurementSystem}`),
      { target: { value: "kg" } },
    );
    expect(screen.getByText("0.1 kg flour")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.startCooking }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );

    expect(screen.getByText("0.1 kg flour")).toBeTruthy();
  });

  it("refreshes the Recipes browser on demand via an explicit Refresh control", async () => {
    const harness = controllerHarness();
    const listRecipes = vi.fn().mockResolvedValue([]);
    harness.controller.listRecipes = listRecipes;

    render(
      <DraftRecipeApp
        controller={harness.controller}
        messages={enMessages}
        config={{
          initialView: { kind: "recipes" },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    await waitFor(() => expect(listRecipes).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: enMessages.refresh }));

    await waitFor(() => expect(listRecipes).toHaveBeenCalledTimes(2));
  });

  it("guards the global Close button behind the same confirmation as Edit recipe's own Cancel", async () => {
    const harness = controllerHarness();
    const closeSpy = vi.fn();
    harness.controller.close = closeSpy;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

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

    fireEvent.click(
      await screen.findByRole("button", { name: enMessages.editRecipe }),
    );
    fireEvent.change(screen.getByLabelText(enMessages.title), {
      target: { value: "Changed title" },
    });

    // Not the form's own Cancel button - the shell's persistent global
    // Close button, which has no direct view into the form's state.
    fireEvent.click(screen.getByRole("button", { name: enMessages.close }));

    expect(confirmSpy).toHaveBeenCalledWith(enMessages.discardChangesConfirm);
    expect(closeSpy).not.toHaveBeenCalled();
    // Declining the confirmation must leave the edit in place, not discard it.
    expect(
      (screen.getByLabelText(enMessages.title) as HTMLInputElement).value,
    ).toBe("Changed title");

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: enMessages.close }));
    expect(closeSpy).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it("closes immediately with no confirmation when the open form has no unsaved changes", async () => {
    const harness = controllerHarness();
    const closeSpy = vi.fn();
    harness.controller.close = closeSpy;
    const confirmSpy = vi.spyOn(window, "confirm");

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

    fireEvent.click(
      await screen.findByRole("button", { name: enMessages.editRecipe }),
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.close }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it("shows a loading message instead of 'No recipes yet' while the initial list fetch is in flight", async () => {
    const harness = controllerHarness();
    let resolveList!: (recipes: RecipeSummary[]) => void;
    harness.controller.listRecipes = () =>
      new Promise((resolve) => {
        resolveList = resolve;
      });

    render(
      <DraftRecipeApp
        controller={harness.controller}
        messages={enMessages}
        config={{
          initialView: { kind: "recipes" },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    expect(screen.getByText(enMessages.loadingRecipes)).toBeTruthy();
    expect(screen.queryByText(enMessages.noRecipes)).toBeNull();

    await act(async () => {
      resolveList([]);
    });

    expect(screen.getByText(enMessages.noRecipes)).toBeTruthy();
    expect(screen.queryByText(enMessages.loadingRecipes)).toBeNull();
  });

  it("shows a loading message instead of the Recipes browser while a directly-opened recipe is still loading", async () => {
    const harness = controllerHarness();
    let resolveRecipe!: (recipe: Recipe | null) => void;
    harness.controller.loadRecipe = () =>
      new Promise((resolve) => {
        resolveRecipe = resolve;
      });

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

    expect(screen.getByText(enMessages.loadingRecipe)).toBeTruthy();
    expect(screen.queryByText(enMessages.createRecipe)).toBeNull();
    expect(screen.queryByText(enMessages.noRecipes)).toBeNull();

    await act(async () => {
      resolveRecipe(recipe("Mix."));
    });

    expect(screen.getByText("Lifecycle Recipe")).toBeTruthy();
    expect(screen.queryByText(enMessages.loadingRecipe)).toBeNull();
  });

  it("disables Recipe settings while its asset/list fetch is in flight, like every other exclusive action", async () => {
    const harness = controllerHarness();
    let resolveAssets!: (assets: string[]) => void;
    harness.controller.listImageAssets = () =>
      new Promise((resolve) => {
        resolveAssets = resolve;
      });

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

    const settingsButton = await screen.findByRole("button", {
      name: enMessages.editRecipeSettings,
    });
    fireEvent.click(settingsButton);

    expect(
      (
        screen.getByRole("button", {
          name: enMessages.editRecipe,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await act(async () => {
      resolveAssets([]);
    });

    expect(screen.getByLabelText(enMessages.category)).toBeTruthy();
  });
});
