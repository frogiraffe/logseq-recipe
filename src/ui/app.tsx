import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  collectFacetSuggestions,
  type FacetSuggestion,
} from "../application/list-recipes";
import type { Recipe } from "../domain/recipe";
import { defaultParseContext } from "../parsing/context";
import { ConvertPreview } from "./components/ConvertPreview";
import { CookingMode } from "./components/CookingMode";
import { NewRecipeForm } from "./components/NewRecipeForm";
import { RecipeCard } from "./components/RecipeCard";
import { RecipeEditor } from "./components/RecipeEditor";
import {
  type CoverSelection,
  RecipeSettingsPanel,
} from "./components/RecipeSettingsPanel";
import { RecipesView } from "./components/RecipesView";
import type { UiMessages } from "./i18n";
import type {
  DraftRecipeAppConfig,
  DraftRecipeInitialView,
  DraftRecipeUiController,
} from "./state";

export interface DraftRecipeAppProps {
  controller: DraftRecipeUiController;
  config: DraftRecipeAppConfig;
  messages: UiMessages;
}

type ActiveView =
  | DraftRecipeInitialView
  | { kind: "recipe-loaded" }
  | { kind: "cooking" }
  | { kind: "settings" }
  | { kind: "edit" };

export function DraftRecipeApp({
  controller,
  config,
  messages,
}: DraftRecipeAppProps) {
  const [view, setView] = useState<ActiveView>(config.initialView);
  const [recipes, setRecipes] = useState<
    Awaited<ReturnType<typeof controller.listRecipes>>
  >([]);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [targetYield, setTargetYield] = useState(1);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverAssets, setCoverAssets] = useState<string[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<
    FacetSuggestion[]
  >([]);
  const [tagSuggestions, setTagSuggestions] = useState<FacetSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A double-click (or a slow Logseq call) must never start a second Create/
  // Convert/Save/Duplicate/Delete before the first one finishes and creates
  // duplicate blocks or pages. `pending` blocks re-entry into any of them;
  // callers also disable their trigger button while it's true.
  const runExclusive = useCallback(
    async (task: () => Promise<void>) => {
      if (pending) return;
      setPending(true);
      try {
        await task();
      } finally {
        setPending(false);
      }
    },
    [pending],
  );

  const measurementSystem =
    recipe?.measurementSystemOverride ?? config.globalMeasurementSystem;
  const themeStyle = useMemo(
    () => (config.themeCssProperties ?? {}) as CSSProperties,
    [config.themeCssProperties],
  );

  // A DB watcher can fire again before a slower earlier load resolves. Only
  // the most recently *started* load is allowed to apply its result, so an
  // older response can never overwrite newer state after the fact. A
  // superseded load resolves to `undefined` (nothing decided) rather than
  // `null` (confirmed gone) - callers that care about "was this recipe
  // actually deleted" must not treat the two the same.
  const loadTokenRef = useRef(0);
  const refreshRecipeById = useCallback(
    async (
      id: string,
      resetYield: boolean,
    ): Promise<Recipe | null | undefined> => {
      const token = ++loadTokenRef.current;
      try {
        setError(null);
        const loaded = await controller.loadRecipe(id);
        if (loadTokenRef.current !== token) return undefined;
        if (!loaded) {
          setError(`Recipe not found: ${id}`);
          setRecipe(null);
          return null;
        }
        setRecipe(loaded);
        if (resetYield) setTargetYield(loaded.baseYield);
        return loaded;
      } catch (cause) {
        if (loadTokenRef.current === token) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
        return undefined;
      }
    },
    [controller],
  );

  const openRecipeById = useCallback(
    async (id: string, resetYield: boolean): Promise<void> => {
      const loaded = await refreshRecipeById(id, resetYield);
      if (loaded) setView({ kind: "recipe-loaded" });
    },
    [refreshRecipeById],
  );

  const refreshRecipes = useCallback(async () => {
    try {
      setError(null);
      setRecipes(await controller.listRecipes());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [controller]);

  const openSettings = useCallback(async () => {
    try {
      setError(null);
      const [assets, summaries] = await Promise.all([
        controller.listImageAssets(),
        controller.listRecipes(),
      ]);
      setCoverAssets(assets);
      setCategorySuggestions(collectFacetSuggestions(summaries, "categories"));
      setTagSuggestions(collectFacetSuggestions(summaries, "tags"));
      setView({ kind: "settings" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [controller]);

  useEffect(() => {
    const initial = config.initialView;
    if (initial.kind === "recipes") void refreshRecipes();
    if (initial.kind === "recipe") {
      void openRecipeById(initial.recipeId, true);
    }
  }, [config.initialView, openRecipeById, refreshRecipes]);

  useEffect(() => {
    if (!recipe) {
      setCoverUrl(null);
      return;
    }
    let cancelled = false;
    void controller.resolveCover(recipe).then((url) => {
      if (!cancelled) setCoverUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [controller, recipe]);

  const recipeId = recipe?.id;
  useEffect(() => {
    if (!recipeId || !controller.watchRecipe) return undefined;
    return controller.watchRecipe(recipeId, () => {
      void refreshRecipeById(recipeId, false).then((loaded) => {
        // The recipe was removed/recycled from outside the plugin (or by
        // this plugin's own Delete) while its card was open - don't leave a
        // stale card on screen with nothing behind it. `undefined` means
        // this particular load was superseded by a newer one, not that the
        // recipe is actually gone - only `null` is a confirmed deletion.
        if (loaded === null) {
          setView({ kind: "recipes" });
          void refreshRecipes();
        }
      });
    });
  }, [controller, recipeId, refreshRecipeById, refreshRecipes]);

  const shell = (content: ReactNode) => (
    <div
      className="draft-recipe-app"
      data-theme-mode={config.themeMode ?? "light"}
      style={themeStyle}
    >
      <div className="draft-recipe-app-toolbar">
        <button type="button" onClick={controller.close}>
          {messages.close}
        </button>
      </div>
      {error && <div className="draft-recipe-error">{error}</div>}
      {content}
    </div>
  );

  const createDefaults = useMemo(
    () => ({
      locale: config.defaultParserLocale,
      sourceMeasurementSystem:
        config.defaultSourceMeasurementSystem ??
        defaultParseContext(config.defaultParserLocale).sourceMeasurementSystem,
    }),
    [config.defaultParserLocale, config.defaultSourceMeasurementSystem],
  );

  if (view.kind === "create") {
    return shell(
      <NewRecipeForm
        messages={messages}
        locale={createDefaults.locale}
        sourceMeasurementSystem={createDefaults.sourceMeasurementSystem}
        pending={pending}
        onCancel={() => {
          setView({ kind: "recipes" });
          void refreshRecipes();
        }}
        onSubmit={(input) => {
          void runExclusive(async () => {
            try {
              setError(null);
              const created = await controller.createRecipe(input);
              setRecipe(created);
              setTargetYield(created.baseYield);
              setView({ kind: "recipe-loaded" });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          });
        }}
      />,
    );
  }

  if (view.kind === "convert") {
    return shell(
      <ConvertPreview
        draft={view.draft}
        messages={messages}
        pending={pending}
        onCancel={controller.close}
        onConfirm={(resolvedDraft) => {
          void runExclusive(async () => {
            try {
              setError(null);
              await controller.commitConversion(resolvedDraft);
              await openRecipeById(resolvedDraft.rootId, true);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          });
        }}
      />,
    );
  }

  if (view.kind === "already-recipe") {
    return shell(
      <div className="draft-recipe-already-recipe">
        <p>{messages.alreadyRecipe}</p>
        <p>
          <strong>{view.title}</strong>
        </p>
        <button
          type="button"
          className="draft-recipe-primary-action"
          onClick={() => void openRecipeById(view.recipeId, true)}
        >
          {messages.openRecipe}
        </button>
      </div>,
    );
  }

  if (view.kind === "settings" && recipe) {
    return shell(
      <RecipeSettingsPanel
        recipe={recipe}
        assets={coverAssets}
        messages={messages}
        categorySuggestions={categorySuggestions}
        tagSuggestions={tagSuggestions}
        defaultSourceMeasurementSystem={config.defaultSourceMeasurementSystem}
        pending={pending}
        onCancel={() => setView({ kind: "recipe-loaded" })}
        onSave={(meta, cover: CoverSelection) => {
          void runExclusive(async () => {
            try {
              setError(null);
              await controller.saveRecipeMeta(recipe.id, meta);
              if (cover === null) await controller.clearCover(recipe.id);
              else if (typeof cover === "string") {
                await controller.setCoverPath(recipe.id, cover);
              }
              const refreshed = await refreshRecipeById(recipe.id, false);
              if (refreshed) setView({ kind: "recipe-loaded" });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          });
        }}
      />,
    );
  }

  if (view.kind === "edit" && recipe) {
    return shell(
      <RecipeEditor
        recipe={recipe}
        messages={messages}
        pending={pending}
        onCancel={() => setView({ kind: "recipe-loaded" })}
        onSave={(patch) => {
          void runExclusive(async () => {
            try {
              setError(null);
              await controller.saveRecipeEdit(recipe.id, patch);
              const refreshed = await refreshRecipeById(
                recipe.id,
                patch.baseYield !== undefined,
              );
              if (refreshed) setView({ kind: "recipe-loaded" });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          });
        }}
      />,
    );
  }

  if (view.kind === "cooking" && recipe) {
    return shell(
      <CookingMode
        recipe={recipe}
        targetYield={targetYield}
        measurementSystem={measurementSystem}
        messages={messages}
        coverUrl={coverUrl}
        onExit={() => setView({ kind: "recipe-loaded" })}
      />,
    );
  }

  if (view.kind === "recipe-loaded" && recipe) {
    return shell(
      <>
        <button
          type="button"
          className="draft-recipe-back"
          onClick={() => {
            setView({ kind: "recipes" });
            void refreshRecipes();
          }}
        >
          {messages.back}
        </button>
        <RecipeCard
          recipe={recipe}
          targetYield={targetYield}
          measurementSystem={measurementSystem}
          messages={messages}
          coverUrl={coverUrl}
          pending={pending}
          onTargetYieldChange={setTargetYield}
          onEditSettings={() => void openSettings()}
          onEditRecipe={() => setView({ kind: "edit" })}
          onDuplicateRecipe={() => {
            void runExclusive(async () => {
              try {
                setError(null);
                const duplicated = await controller.duplicateRecipe(recipe.id);
                setRecipe(duplicated);
                setTargetYield(duplicated.baseYield);
                setView({ kind: "recipe-loaded" });
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : String(cause),
                );
              }
            });
          }}
          onDeleteRecipe={() => {
            void runExclusive(async () => {
              try {
                setError(null);
                await controller.deleteRecipe(recipe.id);
                setView({ kind: "recipes" });
                void refreshRecipes();
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : String(cause),
                );
              }
            });
          }}
          onStartCooking={() => setView({ kind: "cooking" })}
        />
      </>,
    );
  }

  return shell(
    <>
      <div className="draft-recipe-recipes-toolbar">
        <button
          type="button"
          className="draft-recipe-primary-action"
          onClick={() => setView({ kind: "create" })}
        >
          {messages.createRecipe}
        </button>
      </div>
      <RecipesView
        recipes={recipes}
        messages={messages}
        onOpen={(id) => void openRecipeById(id, true)}
      />
    </>,
  );
}
