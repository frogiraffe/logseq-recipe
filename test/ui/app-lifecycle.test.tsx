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
import { ingredientLine } from "./ingredient-line";

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
    listArchivedRecipes: async () => [],
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
    archiveRecipe: async () => undefined,
    restoreRecipe: async () => undefined,
    deleteArchivedRecipe: async () => undefined,
    openInLogseq: () => undefined,
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
    isWatching() {
      return watchListener !== null;
    },
    triggerWatch() {
      if (!watchListener) throw new Error("Recipe watcher is not active");
      watchListener();
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
    await waitFor(() => expect(harness.isWatching()).toBe(true));

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
    await waitFor(() => expect(harness.isWatching()).toBe(true));

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
    await waitFor(() => expect(harness.isWatching()).toBe(true));

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

  it.each(["edit", "settings"] as const)(
    "closes %s after a successful save when a watcher supersedes its refresh",
    async (mode) => {
      const harness = controllerHarness();
      let resolveSaveLoad!: (value: Recipe | null) => void;
      const loadRecipe = vi
        .fn<(_: string) => Promise<Recipe | null>>()
        .mockResolvedValueOnce(recipe("Mix."))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSaveLoad = resolve;
            }),
        )
        .mockResolvedValueOnce({
          ...recipe("Latest from watcher."),
          baseYield: mode === "edit" ? 4 : 2,
        });
      harness.controller.loadRecipe = loadRecipe;
      const saveRecipeEdit = vi.fn().mockResolvedValue(undefined);
      const saveRecipeMeta = vi.fn().mockResolvedValue(undefined);
      harness.controller.saveRecipeEdit = saveRecipeEdit;
      harness.controller.saveRecipeMeta = saveRecipeMeta;

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
      await waitFor(() => expect(harness.isWatching()).toBe(true));
      fireEvent.click(
        screen.getByRole("button", {
          name:
            mode === "edit"
              ? enMessages.editRecipe
              : enMessages.editRecipeSettings,
        }),
      );
      if (mode === "edit") {
        fireEvent.change(await screen.findByLabelText(enMessages.servings), {
          target: { value: "4" },
        });
      }
      fireEvent.click(
        await screen.findByRole("button", { name: enMessages.save }),
      );
      await waitFor(() => expect(loadRecipe).toHaveBeenCalledTimes(2));
      expect(
        mode === "edit" ? saveRecipeEdit : saveRecipeMeta,
      ).toHaveBeenCalledOnce();

      await act(async () => harness.triggerWatch());
      await waitFor(() => expect(loadRecipe).toHaveBeenCalledTimes(3));
      await act(async () => resolveSaveLoad(recipe("Stale save refresh.")));

      expect(
        screen.getByRole("button", { name: enMessages.startCooking }),
      ).toBeTruthy();
      expect(screen.getByText("Latest from watcher.")).toBeTruthy();
      expect(screen.queryByText("Stale save refresh.")).toBeNull();
      if (mode === "edit") {
        expect(
          screen.getByLabelText(enMessages.servings).getAttribute("value"),
        ).toBe("4");
      }
    },
  );

  it.each(["edit", "settings"] as const)(
    "keeps %s open when saving is rejected",
    async (mode) => {
      const harness = controllerHarness();
      harness.controller.saveRecipeEdit = vi
        .fn()
        .mockRejectedValue(new Error("Write failed"));
      harness.controller.saveRecipeMeta = vi
        .fn()
        .mockRejectedValue(new Error("Write failed"));
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
        screen.getByRole("button", {
          name:
            mode === "edit"
              ? enMessages.editRecipe
              : enMessages.editRecipeSettings,
        }),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: enMessages.save }),
      );

      expect(await screen.findByText("Write failed")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: enMessages.save }),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: enMessages.startCooking }),
      ).toBeNull();
    },
  );

  it.each(["edit", "settings"] as const)(
    "guards later actions until the %s save refresh settles",
    async (mode) => {
      const harness = controllerHarness();
      let resolveSaveLoad!: (value: Recipe | null) => void;
      harness.controller.loadRecipe = vi
        .fn<(_: string) => Promise<Recipe | null>>()
        .mockResolvedValueOnce(recipe("Mix."))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSaveLoad = resolve;
            }),
        );
      const copy = { ...recipe("Copied."), id: "recipe-2", title: "Copy" };
      const duplicateRecipe = vi.fn().mockResolvedValue(copy);
      harness.controller.duplicateRecipe = duplicateRecipe;

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
        screen.getByRole("button", {
          name:
            mode === "edit"
              ? enMessages.editRecipe
              : enMessages.editRecipeSettings,
        }),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: enMessages.save }),
      );
      const duplicate = await screen.findByRole("button", {
        name: enMessages.duplicateRecipe,
      });
      const edit = screen.getByRole("button", { name: enMessages.editRecipe });

      expect((duplicate as HTMLButtonElement).disabled).toBe(true);
      expect((edit as HTMLButtonElement).disabled).toBe(true);
      expect(duplicateRecipe).not.toHaveBeenCalled();

      await act(async () => resolveSaveLoad(recipe("Saved.")));
      await waitFor(() =>
        expect((duplicate as HTMLButtonElement).disabled).toBe(false),
      );
      fireEvent.click(duplicate);
      expect(duplicateRecipe).toHaveBeenCalledWith("recipe-1");
      expect(await screen.findByText("Copy")).toBeTruthy();
      expect(screen.getByText("Copied.")).toBeTruthy();
      expect(screen.queryByText("Saved.")).toBeNull();
    },
  );

  it("ignores a second Archive click while the first archive is still in flight", async () => {
    const harness = controllerHarness();
    let resolveArchive: (() => void) | undefined;
    const archiveRecipe = vi.fn<() => Promise<void>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveArchive = resolve as () => void;
        }),
    );
    harness.controller.archiveRecipe = archiveRecipe;

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
      screen.getByRole("button", { name: enMessages.archiveRecipe }),
    );
    const confirmButton = await screen.findByRole("button", {
      name: enMessages.archiveRecipeConfirmAction,
    });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(archiveRecipe).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveArchive?.();
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

    await screen.findByText(ingredientLine("100 g flour"));
    fireEvent.change(
      screen.getByLabelText(`flour ${enMessages.measurementSystem}`),
      { target: { value: "kg" } },
    );
    expect(screen.getByText(ingredientLine("0.1 kg flour"))).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.startCooking }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );

    expect(screen.getByText(ingredientLine("0.1 kg flour"))).toBeTruthy();
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
