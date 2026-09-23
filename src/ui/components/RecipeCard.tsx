import { useState } from "react";
import type { Recipe } from "../../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../../domain/unit";
import type { UiMessages } from "../i18n";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";
import { CoverImage } from "./CoverImage";
import { IngredientList } from "./IngredientList";
import { ServingControl } from "./ServingControl";
import { StepChildren } from "./StepChildren";

export interface RecipeCardProps {
  recipe: Recipe;
  targetYield: number;
  measurementSystem: MeasurementSystem;
  messages: UiMessages;
  coverUrl?: string | null;
  pending?: boolean;
  ingredientUnitOverrides: Record<string, CanonicalUnit>;
  onIngredientUnitOverrideChange(
    ingredientId: string,
    unit: CanonicalUnit | null,
  ): void;
  onTargetYieldChange(value: number): void;
  onStartCooking?(): void;
  /** A saved Cooking Mode session exists: offer to resume it. */
  cookingInProgress?: boolean;
  resolveAssetUrl?(path: string): Promise<string | null>;
  onEditSettings?(): void;
  onEditRecipe?(): void;
  onDuplicateRecipe?(): void;
  onArchiveRecipe?(): void;
  onOpenInLogseq?(): void;
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
  ingredientUnitOverrides,
  onIngredientUnitOverrideChange,
  onTargetYieldChange,
  onStartCooking,
  cookingInProgress = false,
  resolveAssetUrl,
  onEditSettings,
  onEditRecipe,
  onDuplicateRecipe,
  onArchiveRecipe,
  onOpenInLogseq,
}: RecipeCardProps) {
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const notes = recipe.notes;
  const total = totalMinutes(recipe);
  const sourceUrl = safeSourceUrl(recipe.sourceUrl);
  const sourceText = recipe.sourceUrl?.trim() || undefined;
  const categories = uniqueValues(recipe.categories);
  const tags = uniqueValues(recipe.tags);
  const isNewEmptyRecipe =
    recipe.ingredients.length === 0 && recipe.steps.length === 0;

  const menuItems: ActionMenuItem[] = [
    ...(onDuplicateRecipe
      ? [{ label: messages.duplicateRecipe, onSelect: onDuplicateRecipe }]
      : []),
    ...(onEditSettings
      ? [{ label: messages.editRecipeSettings, onSelect: onEditSettings }]
      : []),
    ...(onOpenInLogseq
      ? [{ label: messages.openInLogseq, onSelect: onOpenInLogseq }]
      : []),
    ...(onArchiveRecipe
      ? [
          {
            label: messages.archiveRecipe,
            danger: true,
            onSelect: () => setConfirmingArchive(true),
          },
        ]
      : []),
  ].map((item) => ({ ...item, disabled: pending }));

  return (
    <article className="draft-recipe-card">
      {coverUrl && (
        <div className="draft-recipe-cover">
          <CoverImage key={coverUrl} src={coverUrl} />
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
          {sourceUrl ? (
            <a
              className="draft-recipe-source-link"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {messages.source}
            </a>
          ) : (
            sourceText && (
              <span className="draft-recipe-source-text">
                {messages.source}: {sourceText}
              </span>
            )
          )}
        </div>
      </header>

      <div className="draft-recipe-card-toolbar">
        {onStartCooking && (
          <button
            type="button"
            className="draft-recipe-primary-action"
            onClick={onStartCooking}
            disabled={pending || recipe.steps.length === 0}
          >
            {cookingInProgress ? messages.resumeCooking : messages.startCooking}
          </button>
        )}
        {onEditRecipe && !isNewEmptyRecipe && (
          <button type="button" onClick={onEditRecipe} disabled={pending}>
            {messages.editRecipe}
          </button>
        )}
        <ServingControl
          value={targetYield}
          messages={messages}
          yieldUnit={recipe.yieldUnit}
          onChange={onTargetYieldChange}
        />
        {menuItems.length > 0 && (
          <ActionMenu label={messages.moreActions} icon="⋯" items={menuItems} />
        )}
      </div>

      {confirmingArchive && (
        <div
          className="draft-recipe-archive-confirm"
          data-testid="archive-confirm"
        >
          <p>
            {messages.archiveRecipeConfirm}
            <br />
            <strong>{recipe.title}</strong>
          </p>
          <div className="draft-recipe-actions">
            <button type="button" onClick={() => setConfirmingArchive(false)}>
              {messages.cancel}
            </button>
            <button
              type="button"
              className="draft-recipe-danger-action"
              onClick={onArchiveRecipe}
              disabled={pending}
            >
              {messages.archiveRecipeConfirmAction}
            </button>
          </div>
        </div>
      )}

      {isNewEmptyRecipe && onEditRecipe && (
        <div className="draft-recipe-empty-state">
          <p>{messages.newRecipeGuidance}</p>
          <button
            type="button"
            className="draft-recipe-primary-action"
            onClick={onEditRecipe}
          >
            {messages.editRecipe}
          </button>
        </div>
      )}

      <IngredientList
        recipe={recipe}
        targetYield={targetYield}
        measurementSystem={measurementSystem}
        messages={messages}
        unitOverrides={ingredientUnitOverrides}
        onUnitOverrideChange={onIngredientUnitOverrideChange}
      />

      <section className="draft-recipe-section">
        <h2>{messages.steps}</h2>
        <ol className="draft-recipe-steps">
          {recipe.steps.map((step) => (
            <li key={step.id}>
              {step.rawText}
              <StepChildren
                items={step.children}
                messages={messages}
                resolveAssetUrl={resolveAssetUrl}
              />
            </li>
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
    </article>
  );
}
