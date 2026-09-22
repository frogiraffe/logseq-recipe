import { useEffect, useMemo, useState } from "react";
import type {
  DurationAnnotation,
  TemperatureAnnotation,
} from "../../domain/annotations";
import type { Recipe } from "../../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../../domain/unit";
import { convertForDisplay } from "../../units/convert";
import { formatMeasurement, unitLabel } from "../../units/format";
import { createIngredientConversionProvider } from "../../units/ingredient-registry";
import type { UiMessages } from "../i18n";
import {
  formatIngredientForDisplay,
  formatIngredientForTargetUnit,
  formatQuantity,
  ingredientDisplayUnitOptions,
  ingredientUnitOptionLabel,
} from "../ingredient-display";
import { CoverImage } from "./CoverImage";

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
  const base = `${formatQuantity(duration.value)}${unit}`;
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

export function CookingMode({
  recipe,
  targetYield,
  measurementSystem,
  messages,
  coverUrl,
  ingredientUnitOverrides,
  onIngredientUnitOverrideChange,
  onExit,
}: CookingModeProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(
    () => new Set(),
  );
  const provider = useMemo(
    () =>
      createIngredientConversionProvider(recipe.ingredientConversionOverrides),
    [recipe.ingredientConversionOverrides],
  );
  const lastIndex = Math.max(0, recipe.steps.length - 1);
  const activeStepIndex = Math.min(stepIndex, lastIndex);
  const current = recipe.steps[activeStepIndex];

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

  const previous = () =>
    setStepIndex((value) => Math.max(0, Math.min(value, lastIndex) - 1));
  const next = () =>
    setStepIndex((value) =>
      Math.min(lastIndex, Math.min(value, lastIndex) + 1),
    );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStepIndex((value) => Math.max(0, Math.min(value, lastIndex) - 1));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
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
          <button
            type="button"
            aria-expanded={ingredientsOpen}
            aria-controls="draft-recipe-cooking-ingredients"
            onClick={() => setIngredientsOpen((value) => !value)}
          >
            {messages.ingredients}
          </button>
          <button type="button" aria-label={messages.close} onClick={onExit}>
            ×
          </button>
        </div>
      </header>

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
          <h2>{messages.ingredients}</h2>
          <ul>
            {recipe.ingredients.map((ingredient) => {
              const checked = checkedIngredients.has(ingredient.id);
              const options = ingredientDisplayUnitOptions(
                ingredient,
                provider,
              );
              const override = ingredientUnitOverrides[ingredient.id];
              const overrideText = override
                ? formatIngredientForTargetUnit(
                    ingredient,
                    recipe.baseYield,
                    targetYield,
                    override,
                    provider,
                    messages.uiLocale,
                  )
                : null;
              const displayText =
                overrideText ??
                formatIngredientForDisplay(
                  ingredient,
                  recipe.baseYield,
                  targetYield,
                  measurementSystem,
                  messages.uiLocale,
                );
              return (
                <li key={ingredient.id}>
                  <label
                    className={
                      checked ? "draft-recipe-ingredient-checked" : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIngredient(ingredient.id)}
                    />
                    {displayText}
                  </label>
                  {options.length > 1 && (
                    <select
                      aria-label={`${ingredient.ingredientText} ${messages.measurementSystem}`}
                      value={override ?? ""}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        onIngredientUnitOverrideChange(
                          ingredient.id,
                          value ? (value as CanonicalUnit) : null,
                        );
                      }}
                    >
                      <option value="">{messages.inheritDefault}</option>
                      {options.map((unit) => (
                        <option key={unit} value={unit}>
                          {ingredientUnitOptionLabel(unit, messages.uiLocale)}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      {current ? (
        <main className="draft-recipe-current-step" key={current.id}>
          <p>{current.rawText}</p>
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
        <progress
          aria-label={messages.stepProgress}
          aria-valuetext={`${messages.stepProgress} ${Math.min(activeStepIndex + 1, recipe.steps.length)} / ${recipe.steps.length}`}
          max={Math.max(1, recipe.steps.length)}
          value={recipe.steps.length === 0 ? 0 : activeStepIndex + 1}
        />
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
