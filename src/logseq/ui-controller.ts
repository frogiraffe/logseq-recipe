import type { ConversionDraft } from "../application/convert-recipe";
import {
  analyzeRecipeConversion,
  commitRecipeConversion,
} from "../application/convert-recipe";
import {
  commitRecipeEdit,
  type RecipeEditPatch,
} from "../application/edit-recipe";
import type { OutlineNode } from "../application/split-outline";
import type { NewRecipeInput } from "../application/types";
import { validateLoadedRecipe } from "../application/validate-recipe";
import type { Recipe, RecipeMeta } from "../domain/recipe";
import { runRecipeMigrations } from "../migrations/runner";
import { defaultParseContext } from "../parsing/context";
import { getLocalePack } from "../parsing/locales";
import type {
  DraftRecipeInitialView,
  DraftRecipeUiController,
} from "../ui/state";
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
import { isAlreadyDraftRecipe, loadConversionRoot } from "./conversion-source";
import { watchDebounced } from "./events";
import { writeRecipeMeta } from "./recipe-meta-store";
import {
  createDraftRecipeRepository,
  currentDraftRecipeHost,
} from "./repository";
import { ensureRecipeSchema } from "./schema";
import {
  type DraftRecipeSettings,
  readSettings,
  resolveParserLocale,
} from "./settings";
import { applyOutlineSplit } from "./split-outline-writer";

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

  // Draft Recipe deliberately uses the string-JSON metadata codec even when a
  // build appears to expose native JSON properties. The deep compatibility
  // probe still measures JSON support, but core runtime behavior does not
  // depend on it.
  const metadataCapabilities = { jsonProperty: false } as const;
  const schemaCapabilities = {
    ...metadataCapabilities,
    coverReference: capabilities.coverReference,
  } as const;

  await ensureRecipeSchema(host.editor, schemaCapabilities);

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

  async function migrateThenLoad(id: string): Promise<Recipe | null> {
    await runRecipeMigrations(
      {
        getBlockProperty: (blockId, key) =>
          logseq.Editor.getBlockProperty(blockId, key),
        upsertBlockProperty: (blockId, key, value) =>
          logseq.Editor.upsertBlockProperty(blockId, key, value),
      },
      id,
      metadataCapabilities,
    );

    const recipe = await repository.getRecipe(id);
    if (!recipe) return null;

    const validation = validateLoadedRecipe(recipe);
    if (!validation.valid) {
      const errors = validation.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message);
      throw new Error(
        errors.length > 0
          ? errors.join(" ")
          : "Recipe data is invalid and cannot be rendered safely.",
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
    splitOutlineAndConvert: async (
      uuid: string,
      outline: OutlineNode,
      staleChildIds: string[],
    ): Promise<DraftRecipeInitialView> => {
      await applyOutlineSplit(uuid, outline, staleChildIds);
      const source = await loadConversionRoot(uuid);
      if (!source) {
        throw new Error(
          "Could not re-read the recipe after splitting it into blocks.",
        );
      }
      if (await isAlreadyDraftRecipe(source.id)) {
        return {
          kind: "already-recipe",
          recipeId: source.id,
          title: source.title,
        };
      }
      const parseContext = defaultParseContext(defaultParserLocale);
      parseContext.sourceMeasurementSystem = defaultSourceMeasurementSystem;
      const draft = analyzeRecipeConversion(source, parseContext);
      return { kind: "convert", source, draft };
    },
    resolveCover: (recipe: Pick<Recipe, "cover">) =>
      resolveCoverUrl(currentCoverResolverHost(), recipe.cover),
    listImageAssets: () => listImageAssets(currentAssetListHost()),
    listStepMediaAssets: () => listStepMediaAssets(currentAssetListHost()),
    resolveAssetUrl: (path: string) =>
      resolveAssetUrl(currentCoverResolverHost(), path),
    saveRecipeMeta: (id: string, meta: RecipeMeta) =>
      writeRecipeMeta(logseq.Editor, id, meta, metadataCapabilities),
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
