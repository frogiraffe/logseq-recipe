import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  analyzeWithDetectedLocale,
  type ConversionDraft,
  type ConversionSourceNode,
  outlineToSource,
} from "../application/convert-recipe";
import {
  clearCookingSession,
  cookingSessionKey,
  loadCookingSession,
} from "../application/cooking-session";
import { IncompleteSaveError } from "../application/edit-recipe";
import {
  collectFacetSuggestions,
  type FacetSuggestion,
} from "../application/list-recipes";
import type { OutlineNode } from "../application/split-outline";
import type { TaxonomyExportPlan } from "../application/types";
import type { Recipe, RecipeLocale } from "../domain/recipe";
import type { CanonicalUnit } from "../domain/unit";
import { ActionMenu } from "./components/ActionMenu";
import { ArchivedRecipesView } from "./components/ArchivedRecipesView";
import { ConvertPreview } from "./components/ConvertPreview";
import { CookingMode } from "./components/CookingMode";
import { Icon } from "./components/Icon";
import { ImportRecipeText } from "./components/ImportRecipeText";
import { NewRecipeForm } from "./components/NewRecipeForm";
import { RecipeCard } from "./components/RecipeCard";
import { RecipeEditor } from "./components/RecipeEditor";
import {
  type CoverSelection,
  RecipeSettingsPanel,
} from "./components/RecipeSettingsPanel";
import { RecipesView } from "./components/RecipesView";
import { TimerDock } from "./components/Timers";
import { ConfirmProvider, useConfirm } from "./confirm";
import { useConfirmDiscard } from "./dirty-guard";
import { errorMessage } from "./error-message";
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
  const reduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("startViewTransition" in document) || reduced) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

// Preview ids for an imported recipe's blocks, before they exist.
const IMPORT_ROOT_ID = "import";

type ActiveView =
  | DraftRecipeInitialView
  | {
      kind: "import-preview";
      outline: OutlineNode;
      text: string;
      source: ConversionSourceNode;
      draft: ConversionDraft;
      detectedLocale?: RecipeLocale;
    }
  | { kind: "recipe-loaded" }
  | { kind: "cooking" }
  | { kind: "settings" }
  | { kind: "archived" }
  | { kind: "edit" };

export function DraftRecipeApp(props: DraftRecipeAppProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  return (
    <ConfirmProvider hostRef={shellRef} cancelLabel={props.messages.cancel}>
      <RecipeApp {...props} shellRef={shellRef} />
    </ConfirmProvider>
  );
}

