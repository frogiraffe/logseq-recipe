import { useEffect, useRef, useState } from "react";
import {
  type CookingTimer,
  clearCookingSession,
  formatRemaining,
  loadCookingSession,
  reconcileCookingSession,
  saveCookingSession,
  type TimerOption,
  timerOptions,
} from "../../application/cooking-session";
import type {
  DurationAnnotation,
  TemperatureAnnotation,
} from "../../domain/annotations";
import type { Recipe } from "../../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../../domain/unit";
import { convertForDisplay } from "../../units/convert";
import { formatMeasurement, unitLabel } from "../../units/format";
import type { UiMessages } from "../i18n";
import { formatQuantity } from "../ingredient-display";
import { requestNotificationPermission } from "../timer-alarms";
import { CoverImage } from "./CoverImage";
import { IngredientList } from "./IngredientList";
import { ServingControl } from "./ServingControl";
import { StepChildren } from "./StepChildren";
import { anyTimerCounting, TimerRow, togglePause, useNow } from "./Timers";

export interface CookingModeProps {
  recipe: Recipe;
  targetYield: number;
  measurementSystem: MeasurementSystem;
  messages: UiMessages;
  coverUrl?: string | null;
  // Same map RecipeCard/IngredientList reads/writes, passed through as-is
  // so a per-ingredient unit choice survives the Recipe Card -> Cooking
  // Mode transition within the same session.
  ingredientUnitOverrides: Record<string, CanonicalUnit>;
  onIngredientUnitOverrideChange(
    ingredientId: string,
    unit: CanonicalUnit | null,
  ): void;
  // Same servings state as the Recipe Card: changing it here rescales the
  // ingredient panel and carries back to the card.
  onTargetYieldChange?(value: number): void;
  /** Persist/resume key (graph + recipe); absent means no resume. */
  sessionKey?: string | null;
  resolveAssetUrl?(path: string): Promise<string | null>;
  onExit(): void;
}

function relationLabel(
  relation: DurationAnnotation["relation"],
  messages: UiMessages,
): string {
  if (relation === "and") return messages.relationAnd;
  if (relation === "or") return messages.relationOr;
  if (relation === "then") return messages.relationThen;
  return "";
}

function durationLabel(
  duration: DurationAnnotation,
  messages: UiMessages,
): string {
  if (duration.value.kind === "inexact") return duration.rawText;
  const unit = duration.unit
    ? ` ${unitLabel(duration.unit, messages.uiLocale)}`
    : "";
  const base = `${formatQuantity(duration.value, messages.uiLocale)}${unit}`;
  if (!duration.conditionText) return base;
  const relation = relationLabel(duration.relation, messages);
  return `${base}${relation ? ` ${relation}` : ""} ${duration.conditionText}`.trim();
}

