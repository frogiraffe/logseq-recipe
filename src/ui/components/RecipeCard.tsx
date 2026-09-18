import { useState } from "react";
import type { Recipe } from "../../domain/recipe";
import type { MeasurementSystem } from "../../domain/unit";
import type { UiMessages } from "../i18n";
import { IngredientList } from "./IngredientList";
import { ServingControl } from "./ServingControl";

export interface RecipeCardProps {
  recipe: Recipe;
  targetYield: number;
  measurementSystem: MeasurementSystem;
  messages: UiMessages;
  coverUrl?: string | null;
  pending?: boolean;
  onTargetYieldChange(value: number): void;
  onStartCooking?(): void;
  onEditSettings?(): void;
  onEditRecipe?(): void;
  onDuplicateRecipe?(): void;
  onDeleteRecipe?(): void;
}

function timeLabel(
  value: number | undefined,
  minutesUnit: string,
): string | null {
  if (value === undefined) return null;
  return `${value} ${minutesUnit}`;
}

function totalMinutes(recipe: Recipe): number | undefined {
  const values = [recipe.prepMinutes, recipe.chillMinutes, recipe.cookMinutes];
  if (values.every((value) => value === undefined)) return undefined;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function safeSourceUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function RecipeCard({
  recipe,
  targetYield,
  measurementSystem,
  messages,
  coverUrl,
  pending = false,
  onTargetYieldChange,
  onStartCooking,
  onEditSettings,
  onEditRecipe,
  onDuplicateRecipe,
  onDeleteRecipe,
}: RecipeCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const notes = recipe.notes;
  const total = totalMinutes(recipe);
  const sourceUrl = safeSourceUrl(recipe.sourceUrl);
  const categories = uniqueValues(recipe.categories);
  const tags = uniqueValues(recipe.tags);

  return (
    <article className="draft-recipe-card">
      {coverUrl && (
        <div className="draft-recipe-cover">
          <img src={coverUrl} alt="" />
        </div>
      )}

      <header className="draft-recipe-card-header">
        <div>
          <h1>{recipe.title}</h1>
          <div className="draft-recipe-meta-row">
            {recipe.prepMinutes !== undefined && (
              <span>{`${messages.prepTime}: ${timeLabel(recipe.prepMinutes, messages.minutesUnit)}`}</span>
            )}
            {recipe.chillMinutes !== undefined && (
              <span>{`${messages.chillTime}: ${timeLabel(recipe.chillMinutes, messages.minutesUnit)}`}</span>
            )}
            {recipe.cookMinutes !== undefined && (
              <span>{`${messages.cookTime}: ${timeLabel(recipe.cookMinutes, messages.minutesUnit)}`}</span>
            )}
            {total !== undefined && (
              <span>{`${messages.totalTime}: ${timeLabel(total, messages.minutesUnit)}`}</span>
            )}
          </div>
          {(categories.length > 0 || tags.length > 0) && (
            <div className="draft-recipe-classification-row">
              {categories.map((category) => (
                <span className="draft-recipe-category-chip" key={category}>
                  {category}
                </span>
              ))}
              {tags.map((tag) => (
                <span className="draft-recipe-tag-chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          {sourceUrl && (
            <a
              className="draft-recipe-source-link"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {messages.source}
            </a>
          )}
        </div>
        <ServingControl
          value={targetYield}
          messages={messages}
          yieldUnit={recipe.yieldUnit}
          onChange={onTargetYieldChange}
        />
      </header>

      <IngredientList
        recipe={recipe}
        targetYield={targetYield}
        measurementSystem={measurementSystem}
        messages={messages}
      />

      <section className="draft-recipe-section">
        <h2>{messages.steps}</h2>
        <ol className="draft-recipe-steps">
          {recipe.steps.map((step) => (
            <li key={step.id}>{step.rawText}</li>
          ))}
        </ol>
      </section>

      {notes.length > 0 && (
        <section className="draft-recipe-section">
          <h2>{messages.notes}</h2>
          <ul>
            {notes.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ul>
        </section>
      )}

      {confirmingDelete ? (
        <div
          className="draft-recipe-delete-confirm"
          data-testid="delete-confirm"
        >
          <p>
            {messages.deleteRecipeConfirm}
            <br />
            <strong>{recipe.title}</strong>
          </p>
          <div className="draft-recipe-actions">
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              {messages.cancel}
            </button>
            <button
              type="button"
              className="draft-recipe-destructive-action"
              onClick={onDeleteRecipe}
              disabled={pending}
            >
              {messages.deleteRecipeConfirmAction}
            </button>
          </div>
        </div>
      ) : (
        <div className="draft-recipe-actions">
          {onDeleteRecipe && (
            <button
              type="button"
              className="draft-recipe-destructive-action draft-recipe-actions-leading"
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
            >
              {messages.deleteRecipe}
            </button>
          )}
          {onEditRecipe && (
            <button type="button" onClick={onEditRecipe} disabled={pending}>
              {messages.editRecipe}
            </button>
          )}
          {onDuplicateRecipe && (
            <button
              type="button"
              onClick={onDuplicateRecipe}
              disabled={pending}
            >
              {messages.duplicateRecipe}
            </button>
          )}
          {onEditSettings && (
            <button type="button" onClick={onEditSettings} disabled={pending}>
              {messages.editRecipeSettings}
            </button>
          )}
          {onStartCooking && (
            <button
              type="button"
              className="draft-recipe-primary-action"
              onClick={onStartCooking}
              disabled={pending || recipe.steps.length === 0}
            >
              {messages.startCooking}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
