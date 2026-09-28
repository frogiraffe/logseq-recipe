import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  analyzeRecipeConversion,
  outlineToSource,
} from "../../src/application/convert-recipe";
import type { OutlineNode } from "../../src/application/split-outline";
import { defaultParseContext } from "../../src/parsing/context";
import { DraftRecipeApp } from "../../src/ui/app";
import { enMessages } from "../../src/ui/i18n";
import type {
  DraftRecipeInitialView,
  DraftRecipeUiController,
} from "../../src/ui/state";

const outline: OutlineNode = {
  text: "Classic Banana Bread",
  children: [
    { text: "Yield: 10 slices", children: [] },
    {
      text: "Ingredients",
      children: [{ text: "3 ripe bananas", children: [] }],
    },
    { text: "Steps", children: [{ text: "Mash the bananas.", children: [] }] },
  ],
};
const rebuild = { outline, staleChildIds: ["chunk-1", "chunk-2"] };
const source = outlineToSource(outline, "block-1");
const initialView: DraftRecipeInitialView = {
  kind: "convert",
  source,
  draft: analyzeRecipeConversion(source, defaultParseContext("en")),
  rebuild,
};

function baseController(
  overrides: Partial<DraftRecipeUiController> = {},
): DraftRecipeUiController {
  return {
    listRecipes: async () => [],
    listArchivedRecipes: async () => [],
    loadRecipe: async () => null,
    createRecipe: async () => {
      throw new Error("not used");
    },
    duplicateRecipe: async () => {
      throw new Error("not used");
    },
    commitConversion: async () => undefined,
    commitRebuiltConversion: async () => {
      throw new Error("not used in this test");
    },
    commitImportedRecipe: async () => {
      throw new Error("not used in this test");
    },
    resolveCover: async () => null,
    listImageAssets: async () => [],
    saveRecipeMeta: async () => undefined,
    setCoverPath: async () => undefined,
    clearCover: async () => undefined,
    saveRecipeEdit: async () => undefined,
    canMoveToRecipeLibrary: async () => false,
    moveToRecipeLibrary: async () => undefined,
    archiveRecipe: async () => undefined,
    restoreRecipe: async () => undefined,
    deleteArchivedRecipe: async () => undefined,
    openInLogseq: () => undefined,
    close: () => undefined,
    ...overrides,
  };
}

function renderPreview(controller: DraftRecipeUiController) {
  render(
    <DraftRecipeApp
      controller={controller}
      messages={enMessages}
      config={{
        initialView,
        globalMeasurementSystem: "metric",
        defaultParserLocale: "en",
        defaultSourceMeasurementSystem: "us",
      }}
    />,
  );
}

describe("Convert Preview of blocks to rebuild", () => {
  it("shows the new structure and rebuilds only on Confirm", async () => {
    const commitRebuiltConversion = vi
      .fn<DraftRecipeUiController["commitRebuiltConversion"]>()
      .mockResolvedValue(undefined);
    const loadRecipe = vi.fn().mockResolvedValue(null);
    renderPreview(baseController({ commitRebuiltConversion, loadRecipe }));

    expect(screen.getByText(enMessages.rebuildNotice)).toBeTruthy();
    expect(screen.getByText(enMessages.newStructure)).toBeTruthy();
    expect(commitRebuiltConversion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: enMessages.confirm }));

    await waitFor(() => expect(commitRebuiltConversion).toHaveBeenCalled());
    const [rebuilt, draft] = commitRebuiltConversion.mock.calls[0];
    expect(rebuilt).toBe(rebuild);
    expect(draft.rootId).toBe("block-1");
    await waitFor(() => expect(loadRecipe).toHaveBeenCalledWith("block-1"));
  });

  it("surfaces an error instead of silently failing when the rebuild fails", async () => {
    renderPreview(
      baseController({
        commitRebuiltConversion: vi
          .fn()
          .mockRejectedValue(new Error("Logseq refused the write")),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: enMessages.confirm }));

    expect(
      await screen.findByText(
        enMessages.errorUnexpected.replace(
          "{detail}",
          "Logseq refused the write",
        ),
      ),
    ).toBeTruthy();
  });

  it("cancels without touching the graph", () => {
    const commitRebuiltConversion = vi.fn();
    const close = vi.fn();
    renderPreview(baseController({ commitRebuiltConversion, close }));

    fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));

    expect(close).toHaveBeenCalled();
    expect(commitRebuiltConversion).not.toHaveBeenCalled();
  });
});
