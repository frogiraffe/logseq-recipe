import type { ConversionDraft } from "../application/convert-recipe";
import {
  commitRecipeConversion,
  conversionStructure,
  withWrittenBlockIds,
} from "../application/convert-recipe";
import {
  commitRecipeEdit,
  type RecipeEditPatch,
} from "../application/edit-recipe";
import { RecipeError, titleTaken } from "../application/errors";
import { sameTitle } from "../application/list-recipes";
import type { OutlineNode } from "../application/split-outline";
import type { NewRecipeInput } from "../application/types";
import { validateLoadedRecipe } from "../application/validate-recipe";
import type { Recipe, RecipeMeta } from "../domain/recipe";
import { runRecipeMigrations } from "../migrations/runner";
import { getLocalePack } from "../parsing/locales";
import type { ConversionRebuild, DraftRecipeUiController } from "../ui/state";
import {
  clearRecipeCover,
  currentAssetListHost,
  currentCoverResolverHost,
  listImageAssets,
  listStepMediaAssets,
  resolveAssetUrl,
  resolveCoverUrl,
  setRecipeCover,
} from "./assets";
import type { RuntimeCapabilities } from "./capabilities";
import { watchDebounced } from "./events";
import {
  moveRecipeTaxonomy,
  planRecipeTaxonomy,
  writeRecipeMeta,
} from "./recipe-taxonomy";
import {
  createDraftRecipeRepository,
  currentDraftRecipeHost,
} from "./repository";
import { ensureRecipeSchema, ensureTaxonomySchema } from "./schema";
import {
  type DraftRecipeSettings,
  readSettings,
  resolveParserLocale,
} from "./settings";
import { applyOutlineSplit, writeImportedRecipe } from "./split-outline-writer";

export interface RuntimeUiContext {
  capabilities: RuntimeCapabilities;
  settings: DraftRecipeSettings;
  controller: DraftRecipeUiController;
  defaultParserLocale: ReturnType<typeof resolveParserLocale>;
  defaultSourceMeasurementSystem: ReturnType<
    typeof getLocalePack
  >["defaultSourceMeasurementSystem"];
}

