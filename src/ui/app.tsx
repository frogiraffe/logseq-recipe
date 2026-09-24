import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  cookingSessionKey,
  loadCookingSession,
} from "../application/cooking-session";
import { IncompleteSaveError } from "../application/edit-recipe";
import {
  collectFacetSuggestions,
  type FacetSuggestion,
} from "../application/list-recipes";
import type { Recipe } from "../domain/recipe";
import type { CanonicalUnit } from "../domain/unit";
import { defaultParseContext } from "../parsing/context";
import { ArchivedRecipesView } from "./components/ArchivedRecipesView";
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
import { TimerDock } from "./components/Timers";
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

// Screen changes cross-fade through the View Transitions API where the host
// has it; elsewhere, or with reduced motion requested, they are instant.
function withViewTransition(update: () => void): void {
  const start = (
    document as Document & {
      startViewTransition?(callback: () => void): unknown;
    }
  ).startViewTransition;
  const reduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!start || reduced) {
    update();
    return;
  }
  start.call(document, () => flushSync(update));
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

type ActiveView =
  | DraftRecipeInitialView
  | { kind: "recipe-loaded" }
  | { kind: "cooking" }
  | { kind: "settings" }
  | { kind: "archived" }
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

  const [view, setViewState] = useState<ActiveView>(config.initialView);
  const setView = useCallback(
    (next: ActiveView) => withViewTransition(() => setViewState(next)),
    [],
  );
  const [recipes, setRecipes] = useState<
    Awaited<ReturnType<typeof controller.listRecipes>>
  >([]);
  // False only until the first `listRecipes` call settles, so an empty
  // initial array isn't mistaken for a confirmed-empty graph.
  const [recipesLoaded, setRecipesLoaded] = useState(false);
  const [archivedRecipes, setArchivedRecipes] = useState<
    Awaited<ReturnType<typeof controller.listArchivedRecipes>>
  >([]);
  const [archivedRecipesLoaded, setArchivedRecipesLoaded] = useState(false);
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
  // Short-lived success feedback; the live region itself always stays
  // mounted so screen readers announce each new notice.
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(
    null,
  );
  const announce = useCallback(
    (text: string) => setNotice({ id: Date.now(), text }),
    [],
  );
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const [pending, setPending] = useState(false);
  // Whichever of Edit/Settings/Convert is currently active reports its own
  // isDirty state up here, so the shell's global Close button - which has
  // no other way to see inside that form - can apply the same discard
  // confirmation as the form's own Cancel button, instead of silently
  // discarding unsaved changes.
  const [formDirty, setFormDirty] = useState(false);

  // A double-click (or a slow Logseq call) must never start a second Create/
  // Convert/Save/Duplicate/Archive before the first one finishes and creates
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
  // Every user-triggered write: one at a time, clears the previous error,
  // and reports a failure instead of letting it escape as a rejection.
  const runAction = useCallback(
    (task: () => Promise<void>) =>
      runExclusive(async () => {
        setError(null);
        try {
          await task();
        } catch (cause) {
          setError(errorMessage(cause));
        }
      }),
    [runExclusive],
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
          setError(errorMessage(cause));
        }
        return undefined;
      }
    },
    [controller],
  );

  const openCookingById = useCallback(
    async (id: string): Promise<void> => {
      setFormDirty(false);
      const loaded = await refreshRecipeById(id, id !== recipe?.id);
      if (loaded) setView({ kind: "cooking" });
    },
    [recipe?.id, refreshRecipeById, setView],
  );

  const openRecipeById = useCallback(
    async (id: string, resetYield: boolean): Promise<void> => {
      const loaded = await refreshRecipeById(id, resetYield);
      if (loaded) setView({ kind: "recipe-loaded" });
    },
    [refreshRecipeById, setView],
  );

  const refreshRecipes = useCallback(
    async (fresh = false) => {
      try {
        setError(null);
        setRecipes(await controller.listRecipes(fresh ? { fresh } : undefined));
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setRecipesLoaded(true);
      }
    },
    [controller],
  );

  const refreshArchivedRecipes = useCallback(async () => {
    setArchivedRecipesLoaded(false);
    try {
      setError(null);
      setArchivedRecipes(await controller.listArchivedRecipes());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setArchivedRecipesLoaded(true);
    }
  }, [controller]);

  const openSettings = useCallback(async () => {
    // Matches every other Create/Convert/Save/Duplicate/Archive action: keep
    // trigger buttons disabled (via `pending`) while this asset/list fetch
    // is in flight, rather than leaving the click with no visible feedback
    // until the settings panel simply appears.
    await runAction(async () => {
      // Asset listing is optional (cover support degrades gracefully when
      // unavailable) - its failure must not also block the rest of Recipe
      // Settings (categories, tags, parser/measurement overrides) from
      // opening at all.
      const [assets, summaries] = await Promise.all([
        controller.listImageAssets().catch(() => []),
        controller.listRecipes(),
      ]);
      setCoverAssets(assets);
      setCategorySuggestions(collectFacetSuggestions(summaries, "categories"));
      setTagSuggestions(collectFacetSuggestions(summaries, "tags"));
      setView({ kind: "settings" });
    });
  }, [controller, runAction, setView]);

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
        // this plugin's own Archive) while its card was open - don't leave a
        // stale card on screen with nothing behind it. `undefined` means
        // this particular load was superseded by a newer one, not that the
        // recipe is actually gone - only `null` is a confirmed deletion.
        if (loaded === null) {
          setView({ kind: "recipes" });
          void refreshRecipes();
        }
      });
    });
  }, [controller, recipeId, refreshRecipeById, refreshRecipes, setView]);

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

  const backToRecipes = () => {
    setView({ kind: "recipes" });
    void refreshRecipes();
  };

  const shell = (content: ReactNode, onBack?: () => void) => (
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
      <header className="draft-recipe-app-bar">
        {onBack && (
          <button type="button" className="draft-recipe-back" onClick={onBack}>
            <span aria-hidden="true">←</span> {messages.back}
          </button>
        )}
        <button
          type="button"
          className="draft-recipe-close"
          aria-label={messages.close}
          title={messages.close}
          onClick={() =>
            confirmDiscardIfDirty(
              formDirty,
              messages.discardChangesConfirm,
              controller.close,
            )
          }
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      {error && <div className="draft-recipe-error">{error}</div>}
      <div
        className="draft-recipe-notice-region"
        role="status"
        aria-live="polite"
      >
        {notice && (
          <div key={notice.id} className="draft-recipe-notice">
            {notice.text}
          </div>
        )}
      </div>
      {content}
      {config.graphKey && view.kind !== "cooking" && (
        <TimerDock
          graphKey={config.graphKey}
          messages={messages}
          onOpenRecipe={(id) =>
            confirmDiscardIfDirty(
              formDirty,
              messages.discardChangesConfirm,
              () => void openCookingById(id),
            )
          }
        />
      )}
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
        onCancel={backToRecipes}
        onSubmit={(input) => {
          void runAction(async () => {
            const created = await controller.createRecipe(input);
            setRecipe(created);
            setTargetYield(created.baseYield);
            // A new recipe is always empty: go straight to adding its
            // ingredients and steps (Cancel there lands on the recipe card).
            setView({ kind: "edit" });
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
          void runAction(async () => {
            await controller.commitConversion(resolvedDraft);
            await openRecipeById(resolvedDraft.rootId, true);
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
          <button type="button" onClick={backToRecipes}>
            {messages.cancel}
          </button>
          <button
            type="button"
            className="draft-recipe-primary-action"
            disabled={pending}
            onClick={() => {
              void runAction(async () => {
                const next = await controller.splitOutlineAndConvert(
                  view.uuid,
                  view.outline,
                  view.staleChildIds,
                );
                setView(next);
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
          void runAction(async () => {
            await controller.saveRecipeMeta(recipe.id, meta);
            if (cover === null) await controller.clearCover(recipe.id);
            else if (typeof cover === "string") {
              await controller.setCoverPath(recipe.id, cover);
            }
            setView({ kind: "recipe-loaded" });
            await refreshRecipeById(recipe.id, false);
            announce(messages.savedNotice);
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
        listStepMediaAssets={controller.listStepMediaAssets}
        onSave={(patch) => {
          void runAction(async () => {
            try {
              await controller.saveRecipeEdit(recipe.id, patch);
            } catch (cause) {
              if (!(cause instanceof IncompleteSaveError)) throw cause;
              // Part of the edit reached Logseq: the editor's baseline is
              // stale, so show what the graph actually holds now.
              setView({ kind: "recipe-loaded" });
              await refreshRecipeById(recipe.id, false);
              setError(`${messages.saveIncomplete} ${cause.message}`);
              return;
            }
            if (patch.baseYield !== undefined) setTargetYield(patch.baseYield);
            setView({ kind: "recipe-loaded" });
            await refreshRecipeById(recipe.id, false);
            announce(messages.savedNotice);
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
        sessionKey={
          config.graphKey ? cookingSessionKey(config.graphKey, recipe.id) : null
        }
        resolveAssetUrl={controller.resolveAssetUrl}
        onTargetYieldChange={setTargetYield}
        onExit={() => setView({ kind: "recipe-loaded" })}
      />,
    );
  }

  if (view.kind === "archived") {
    return shell(
      <ArchivedRecipesView
        recipes={archivedRecipes}
        messages={messages}
        loading={!archivedRecipesLoaded}
        pending={pending}
        onRestore={(id) => {
          void runAction(async () => {
            await controller.restoreRecipe(id);
            const restored = archivedRecipes.find((item) => item.id === id);
            setArchivedRecipes((current) =>
              current.filter((item) => item.id !== id),
            );
            // The active list was never fetched: nothing to patch, load it.
            if (!recipesLoaded) void refreshRecipes();
            else if (restored) {
              const { archivedAt: _archivedAt, ...summary } = restored;
              setRecipes((current) => [
                ...current.filter((item) => item.id !== id),
                summary,
              ]);
            }
            setView({ kind: "recipes" });
            announce(messages.restoredNotice);
          });
        }}
        onDelete={(id) => {
          void runAction(async () => {
            await controller.deleteArchivedRecipe(id);
            setArchivedRecipes((current) =>
              current.filter((item) => item.id !== id),
            );
            announce(messages.deletedNotice);
          });
        }}
        onOpenInLogseq={controller.openInLogseq}
      />,
      backToRecipes,
    );
  }

  if (view.kind === "recipe-loaded" && recipe) {
    return shell(
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
          void runAction(async () => {
            const duplicated = await controller.duplicateRecipe(recipe.id);
            setRecipe(duplicated);
            setTargetYield(duplicated.baseYield);
            setView({ kind: "recipe-loaded" });
          });
        }}
        onArchiveRecipe={() => {
          void runAction(async () => {
            await controller.archiveRecipe(recipe.id);
            if (!recipesLoaded) void refreshRecipes();
            else
              setRecipes((current) =>
                current.filter((item) => item.id !== recipe.id),
              );
            setView({ kind: "recipes" });
            announce(messages.archivedNotice);
          });
        }}
        onOpenInLogseq={() => controller.openInLogseq(recipe.id)}
        resolveAssetUrl={controller.resolveAssetUrl}
        cookingInProgress={
          config.graphKey
            ? loadCookingSession(
                cookingSessionKey(config.graphKey, recipe.id),
              ) !== null
            : false
        }
        onStartCooking={() => setView({ kind: "cooking" })}
      />,
      backToRecipes,
    );
  }

  return shell(
    <RecipesView
      recipes={recipes}
      messages={messages}
      loading={!recipesLoaded}
      onOpen={(id) => void openRecipeById(id, true)}
      resolveCover={controller.resolveCover}
      headerActions={
        <>
          <button
            type="button"
            className="draft-recipe-icon-button"
            aria-label={messages.refresh}
            title={messages.refresh}
            onClick={() => void refreshRecipes(true)}
          >
            <span aria-hidden="true">↻</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setView({ kind: "archived" });
              void refreshArchivedRecipes();
            }}
          >
            {messages.archivedRecipes}
          </button>
          <button
            type="button"
            className="draft-recipe-primary-action"
            onClick={() => setView({ kind: "create" })}
          >
            {messages.createRecipe}
          </button>
        </>
      }
    />,
  );
}