function temperatureLabel(
  annotation: TemperatureAnnotation,
  system: MeasurementSystem,
  messages: UiMessages,
): string {
  const converted = convertForDisplay(
    annotation.value,
    annotation.unit,
    system,
  );
  const parts: string[] = [];

  if (annotation.ovenMode === "fan") parts.push(messages.fanOven);
  if (annotation.ovenMode === "conventional") {
    parts.push(messages.conventionalOven);
  }
  parts.push(
    formatMeasurement(converted.value, converted.unit, messages.uiLocale),
  );
  if (annotation.preheat) parts.push(messages.preheated);

  return parts.join(" · ");
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLocaleLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

// One button per distinct length: "5 minutes, then another 5 minutes"
// needs a single 05:00 timer, not two identical buttons.
function stepTimerOptions(
  durations: readonly DurationAnnotation[],
): TimerOption[] {
  const seen = new Set<string>();
  return durations.flatMap(timerOptions).filter((option) => {
    const key = `${option.durationMs}:${option.approximate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Keeps the screen awake while cooking (hands are busy); re-acquired when
// the page becomes visible again, because the browser drops it on hide.
function useScreenWakeLock(): void {
  useEffect(() => {
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: {
          request(type: "screen"): Promise<{ release(): Promise<void> }>;
        };
      }
    ).wakeLock;
    if (!wakeLock) return undefined;
    let sentinel: { release(): Promise<void> } | null = null;
    let active = true;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      wakeLock.request("screen").then(
        (lock) => {
          if (active) sentinel = lock;
          else void lock.release().catch(() => undefined);
        },
        () => undefined,
      );
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}

export function CookingMode({
  recipe,
  targetYield,
  measurementSystem,
  messages,
  coverUrl,
  ingredientUnitOverrides,
  onIngredientUnitOverrideChange,
  sessionKey,
  resolveAssetUrl,
  onTargetYieldChange,
  onExit,
}: CookingModeProps) {
  const [restored] = useState(() => {
    const stored = sessionKey ? loadCookingSession(sessionKey) : null;
    return stored ? reconcileCookingSession(stored, recipe) : null;
  });
  const [stepIndex, setStepIndex] = useState(() =>
    Math.max(
      0,
      recipe.steps.findIndex((step) => step.id === restored?.stepId),
    ),
  );
  const [ingredientsOpen, setIngredientsOpen] = useState(
    restored?.ingredientsOpen ?? false,
  );
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(
    () => new Set(restored?.checkedIngredientIds),
  );
  const [timers, setTimers] = useState<CookingTimer[]>(restored?.timers ?? []);
  const [customMinutes, setCustomMinutes] = useState<string | null>(null);
  // Which way the last step change went, so the step slides in from the
  // side it came from.
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const finishedRef = useRef(false);
  const lastIndex = Math.max(0, recipe.steps.length - 1);
  const activeStepIndex = Math.min(stepIndex, lastIndex);
  const current = recipe.steps[activeStepIndex];
  const currentStepId = current?.id;

  // Saved on every change (not only on exit) so a webview reload or plugin
  // unmount resumes too; "Finish cooking" is the only thing that clears it.
  useEffect(() => {
    if (!sessionKey || finishedRef.current) return;
    saveCookingSession(sessionKey, {
      ...(currentStepId ? { stepId: currentStepId } : {}),
      checkedIngredientIds: [...checkedIngredients],
      ingredientsOpen,
      timers,
    });
  }, [sessionKey, currentStepId, checkedIngredients, ingredientsOpen, timers]);

  // A live edit can delete the step a timer belongs to.
  useEffect(() => {
    const stepIds = new Set(recipe.steps.map((step) => step.id));
    setTimers((list) => {
      const kept = list.filter((timer) => stepIds.has(timer.stepId));
      return kept.length === list.length ? list : kept;
    });
  }, [recipe.steps]);

  // Ringing is the alarm service's job (it keeps working after this view
  // closes); here "done" is only ever derived from the clock.
  const now = useNow(anyTimerCounting(timers, Date.now()));

  useScreenWakeLock();

  const startTimer = (durationMs: number, approximate = false) => {
    if (!current) return;
    requestNotificationPermission();
    const startedAt = Date.now();
    const length = `${approximate ? "~" : ""}${formatRemaining(durationMs)}`;
    setTimers((list) => [
      ...list,
      {
        id: `${current.id}:${startedAt}:${list.length}`,
        stepId: current.id,
        label: `${messages.stepProgress} ${activeStepIndex + 1} · ${length}`,
        durationMs,
        endsAt: startedAt + durationMs,
        recipeTitle: recipe.title,
      },
    ]);
  };

  const startCustomTimer = () => {
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    startTimer(Math.round(minutes * 60_000));
    setCustomMinutes(null);
  };
  const removeTimer = (id: string) =>
    setTimers((list) => list.filter((timer) => timer.id !== id));

  const finishCooking = () => {
    finishedRef.current = true;
    if (sessionKey) clearCookingSession(sessionKey);
    onExit();
  };

  const toggleIngredient = (id: string) =>
    setCheckedIngredients((checked) => {
      const next = new Set(checked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // A live native edit can remove an ingredient while its checkbox is
  // checked; drop ids that no longer exist so they can't reappear as a
  // stale, invisible "checked" state if a future ingredient reused the id.
  useEffect(() => {
    const validIds = new Set(
      recipe.ingredients.map((ingredient) => ingredient.id),
    );
    setCheckedIngredients((checked) => {
      const next = new Set([...checked].filter((id) => validIds.has(id)));
      return next.size === checked.size ? checked : next;
    });
  }, [recipe.ingredients]);

  const goToStep = (index: number) => {
    const target = Math.max(0, Math.min(index, lastIndex));
    setDirection(target < activeStepIndex ? "back" : "forward");
    setStepIndex(target);
  };
  const previous = () => goToStep(activeStepIndex - 1);
  const next = () => goToStep(activeStepIndex + 1);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setDirection("back");
        setStepIndex((value) => Math.max(0, Math.min(value, lastIndex) - 1));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setDirection("forward");
        setStepIndex((value) =>
          Math.min(lastIndex, Math.min(value, lastIndex) + 1),
        );
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onExit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lastIndex, onExit]);

  return (
    <section className="draft-recipe-cooking-mode">
      <header className="draft-recipe-cooking-header">
        <div>
          <strong>{recipe.title}</strong>
          <span>{`${Math.min(activeStepIndex + 1, recipe.steps.length)} / ${recipe.steps.length}`}</span>
        </div>
        <div className="draft-recipe-cooking-header-actions">
          {onTargetYieldChange && (
            <ServingControl
              value={targetYield}
              messages={messages}
              yieldUnit={recipe.yieldUnit}
              onChange={onTargetYieldChange}
            />
          )}
          <button
            type="button"
            aria-expanded={ingredientsOpen}
            aria-controls="draft-recipe-cooking-ingredients"
            onClick={() => setIngredientsOpen((value) => !value)}
          >
            {messages.ingredients}
          </button>
          <button type="button" onClick={finishCooking}>
            {messages.finishCooking}
          </button>
          <button type="button" onClick={onExit}>
            {messages.exitCookingForNow}
          </button>
        </div>
      </header>

      {timers.length > 0 && (
        <section
          className="draft-recipe-cooking-timers"
          aria-label={messages.timers}
        >
          <h2>{messages.timers}</h2>
          <ul>
            {timers.map((timer) => (
              <TimerRow
                key={timer.id}
                timer={timer}
                now={now}
                messages={messages}
                onRemove={() => removeTimer(timer.id)}
                onTogglePause={() =>
                  setTimers((list) =>
                    list.map((item) =>
                      item.id === timer.id
                        ? togglePause(item, Date.now())
                        : item,
                    ),
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}

      {coverUrl && (
        <div className="draft-recipe-cooking-cover" data-testid="cooking-cover">
          <CoverImage key={coverUrl} src={coverUrl} />
        </div>
      )}

      {ingredientsOpen && (
        <aside
          className="draft-recipe-cooking-ingredients"
          id="draft-recipe-cooking-ingredients"
        >
          <IngredientList
            recipe={recipe}
            targetYield={targetYield}
            measurementSystem={measurementSystem}
            messages={messages}
            unitOverrides={ingredientUnitOverrides}
            onUnitOverrideChange={onIngredientUnitOverrideChange}
            checked={checkedIngredients}
            onToggleChecked={toggleIngredient}
          />
        </aside>
      )}

      {current ? (
        <main
          className="draft-recipe-current-step"
          key={current.id}
          data-direction={direction}
        >
          <span className="draft-recipe-step-number" aria-hidden="true">
            {activeStepIndex + 1}
          </span>
          <p>{current.rawText}</p>
          <StepChildren
            items={current.children}
            messages={messages}
            resolveAssetUrl={resolveAssetUrl}
          />
          <div className="draft-recipe-annotation-row">
            {current.durations.map((duration) => (
              <span
                className="draft-recipe-annotation"
                key={`duration-${duration.startOffset}-${duration.endOffset}-${duration.rawText}`}
              >
                {durationLabel(duration, messages)}
              </span>
            ))}
            {current.temperatures.map((temperature) => (
              <span
                className="draft-recipe-annotation"
                key={`temperature-${temperature.startOffset}-${temperature.endOffset}-${temperature.rawText}`}
              >
                {temperatureLabel(temperature, measurementSystem, messages)}
              </span>
            ))}
            {current.heat.map((heat) => (
              <span
                className="draft-recipe-annotation"
                key={`heat-${heat.startOffset}-${heat.endOffset}-${heat.rawText}`}
              >
                {heat.rawText}
              </span>
            ))}
          </div>
          <div className="draft-recipe-step-timers">
            {stepTimerOptions(current.durations).map((option) => {
              const length = `${option.approximate ? "~" : ""}${formatRemaining(option.durationMs)}`;
              return (
                <button
                  type="button"
                  className="draft-recipe-timer-start"
                  key={`${option.durationMs}:${option.approximate}`}
                  aria-label={`${messages.startTimer} ${length}`}
                  onClick={() =>
                    startTimer(option.durationMs, option.approximate)
                  }
                >
                  <span aria-hidden="true">⏱</span> {length}
                </button>
              );
            })}
            {customMinutes === null ? (
              <button
                type="button"
                className="draft-recipe-timer-custom"
                onClick={() => setCustomMinutes("")}
              >
                + {messages.addTimer}
              </button>
            ) : (
              <form
                className="draft-recipe-timer-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  startCustomTimer();
                }}
              >
                <input
                  type="number"
                  min="0.5"
                  step="any"
                  inputMode="decimal"
                  aria-label={messages.timerMinutes}
                  placeholder={messages.timerMinutes}
                  value={customMinutes}
                  onChange={(event) =>
                    setCustomMinutes(event.currentTarget.value)
                  }
                  // biome-ignore lint/a11y/noAutofocus: the field appears in response to the cook's own click.
                  autoFocus
                />
                <button type="submit" className="draft-recipe-timer-start">
                  {messages.startTimer}
                </button>
                <button type="button" onClick={() => setCustomMinutes(null)}>
                  {messages.cancel}
                </button>
              </form>
            )}
          </div>
        </main>
      ) : (
        <main className="draft-recipe-current-step">
          <p>{messages.cookingNoSteps}</p>
        </main>
      )}

      {recipe.notes.length > 0 && (
        <aside className="draft-recipe-cooking-notes">
          <h2>{messages.notes}</h2>
          <ul>
            {recipe.notes.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ul>
        </aside>
      )}

      <footer className="draft-recipe-cooking-nav">
        <button
          type="button"
          onClick={previous}
          disabled={activeStepIndex <= 0 || recipe.steps.length === 0}
        >
          {messages.previous}
        </button>
        {/* One segment per step: shows where you are in the sequence and
            jumps straight to any step. */}
        <ol
          className="draft-recipe-step-track"
          aria-label={messages.stepProgress}
        >
          {recipe.steps.map((step, index) => (
            <li key={step.id}>
              <button
                type="button"
                className={
                  index < activeStepIndex
                    ? "draft-recipe-step-segment draft-recipe-step-segment-done"
                    : "draft-recipe-step-segment"
                }
                aria-label={`${messages.stepProgress} ${index + 1}`}
                aria-current={index === activeStepIndex ? "step" : undefined}
                onClick={() => goToStep(index)}
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={next}
          disabled={activeStepIndex >= lastIndex || recipe.steps.length === 0}
        >
          {messages.next}
        </button>
      </footer>
    </section>
  );
}
