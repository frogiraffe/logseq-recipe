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
import type { CanonicalUnit } from "../domain/unit";
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
import { confirmDiscardIfDirty } from "./dirty-guard";
import { useFocusTrap } from "./focus-trap";
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
  const shellRef = useRef<HTMLDivElement>(null);

  // The plugin's main UI behaves like a modal dialog over the Logseq
  // window: move focus into it on open, and restore whatever had focus
  // beforehand once it unmounts (closes), instead of leaving focus stranded
  // on an element that's no longer visible.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    shellRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);
  // Without this, Tab/Shift+Tab would walk out of the dialog into whatever
  // Logseq itself renders next in DOM order - a real focus escape, not just
  // a cosmetic issue, for an element marked aria-modal="true".
  useFocusTrap(shellRef);

  const [view, setView] = useState<ActiveView>(config.initialView);
  const [recipes, setRecipes] = useState<
    Awaited<ReturnType<typeof controller.listRecipes>>
  >([]);
  // False only until the first `listRecipes` call settles, so an empty
  // initial array isn't mistaken for a confirmed-empty graph.
  const [recipesLoaded, setRecipesLoaded] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [targetYield, setTargetYield] = useState(1);
  // Lifted above Recipe Card/Cooking Mode (rather than owned by either) so a
  // per-ingredient display-unit choice survives switching between them for
  // the same recipe in the same session.
  const [ingredientUnitOverrides, setIngredientUnitOverrides] = useState<
    Record<string, CanonicalUnit>
  >({});
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverAssets, setCoverAssets] = useState<string[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<
    FacetSuggestion[]
  >([]);
  const [tagSuggestions, setTagSuggestions] = useState<FacetSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Whichever of Edit/Settings/Convert is currently active reports its own
  // isDirty state up here, so the shell's global Close button - which has
  // no other way to see inside that form - can apply the same discard
  // confirmation as the form's own Cancel button, instead of silently
  // discarding unsaved changes.
  const [formDirty, setFormDirty] = useState(false);

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
    } finally {
      setRecipesLoaded(true);
    }
  }, [controller]);

  const openSettings = useCallback(async () => {
    // Matches every other Create/Convert/Save/Duplicate/Delete action: keep
    // trigger buttons disabled (via `pending`) while this asset/list fetch
    // is in flight, rather than leaving the click with no visible feedback
    // until the settings panel simply appears.
    await runExclusive(async () => {
      try {
        setError(null);
        // Asset listing is optional (cover support degrades gracefully when
        // unavailable) - its failure must not also block the rest of Recipe
        // Settings (categories, tags, parser/measurement overrides) from
        // opening at all.
        const [assets, summaries] = await Promise.all([
          controller.listImageAssets().catch(() => []),
          controller.listRecipes(),
        ]);
        setCoverAssets(assets);
        setCategorySuggestions(
          collectFacetSuggestions(summaries, "categories"),
        );
        setTagSuggestions(collectFacetSuggestions(summaries, "tags"));
        setView({ kind: "settings" });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
  }, [controller, runExclusive]);

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: recipeId is a deliberate re-run trigger (a different recipe was opened), not a value the effect body reads.
  useEffect(() => {
    setIngredientUnitOverrides({});
  }, [recipeId]);

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

  const handleIngredientUnitOverrideChange = useCallback(
    (ingredientId: string, unit: CanonicalUnit | null) => {
      setIngredientUnitOverrides((current) => {
        if (!unit) {
          if (!(ingredientId in current)) return current;
          const next = { ...current };
          delete next[ingredientId];
          return next;
        }
        return { ...current, [ingredientId]: unit };
      });
    },
    [],
  );

  const shell = (content: ReactNode) => (
    <div
      ref={shellRef}
      className="draft-recipe-app"
      data-theme-mode={config.themeMode ?? "light"}
      style={themeStyle}
      role="dialog"
      aria-modal="true"
      aria-label={messages.recipes}
      tabIndex={-1}
    >
      <div className="draft-recipe-app-toolbar">
        <button
          type="button"
          onClick={() =>
            confirmDiscardIfDirty(
              formDirty,
              messages.discardChangesConfirm,
              controller.close,
            )
          }
        >
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
        source={view.source}
        draft={view.draft}
        messages={messages}
        pending={pending}
        onCancel={controller.close}
        onDirtyChange={setFormDirty}
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

  if (view.kind === "convert-needs-split") {
    return shell(
      <div className="draft-recipe-outline-split">
        <p>{messages.outlineNeedsSplitMessage}</p>
        <div className="draft-recipe-actions">
          <button
            type="button"
            onClick={() => {
              setView({ kind: "recipes" });
              void refreshRecipes();
            }}
          >
            {messages.cancel}
          </button>
          <button
            type="button"
            className="draft-recipe-primary-action"
            disabled={pending}
            onClick={() => {
              void runExclusive(async () => {
                try {
                  setError(null);
                  const next = await controller.splitOutlineAndConvert(
                    view.uuid,
                    view.outline,
                    view.staleChildIds,
                  );
                  setView(next);
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : String(cause),
                  );
                }
              });
            }}
          >
            {messages.splitOutlineAction}
          </button>
        </div>
      </div>,
    );
  }

  if (view.kind === "recipe" && !recipe) {
    // A recipe opened directly (e.g. from a Logseq command on that page)
    // hasn't loaded yet - without this, the fallback branch below would
    // render the unrelated Recipes browser for that brief window instead of
    // any indication that the actual recipe is on its way. Suppressed once
    // `error` is set (load failed) so the two don't show stacked together.
    return shell(!error && <p>{messages.loadingRecipe}</p>);
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
        onDirtyChange={setFormDirty}
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
        onDirtyChange={setFormDirty}
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
        ingredientUnitOverrides={ingredientUnitOverrides}
        onIngredientUnitOverrideChange={handleIngredientUnitOverrideChange}
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
          ingredientUnitOverrides={ingredientUnitOverrides}
          onIngredientUnitOverrideChange={handleIngredientUnitOverrideChange}
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
        <button type="button" onClick={() => void refreshRecipes()}>
          {messages.refresh}
        </button>
      </div>
      <RecipesView
        recipes={recipes}
        messages={messages}
        loading={!recipesLoaded}
        onOpen={(id) => void openRecipeById(id, true)}
      />
    </>,
  );
}
