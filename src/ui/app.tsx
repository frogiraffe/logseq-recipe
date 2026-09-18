import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
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

  const measurementSystem =
    recipe?.measurementSystemOverride ?? config.globalMeasurementSystem;
  const themeStyle = useMemo(
    () => (config.themeCssProperties ?? {}) as CSSProperties,
    [config.themeCssProperties],
  );

  const refreshRecipeById = useCallback(
    async (id: string, resetYield: boolean): Promise<Recipe | null> => {
      try {
        setError(null);
        const loaded = await controller.loadRecipe(id);
        if (!loaded) {
          setError(`Recipe not found: ${id}`);
          return null;
        }
        setRecipe(loaded);
        if (resetYield) setTargetYield(loaded.baseYield);
        return loaded;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return null;
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
      void refreshRecipeById(recipeId, false);
    });
  }, [controller, recipeId, refreshRecipeById]);

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
        onCancel={() => {
          setView({ kind: "recipes" });
          void refreshRecipes();
        }}
        onSubmit={(input) => {
          void controller
            .createRecipe(input)
            .then((created) => {
              setRecipe(created);
              setTargetYield(created.baseYield);
              setView({ kind: "recipe-loaded" });
            })
            .catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : String(cause));
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
        onCancel={controller.close}
        onConfirm={(resolvedDraft) => {
          void controller
            .commitConversion(resolvedDraft)
            .then(() => openRecipeById(resolvedDraft.rootId, true))
            .catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : String(cause));
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
        onCancel={() => setView({ kind: "recipe-loaded" })}
        onSave={(meta, cover: CoverSelection) => {
          void (async () => {
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
          })();
        }}
      />,
    );
  }

  if (view.kind === "edit" && recipe) {
    return shell(
      <RecipeEditor
        recipe={recipe}
        messages={messages}
        onCancel={() => setView({ kind: "recipe-loaded" })}
        onSave={(patch) => {
          void (async () => {
            try {
              setError(null);
              await controller.saveRecipeEdit(recipe.id, patch);
              const refreshed = await refreshRecipeById(recipe.id, false);
              if (refreshed) setView({ kind: "recipe-loaded" });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          })();
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
          onTargetYieldChange={setTargetYield}
          onEditSettings={() => void openSettings()}
          onEditRecipe={() => setView({ kind: "edit" })}
          onDuplicateRecipe={() => {
            void (async () => {
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
            })();
          }}
          onDeleteRecipe={() => {
            void (async () => {
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
            })();
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