function RecipeApp({
  controller,
  config,
  messages,
  shellRef,
}: DraftRecipeAppProps & { shellRef: RefObject<HTMLDivElement | null> }) {
  const confirm = useConfirm();
  const confirmDiscard = useConfirmDiscard(messages);

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
  }, [shellRef]);
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
  const [canMoveToLibrary, setCanMoveToLibrary] = useState(false);
  // Bumped to start the editor over from the recipe as it is now.
  const [editSession, setEditSession] = useState(0);
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
          setError(errorMessage(cause, messages));
        }
      }),
    [runExclusive, messages],
  );

  // An archived or deleted recipe takes its unfinished cook (and its
  // timers, which would otherwise keep ringing) with it.
  const forgetCooking = useCallback(
    (id: string) => {
      if (config.graphKey) {
        clearCookingSession(cookingSessionKey(config.graphKey, id));
      }
    },
    [config.graphKey],
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
          setError(messages.errorRecipeNotFound);
          setRecipe(null);
          return null;
        }
        setRecipe(loaded);
        if (resetYield) setTargetYield(loaded.baseYield);
        return loaded;
      } catch (cause) {
        if (loadTokenRef.current === token) {
          setError(errorMessage(cause, messages));
        }
        return undefined;
      }
    },
    [controller, messages],
  );

  const openCookingById = useCallback(
    async (id: string): Promise<void> => {
      setFormDirty(false);
      const loaded = await refreshRecipeById(id, id !== recipe?.id);
      if (loaded) setView({ kind: "cooking" });
      // Deleted in Logseq: its timers in the dock lead nowhere.
      if (loaded === null) forgetCooking(id);
    },
    [recipe?.id, refreshRecipeById, setView, forgetCooking],
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
        setError(errorMessage(cause, messages));
      } finally {
        setRecipesLoaded(true);
      }
    },
    [controller, messages],
  );

  // Whether any recipe's categories and tags are not in their Logseq
  // properties yet: checked on open and after a copy, since every later
  // save mirrors them itself.
  const [taxonomyPlan, setTaxonomyPlan] = useState<TaxonomyExportPlan | null>(
    null,
  );
  // "Not now" hides the notice until the plugin is next opened; the offer
  // stays under More actions.
  const [taxonomyNoticeHidden, setTaxonomyNoticeHidden] = useState(false);
  const refreshTaxonomyPlan = useCallback(async () => {
    if (!controller.planTaxonomyExport) return;
    try {
      setTaxonomyPlan(await controller.planTaxonomyExport());
    } catch {
      // Only an offer: without a plan its menu item isn't shown.
      setTaxonomyPlan(null);
    }
  }, [controller]);
  useEffect(() => {
    void refreshTaxonomyPlan();
  }, [refreshTaxonomyPlan]);

  const plural = (count: number, one: string, other: string) =>
    (new Intl.PluralRules(messages.uiLocale).select(count) === "one"
      ? one
      : other
    ).replace("{count}", String(count));

  // Planned again when chosen, so the question counts what is there now.
  const offerTaxonomyExport = () =>
    void runAction(async () => {
      if (!controller.planTaxonomyExport || !controller.exportTaxonomy) return;
      const exportTaxonomy = controller.exportTaxonomy;
      const plan = await controller.planTaxonomyExport();
      setTaxonomyPlan(plan);
      if (plan.recipeCount === 0) return;
      const pages = [
        [messages.exportTaxonomyNewPages, plan.pagesToCreate],
        [messages.exportTaxonomyExistingPages, plan.pagesToReuse],
        [messages.exportTaxonomyKeptNames, plan.namesKeptInPlugin],
      ] as const;
      confirm(
        {
          message: plural(
            plan.recipeCount,
            messages.exportTaxonomyConfirmOne,
            messages.exportTaxonomyConfirmOther,
          ).replace("{properties}", plan.propertyNames.join(", ")),
          detail:
            pages
              .filter(([, names]) => names.length > 0)
              .map(([label, names]) =>
                label.replace("{pages}", names.join(", ")),
              )
              .join(" · ") || undefined,
          confirmLabel: messages.exportTaxonomyAction,
        },
        () =>
          void runAction(async () => {
            const updated = await exportTaxonomy();
            announce(
              plural(
                updated,
                messages.exportTaxonomyDoneOne,
                messages.exportTaxonomyDoneOther,
              ),
            );
            await refreshTaxonomyPlan();
          }),
      );
    });

  const refreshArchivedRecipes = useCallback(async () => {
    setArchivedRecipesLoaded(false);
    try {
      setError(null);
      setArchivedRecipes(await controller.listArchivedRecipes());
    } catch (cause) {
      setError(errorMessage(cause, messages));
    } finally {
      setArchivedRecipesLoaded(true);
    }
  }, [controller, messages]);

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
  useEffect(() => {
    setCanMoveToLibrary(false);
    if (!recipeId) return undefined;
    let cancelled = false;
    controller.canMoveToRecipeLibrary(recipeId).then(
      (movable) => !cancelled && setCanMoveToLibrary(movable),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [controller, recipeId]);

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
    // Saving a recipe's settings moves its categories and tags too.
    void refreshTaxonomyPlan();
  };

  // Escape does what the screen's Back or Cancel does, and closes the
  // plugin from the top; Cooking Mode handles its own. A menu, suggestion
  // list, drag, or the confirm dialog that used the key marks it handled.
  const leaveScreen = ((): (() => void) => {
    const guarded = (leave: () => void) => () =>
      confirmDiscard(formDirty, leave);
    switch (view.kind) {
      case "create":
      case "archived":
      case "recipe-loaded":
        return backToRecipes;
      case "import-text":
        return guarded(backToRecipes);
      case "import-preview": {
        const text = view.text;
        return guarded(() => setView({ kind: "import-text", text }));
      }
      case "edit":
      case "settings":
        return guarded(() => setView({ kind: "recipe-loaded" }));
      case "cooking":
        return () => undefined;
      default:
        return guarded(controller.close);
    }
  })();
  // Keyboard focus never rests under the sticky Save bar or the timer dock:
  // the browser only scrolls to a field it thinks is off screen, so one
  // already on screen but covered is brought up here, above them (see the
  // scroll-padding in feature-styles.css).
  useEffect(() => {
    const covers = ".draft-recipe-sticky-actions, .draft-recipe-timer-dock";
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest(covers)) return;
      const box = target.getBoundingClientRect();
      const covered = [...document.querySelectorAll(covers)].some((cover) => {
        const over = cover.getBoundingClientRect();
        return (
          box.bottom > over.top &&
          box.top < over.bottom &&
          box.right > over.left &&
          box.left < over.right
        );
      });
      if (covered) target.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const escapeRef = useRef(leaveScreen);
  // At commit, not after paint: a key pressed as the new screen appears must
  // not run the previous screen's Escape.
  useLayoutEffect(() => {
    escapeRef.current = leaveScreen;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        escapeRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
            <Icon name="back" /> {messages.back}
          </button>
        )}
        <button
          type="button"
          className="draft-recipe-close"
          aria-label={messages.close}
          title={messages.close}
          onClick={() => confirmDiscard(formDirty, controller.close)}
        >
          <Icon name="close" />
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
            confirmDiscard(formDirty, () => void openCookingById(id))
          }
        />
      )}
    </div>
  );

  if (view.kind === "create") {
    return shell(
      <NewRecipeForm
        messages={messages}
        locale={config.defaultParserLocale}
        sourceMeasurementSystem={config.defaultSourceMeasurementSystem}
        pending={pending}
        onCancel={backToRecipes}
        onImport={() => setView({ kind: "import-text" })}
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

  if (view.kind === "import-text") {
    return shell(
      <ImportRecipeText
        messages={messages}
        fallbackLocale={config.defaultParserLocale}
        pending={pending}
        onCancel={backToRecipes}
        onDirtyChange={setFormDirty}
        initialText={view.text}
        onImport={(outline, text) => {
          // Previewed in memory: nothing is written until Confirm.
          const source = outlineToSource(outline, IMPORT_ROOT_ID);
          const { draft, detectedLocale } = analyzeWithDetectedLocale(
            source,
            config.defaultParserLocale,
          );
          setView({
            kind: "import-preview",
            outline,
            text,
            source,
            draft,
            ...(detectedLocale ? { detectedLocale } : {}),
          });
        }}
      />,
    );
  }

  if (view.kind === "import-preview") {
    return shell(
      <ConvertPreview
        source={view.source}
        draft={view.draft}
        detectedLocale={view.detectedLocale}
        messages={messages}
        pending={pending}
        notice={messages.importNotice}
        outline={view.outline}
        onCancel={() => setView({ kind: "import-text", text: view.text })}
        onDirtyChange={setFormDirty}
        onConfirm={(resolvedDraft) => {
          void runAction(async () => {
            const id = await controller.commitImportedRecipe(
              view.outline,
              resolvedDraft,
            );
            await openRecipeById(id, true);
          });
        }}
      />,
    );
  }

  if (view.kind === "convert") {
    const rebuild = view.rebuild;
    return shell(
      <ConvertPreview
        source={view.source}
        draft={view.draft}
        detectedLocale={view.detectedLocale}
        messages={messages}
        pending={pending}
        {...(rebuild
          ? { notice: messages.rebuildNotice, outline: rebuild.outline }
          : {})}
        onCancel={controller.close}
        onDirtyChange={setFormDirty}
        onConfirm={(resolvedDraft) => {
          void runAction(async () => {
            if (rebuild) {
              await controller.commitRebuiltConversion(rebuild, resolvedDraft);
            } else {
              await controller.commitConversion(resolvedDraft);
            }
            await openRecipeById(resolvedDraft.rootId, true);
          });
        }}
      />,
    );
  }

  if (view.kind === "already-recipe") {
    return shell(
      <div className="draft-recipe-already-recipe">
        <p>{view.inside ? messages.insideRecipe : messages.alreadyRecipe}</p>
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
        taxonomyInLogseq={Boolean(controller.planTaxonomyExport)}
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
        key={editSession}
        recipe={recipe}
        onReload={() => setEditSession((session) => session + 1)}
        messages={messages}
        pending={pending}
        onCancel={() => setView({ kind: "recipe-loaded" })}
        onDirtyChange={setFormDirty}
        listStepMediaAssets={controller.listStepMediaAssets}
        resolveAssetUrl={controller.resolveAssetUrl}
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
              setError(
                `${messages.saveIncomplete} ${errorMessage(cause.cause, messages)}`,
              );
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
            // Stay here: several recipes are often restored in a row.
            announce(messages.restoredNotice);
          });
        }}
        onDelete={(id) => {
          void runAction(async () => {
            await controller.deleteArchivedRecipe(id);
            forgetCooking(id);
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
            announce(messages.duplicatedNotice);
          });
        }}
        onArchiveRecipe={() => {
          void runAction(async () => {
            await controller.archiveRecipe(recipe.id);
            forgetCooking(recipe.id);
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
        onMoveToRecipeLibrary={
          canMoveToLibrary
            ? () =>
                confirm(
                  {
                    message: messages.moveToRecipeLibraryConfirm,
                    detail: recipe.title,
                    confirmLabel: messages.moveToRecipeLibrary,
                  },
                  () =>
                    void runAction(async () => {
                      await controller.moveToRecipeLibrary(recipe.id);
                      setCanMoveToLibrary(false);
                      announce(messages.movedToLibraryNotice);
                    }),
                )
            : undefined
        }
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
      notice={
        taxonomyPlan &&
        taxonomyPlan.recipeCount > 0 &&
        !taxonomyNoticeHidden && (
          <div className="draft-recipe-library-notice" role="status">
            <p>
              {plural(
                taxonomyPlan.recipeCount,
                messages.taxonomyNoticeOne,
                messages.taxonomyNoticeOther,
              )}
            </p>
            <button type="button" onClick={offerTaxonomyExport}>
              {messages.taxonomyNoticeReview}
            </button>
            <button
              type="button"
              className="draft-recipe-link-button"
              onClick={() => setTaxonomyNoticeHidden(true)}
            >
              {messages.taxonomyNoticeLater}
            </button>
          </div>
        )
      }
      headerActions={
        <>
          <button
            type="button"
            className="draft-recipe-icon-button"
            aria-label={messages.refresh}
            title={messages.refresh}
            onClick={() => void refreshRecipes(true)}
          >
            <Icon name="refresh" />
          </button>
          <ActionMenu
            label={messages.moreActions}
            icon={<Icon name="more" />}
            align="end"
            items={[
              {
                label: messages.archivedRecipes,
                onSelect: () => {
                  setView({ kind: "archived" });
                  void refreshArchivedRecipes();
                },
              },
              ...(taxonomyPlan && taxonomyPlan.recipeCount > 0
                ? [
                    {
                      label: messages.exportTaxonomy,
                      onSelect: offerTaxonomyExport,
                    },
                  ]
                : []),
            ]}
          />
          {/* One control: Create, with its ▾ for the other ways to add. */}
          <div className="draft-recipe-split-button">
            <button
              type="button"
              className="draft-recipe-primary-action"
              onClick={() => setView({ kind: "create" })}
            >
              {messages.createRecipe}
            </button>
            <ActionMenu
              label={messages.moreWaysToAdd}
              icon={<Icon name="chevronDown" />}
              align="end"
              items={[
                {
                  label: messages.importRecipe,
                  onSelect: () => setView({ kind: "import-text" }),
                },
              ]}
            />
          </div>
        </>
      }
    />,
  );
}
