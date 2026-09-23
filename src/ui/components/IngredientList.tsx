import { useMemo } from "react";
import type { Recipe } from "../../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../../domain/unit";
import { createIngredientConversionProvider } from "../../units/ingredient-registry";
import type { UiMessages } from "../i18n";
import {
  ingredientDisplayParts,
  ingredientDisplayUnitOptions,
  ingredientTargetUnitParts,
  ingredientUnitOptionLabel,
  joinIngredientParts,
} from "../ingredient-display";

export interface IngredientListProps {
  recipe: Recipe;
  targetYield: number;
  measurementSystem: MeasurementSystem;
  messages: UiMessages;
  // Lifted to the app shell so a per-ingredient display-unit choice survives
  // switching from the Recipe Card into Cooking Mode in the same session.
  unitOverrides: Record<string, CanonicalUnit>;
  onUnitOverrideChange(ingredientId: string, unit: CanonicalUnit | null): void;
  // Cooking Mode: each row becomes a checkbox for "already added".
  checked?: ReadonlySet<string>;
  onToggleChecked?(ingredientId: string): void;
}

export function IngredientList({
  recipe,
  targetYield,
  measurementSystem,
  messages,
  unitOverrides,
  onUnitOverrideChange,
  checked,
  onToggleChecked,
}: IngredientListProps) {
  const provider = useMemo(
    () =>
      createIngredientConversionProvider(recipe.ingredientConversionOverrides),
    [recipe.ingredientConversionOverrides],
  );
  const checkable = Boolean(checked && onToggleChecked);

  return (
    <section className="draft-recipe-section">
      <h2>{messages.ingredients}</h2>
      <ul
        className={
          checkable
            ? "draft-recipe-ingredients draft-recipe-ingredients-checkable"
            : "draft-recipe-ingredients"
        }
      >
        {recipe.ingredients.map((ingredient) => {
          const options = ingredientDisplayUnitOptions(ingredient, provider);
          const override = unitOverrides[ingredient.id];
          const overrideParts = override
            ? ingredientTargetUnitParts(
                ingredient,
                recipe.baseYield,
                targetYield,
                override,
                provider,
                messages.uiLocale,
              )
            : null;
          const parts =
            overrideParts ??
            ingredientDisplayParts(
              ingredient,
              recipe.baseYield,
              targetYield,
              measurementSystem,
              messages.uiLocale,
            );
          const isChecked = checked?.has(ingredient.id) ?? false;
          const text = (
            <>
              <span className="draft-recipe-quantity">{parts.quantity}</span>{" "}
              <span className="draft-recipe-ingredient-name">{parts.name}</span>
            </>
          );

          return (
            <li
              key={ingredient.id}
              className={
                isChecked
                  ? "draft-recipe-ingredient-row draft-recipe-ingredient-checked"
                  : "draft-recipe-ingredient-row"
              }
            >
              {checkable ? (
                <label className="draft-recipe-ingredient-line">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    aria-label={joinIngredientParts(parts)}
                    onChange={() => onToggleChecked?.(ingredient.id)}
                  />
                  {text}
                </label>
              ) : (
                <span className="draft-recipe-ingredient-line">{text}</span>
              )}
              {options.length > 1 && (
                <select
                  className="draft-recipe-unit-picker"
                  aria-label={`${ingredient.ingredientText} ${messages.measurementSystem}`}
                  value={override ?? ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onUnitOverrideChange(
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
              {override && overrideParts === null && (
                <small>{messages.conversionUnavailable}</small>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