export async function createRuntimeUiContext(
  capabilities: RuntimeCapabilities,
): Promise<RuntimeUiContext> {
  const settings = readSettings();
  const host = currentDraftRecipeHost();

  await ensureRecipeSchema(host.editor, {
    coverReference: capabilities.coverReference,
  });
  const schemaCapabilities = {
    coverReference: capabilities.coverReference,
    taxonomyProperties: await ensureTaxonomySchema(host.editor),
  };

  const repository = createDraftRecipeRepository(host, {
    settings,
    schemaCapabilities,
  });
  const configs = await logseq.App.getUserConfigs();
  const defaultParserLocale = resolveParserLocale(
    undefined,
    settings,
    configs.preferredLanguage,
  );
  const defaultSourceMeasurementSystem =
    getLocalePack(defaultParserLocale).defaultSourceMeasurementSystem;

  // Archived recipes too: their categories are data like any other.
  async function allRecipeSummaries() {
    return [
      ...(await repository.listRecipeSummaries({ fresh: true })),
      ...(await repository.listArchivedRecipeSummaries()),
    ];
  }

  async function migrateThenLoad(id: string): Promise<Recipe | null> {
    await runRecipeMigrations(logseq.Editor, id);

    const recipe = await repository.getRecipe(id);
    if (!recipe) return null;

    const validation = validateLoadedRecipe(recipe);
    if (!validation.valid) {
      const errors = validation.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message);
      const detail = errors.join(" ");
      throw new RecipeError(
        "recipe-invalid",
        detail || "Recipe data is invalid and cannot be rendered safely.",
        detail,
      );
    }

    return recipe;
  }

  const controller: DraftRecipeUiController = {
    listRecipes: (options?: { fresh?: boolean }) =>
      repository.listRecipeSummaries(options),
    listArchivedRecipes: () => repository.listArchivedRecipeSummaries(),
    loadRecipe: migrateThenLoad,
    createRecipe: (input: NewRecipeInput) => repository.createRecipe(input),
    duplicateRecipe: (id: string) => repository.duplicateRecipe(id),
    commitConversion: (draft: ConversionDraft) =>
      commitRecipeConversion(repository, draft),
    commitRebuiltConversion: async (
      rebuild: ConversionRebuild,
      draft: ConversionDraft,
    ): Promise<void> => {
      // Checked before the first write: an unconvertible draft writes nothing.
      const structure = conversionStructure(draft);
      const ids = await applyOutlineSplit(
        draft.rootId,
        rebuild.outline,
        rebuild.staleChildIds,
      );
      await repository.markExistingRecipe(withWrittenBlockIds(structure, ids));
    },
    commitImportedRecipe: async (
      outline: OutlineNode,
      draft: ConversionDraft,
    ): Promise<string> => {
      // Checked before the first write: an unconvertible draft, or a title
      // another recipe has, writes nothing.
      const structure = conversionStructure(draft);
      const existing = [
        ...(await repository.listRecipeSummaries()),
        ...(await repository.listArchivedRecipeSummaries()),
      ];
      if (existing.some((recipe) => sameTitle(recipe.title, outline.text))) {
        throw titleTaken(outline.text);
      }
      const ids = await writeImportedRecipe(outline, draft.rootId);
      const written = withWrittenBlockIds(structure, ids);
      await repository.markExistingRecipe(written);
      return written.rootId;
    },
    resolveCover: (recipe: Pick<Recipe, "cover">) =>
      resolveCoverUrl(currentCoverResolverHost(), recipe.cover),
    listImageAssets: () => listImageAssets(currentAssetListHost()),
    listStepMediaAssets: () => listStepMediaAssets(currentAssetListHost()),
    resolveAssetUrl: (path: string) =>
      resolveAssetUrl(currentCoverResolverHost(), path),
    saveRecipeMeta: (id: string, meta: RecipeMeta) =>
      writeRecipeMeta(
        logseq.Editor,
        id,
        meta,
        schemaCapabilities.taxonomyProperties,
      ),
    ...(schemaCapabilities.taxonomyProperties
      ? {
          planTaxonomyExport: async () =>
            planRecipeTaxonomy(logseq.Editor, await allRecipeSummaries()),
          exportTaxonomy: async () =>
            moveRecipeTaxonomy(logseq.Editor, await allRecipeSummaries()),
        }
      : {}),
    setCoverPath: async (id: string, path: string) => {
      if (capabilities.coverReference !== "asset-path") {
        throw new Error(
          "This Logseq build does not expose a stable asset-path cover reference.",
        );
      }
      await setRecipeCover(
        logseq.Editor,
        id,
        { kind: "asset-path", value: path },
        { coverReference: capabilities.coverReference },
      );
    },
    clearCover: (id: string) => clearRecipeCover(logseq.Editor, id),
    saveRecipeEdit: (id: string, patch: RecipeEditPatch) =>
      commitRecipeEdit(repository, id, patch),
    canMoveToRecipeLibrary: (id: string) =>
      repository.canMoveToRecipeLibrary(id),
    moveToRecipeLibrary: (id: string) => repository.moveToRecipeLibrary(id),
    archiveRecipe: (id: string) => repository.archiveRecipe(id),
    restoreRecipe: (id: string) => repository.restoreRecipe(id),
    deleteArchivedRecipe: (id: string) => repository.deleteArchivedRecipe(id),
    openInLogseq: (id: string) => {
      void logseq.Editor.openInRightSidebar(id);
    },
    watchRecipe: (id, listener) =>
      watchDebounced(
        (trigger) => repository.watchRecipe(id, trigger),
        listener,
        120,
      ),
    close: () => logseq.hideMainUI(),
  };

  return {
    capabilities,
    settings,
    controller,
    defaultParserLocale,
    defaultSourceMeasurementSystem,
  };
}
