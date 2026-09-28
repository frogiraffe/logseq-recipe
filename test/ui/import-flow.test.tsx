import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConversionDraft } from "../../src/application/convert-recipe";
import type { OutlineNode } from "../../src/application/split-outline";
import { DraftRecipeApp } from "../../src/ui/app";
import { enMessages } from "../../src/ui/i18n";
import type { DraftRecipeUiController } from "../../src/ui/state";

const RECIPE_TEXT = [
  "Pancakes",
  "Servings: 4",
  "Ingredients",
  "200 g flour",
  "Steps",
  "Mix.",
].join("\n");

function controller(
  commitImportedRecipe: DraftRecipeUiController["commitImportedRecipe"],
): DraftRecipeUiController {
  const unused = async () => {
    throw new Error("not used in this test");
  };
  return {
    listRecipes: async () => [],
    listArchivedRecipes: async () => [],
    loadRecipe: async () => null,
    createRecipe: unused,
    duplicateRecipe: unused,
    commitConversion: unused,
    commitRebuiltConversion: unused,
    commitImportedRecipe,
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
  } as DraftRecipeUiController;
}

function renderImport(
  commit = vi.fn<(o: OutlineNode, d: ConversionDraft) => Promise<string>>(),
) {
  render(
    <DraftRecipeApp
      controller={controller(commit)}
      messages={enMessages}
      config={{
        initialView: { kind: "import-text" },
        globalMeasurementSystem: "metric",
        defaultParserLocale: "en",
        defaultSourceMeasurementSystem: "us",
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText(enMessages.recipeText), {
    target: { value: RECIPE_TEXT },
  });
  fireEvent.click(
    screen.getByRole("button", { name: enMessages.importRecipeAction }),
  );
  return commit;
}

describe("Import from Text", () => {
  it("previews without writing, and Cancel returns to the pasted text", () => {
    const commit = renderImport();

    expect(screen.getByText(enMessages.convertToRecipe)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));

    expect(
      (screen.getByLabelText(enMessages.recipeText) as HTMLTextAreaElement)
        .value,
    ).toBe(RECIPE_TEXT);
    expect(commit).not.toHaveBeenCalled();
  });

  it("writes the recipe only on Confirm", async () => {
    const commit = renderImport(
      vi
        .fn<(o: OutlineNode, d: ConversionDraft) => Promise<string>>()
        .mockResolvedValue("written-root"),
    );

    fireEvent.click(screen.getByRole("button", { name: enMessages.confirm }));

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    const [outline, draft] = commit.mock.calls[0];
    expect(outline.text).toBe("Pancakes");
    expect(draft.rootId).toBe("import");
    expect(draft.ingredients.map((i) => i.parsed.rawText)).toEqual([
      "200 g flour",
    ]);
  });
});
