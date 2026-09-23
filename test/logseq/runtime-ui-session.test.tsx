import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeCapabilities } from "../../src/logseq/capabilities";
import type { DraftRecipeInitialView } from "../../src/ui/state";

const runtimeContext = vi.hoisted(() => vi.fn());
vi.mock("../../src/logseq/ui-controller", () => ({
  createRuntimeUiContext: runtimeContext,
}));

const capabilities: RuntimeCapabilities = {
  dbGraph: true,
  hiddenProperty: true,
  numberProperty: true,
  textProperty: true,
  jsonProperty: false,
  dbChangeListener: true,
  stableMainUi: true,
  coverReference: "asset-path",
};

const originalLogseq = globalThis.logseq;

afterEach(async () => {
  const { unmountDraftRecipeUi } = await import("../../src/logseq/runtime-ui");
  act(() => unmountDraftRecipeUi());
  globalThis.logseq = originalLogseq;
  runtimeContext.mockReset();
  document.body.replaceChildren();
});

async function mountRecipeUi(initialView: DraftRecipeInitialView) {
  const openInRightSidebar = vi.fn().mockResolvedValue(undefined);
  const hideMainUI = vi.fn();
  globalThis.logseq = {
    App: {
      getUserConfigs: vi
        .fn()
        .mockResolvedValue({ preferredThemeMode: "light" }),
    },
    UI: { resolveThemeCssPropsVals: vi.fn().mockResolvedValue({}) },
    Editor: { openInRightSidebar },
    showMainUI: vi.fn(),
    hideMainUI,
    setMainUIInlineStyle: vi.fn(),
  } as unknown as typeof logseq;
  runtimeContext.mockResolvedValue({
    settings: { uiLanguage: "en", defaultMeasurementSystem: "metric" },
    controller: {
      listRecipes: async () => [],
      listArchivedRecipes: async () => [
        {
          id: "recipe-1",
          title: "Cookie",
          categories: [],
          tags: [],
          ingredientTexts: [],
        },
      ],
      loadRecipe: async () => ({
        id: "recipe-1",
        title: "Cookie",
        baseYield: 2,
        categories: [],
        tags: [],
        ingredients: [],
        steps: [],
        notes: [],
        schemaVersion: 1,
        ingredientConversionOverrides: [],
      }),
      resolveCover: async () => null,
      openInLogseq: (id: string) => {
        void logseq.Editor.openInRightSidebar(id);
      },
    },
    defaultParserLocale: "en",
    defaultSourceMeasurementSystem: "metric",
  });

  const { openDraftRecipeUi } = await import("../../src/logseq/runtime-ui");
  await act(async () => openDraftRecipeUi(initialView, capabilities));
  return { openInRightSidebar, hideMainUI };
}

describe("runtime UI session", () => {
  it("opens an active recipe in Logseq and releases the plugin modal", async () => {
    const { openInRightSidebar, hideMainUI } = await mountRecipeUi({
      kind: "recipe",
      recipeId: "recipe-1",
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Open in Logseq" }),
    );

    expect(openInRightSidebar).toHaveBeenCalledWith("recipe-1");
    expect(hideMainUI).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(document.querySelector(".draft-recipe-app")).toBeNull(),
    );
  });

  it("opens an archived recipe in Logseq and releases the plugin modal", async () => {
    const { openInRightSidebar, hideMainUI } = await mountRecipeUi({
      kind: "recipes",
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Archived Recipes" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Open in Logseq: Cookie" }),
    );

    expect(openInRightSidebar).toHaveBeenCalledWith("recipe-1");
    expect(hideMainUI).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(document.querySelector(".draft-recipe-app")).toBeNull(),
    );
  });

  it("does not mount an opening UI after a graph change unmounts it", async () => {
    let resolveContext!: (value: unknown) => void;
    runtimeContext.mockReturnValue(
      new Promise((resolve) => {
        resolveContext = resolve;
      }),
    );
    const showMainUI = vi.fn();
    globalThis.logseq = {
      App: {
        getUserConfigs: vi.fn().mockResolvedValue({
          preferredThemeMode: "light",
        }),
      },
      UI: { resolveThemeCssPropsVals: vi.fn().mockResolvedValue({}) },
      showMainUI,
      hideMainUI: vi.fn(),
      setMainUIInlineStyle: vi.fn(),
    } as unknown as typeof logseq;

    const { openDraftRecipeUi, unmountDraftRecipeUi } = await import(
      "../../src/logseq/runtime-ui"
    );
    const opening = openDraftRecipeUi({ kind: "recipes" }, capabilities);
    unmountDraftRecipeUi();
    resolveContext({
      settings: {
        uiLanguage: "en",
        defaultMeasurementSystem: "metric",
      },
      controller: {},
      defaultParserLocale: "en",
      defaultSourceMeasurementSystem: "metric",
    });

    await expect(opening).resolves.toBeUndefined();
    expect(showMainUI).not.toHaveBeenCalled();
    expect(document.getElementById("app")).toBeNull();
  });
});
