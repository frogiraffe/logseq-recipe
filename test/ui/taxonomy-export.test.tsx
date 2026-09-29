import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TaxonomyExportPlan } from "../../src/application/types";
import { DraftRecipeApp } from "../../src/ui/app";
import { enMessages } from "../../src/ui/i18n";
import type { DraftRecipeUiController } from "../../src/ui/state";

function controllerWith(
  overrides: Partial<DraftRecipeUiController> = {},
): DraftRecipeUiController {
  return {
    listRecipes: async () => [],
    listArchivedRecipes: async () => [],
    loadRecipe: async () => null,
    createRecipe: async () => {
      throw new Error("not used in this test");
    },
    duplicateRecipe: async () => {
      throw new Error("not used in this test");
    },
    commitConversion: async () => undefined,
    commitRebuiltConversion: async () => undefined,
    commitImportedRecipe: async () => "",
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

function renderRecipes(controller: DraftRecipeUiController) {
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
}

const pending: TaxonomyExportPlan = {
  recipeCount: 2,
  propertyNames: ["recipe_categories", "recipe_tags"],
  pagesToCreate: ["Kek"],
  pagesToReuse: ["Tatlı"],
  namesKeptInPlugin: ["Tatlı/Tuzlu"],
};
const done: TaxonomyExportPlan = {
  recipeCount: 0,
  propertyNames: [],
  pagesToCreate: [],
  pagesToReuse: [],
  namesKeptInPlugin: [],
};

const exportItem = () =>
  screen.queryByRole("button", { name: enMessages.exportTaxonomy });

describe("moving categories and tags into Logseq", () => {
  it("says above the list how many recipes still need it, until put off", async () => {
    renderRecipes(
      controllerWith({
        planTaxonomyExport: async () => pending,
        exportTaxonomy: async () => 2,
      }),
    );
    expect(
      await screen.findByText(
        "2 recipes have categories or tags that Logseq's own queries can't find yet.",
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.taxonomyNoticeReview }),
    );
    expect((await screen.findByRole("alertdialog")).textContent).toContain(
      "change them in the plugin or in Logseq",
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: enMessages.cancel,
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.taxonomyNoticeLater }),
    );
    expect(screen.queryByText(/can't find yet/)).toBeNull();
    // Still offered under More actions.
    expect(exportItem()).toBeTruthy();
  });

  it("checks again on coming back to the list", async () => {
    const planTaxonomyExport = vi
      .fn<() => Promise<TaxonomyExportPlan>>()
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(done);
    renderRecipes(
      controllerWith({ planTaxonomyExport, exportTaxonomy: async () => 0 }),
    );
    expect(await screen.findByText(/can't find yet/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.createRecipe }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: enMessages.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/can't find yet/)).toBeNull(),
    );
  });

  it("previews what it writes, and writes only once confirmed", async () => {
    const planTaxonomyExport = vi
      .fn<() => Promise<TaxonomyExportPlan>>()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(done);
    const exportTaxonomy = vi.fn(async () => 2);
    renderRecipes(controllerWith({ planTaxonomyExport, exportTaxonomy }));

    fireEvent.click(
      await screen.findByRole("button", { name: enMessages.exportTaxonomy }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "The categories and tags of 2 recipes will be written to the Logseq properties recipe_categories, recipe_tags.",
    );
    expect(dialog.textContent).toContain(
      "New pages: Kek · Existing pages: Tatlı · Kept in the plugin only, since Logseq can't use them as page names: Tatlı/Tuzlu",
    );
    expect(exportTaxonomy).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: enMessages.exportTaxonomyAction,
      }),
    );
    expect(
      await screen.findByText(
        "Categories and tags added to Logseq for 2 recipes",
      ),
    ).toBeTruthy();
    expect(exportTaxonomy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(exportItem()).toBeNull());
    expect(screen.queryByText(/can't find yet/)).toBeNull();
  });

  it("writes nothing when the question is cancelled", async () => {
    const exportTaxonomy = vi.fn(async () => 2);
    renderRecipes(
      controllerWith({
        planTaxonomyExport: async () => pending,
        exportTaxonomy,
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: enMessages.exportTaxonomy }),
    );
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: enMessages.cancel,
      }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(exportTaxonomy).not.toHaveBeenCalled();
  });

  it("is not offered when everything is copied, or the graph can't hold it", async () => {
    const planTaxonomyExport = vi.fn(async () => done);
    renderRecipes(controllerWith({ planTaxonomyExport }));
    await waitFor(() => expect(planTaxonomyExport).toHaveBeenCalled());
    expect(
      await screen.findByRole("button", { name: enMessages.archivedRecipes }),
    ).toBeTruthy();
    expect(exportItem()).toBeNull();
  });

  it("is not offered where the controller has no such copy", async () => {
    renderRecipes(controllerWith());
    expect(
      await screen.findByRole("button", { name: enMessages.archivedRecipes }),
    ).toBeTruthy();
    expect(exportItem()).toBeNull();
  });
});
