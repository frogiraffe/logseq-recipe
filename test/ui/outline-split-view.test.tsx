import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  analyzeRecipeConversion,
  type ConversionSourceNode,
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
  children: [{ text: "Ingredients", children: [] }],
};

const source: ConversionSourceNode = {
  id: "block-1",
  title: "Classic Banana Bread",
  children: [{ id: "ing", title: "Ingredients", children: [] }],
};

const draft = analyzeRecipeConversion(source, defaultParseContext("en"));

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
}

describe("convert-needs-split view", () => {
  it("offers to split the outline, and transitions to Convert Preview on success", async () => {
    const splitOutlineAndConvert = vi
      .fn<
        (
          uuid: string,
          node: OutlineNode,
          staleChildIds: string[],
        ) => Promise<DraftRecipeInitialView>
      >()
      .mockResolvedValue({ kind: "convert", source, draft });
    const controller = baseController({ splitOutlineAndConvert });

    render(
      <DraftRecipeApp
        controller={controller}
        messages={enMessages}
        config={{
          initialView: {
            kind: "convert-needs-split",
            uuid: "block-1",
            outline,
            staleChildIds: ["chunk-1", "chunk-2"],
          },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    expect(screen.getByText(enMessages.outlineNeedsSplitMessage)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.splitOutlineAction }),
    );

    await waitFor(() => {
      expect(splitOutlineAndConvert).toHaveBeenCalledWith("block-1", outline, [
        "chunk-1",
        "chunk-2",
      ]);
    });
    expect(
      await screen.findByText(enMessages.convertToRecipe, { exact: false }),
    ).toBeTruthy();
  });

  it("surfaces an error instead of silently failing when the split fails", async () => {
    const splitOutlineAndConvert = vi
      .fn<
        (
          uuid: string,
          node: OutlineNode,
          staleChildIds: string[],
        ) => Promise<DraftRecipeInitialView>
      >()
      .mockRejectedValue(new Error("Logseq refused the write"));
    const controller = baseController({ splitOutlineAndConvert });

    render(
      <DraftRecipeApp
        controller={controller}
        messages={enMessages}
        config={{
          initialView: {
            kind: "convert-needs-split",
            uuid: "block-1",
            outline,
            staleChildIds: ["chunk-1", "chunk-2"],
          },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.splitOutlineAction }),
    );

    expect(await screen.findByText("Logseq refused the write")).toBeTruthy();
  });

  it("cancels back to the Recipes browser without touching the graph", async () => {
    const splitOutlineAndConvert = vi.fn();
    const listRecipes = vi.fn().mockResolvedValue([]);
    const controller = baseController({
      splitOutlineAndConvert,
      listRecipes,
    });

    render(
      <DraftRecipeApp
        controller={controller}
        messages={enMessages}
        config={{
          initialView: {
            kind: "convert-needs-split",
            uuid: "block-1",
            outline,
            staleChildIds: ["chunk-1", "chunk-2"],
          },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "us",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));

    expect(splitOutlineAndConvert).not.toHaveBeenCalled();
    expect(await screen.findByText(enMessages.createRecipe)).toBeTruthy();
  });
});
