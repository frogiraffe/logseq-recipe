import { useMemo } from "react";
import type { Recipe } from "../../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../../domain/unit";
import { createIngredientConversionProvider } from "../../units/ingredient-registry";
import type { UiMessages } from "../i18n";
import {
  formatIngredientForDisplay,
  formatIngredientForTargetUnit,
  ingredientDisplayUnitOptions,
  ingredientUnitOptionLabel,
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
}

export function IngredientList({
  recipe,
  targetYield,
  measurementSystem,
  messages,
  unitOverrides,
  onUnitOverrideChange,
}: IngredientListProps) {
  const provider = useMemo(
    () =>
      createIngredientConversionProvider(recipe.ingredientConversionOverrides),
    [recipe.ingredientConversionOverrides],
  );

  return (
    <section className="draft-recipe-section">
      <h2>{messages.ingredients}</h2>
      <ul className="draft-recipe-ingredients">
        {recipe.ingredients.map((ingredient) => {
          const options = ingredientDisplayUnitOptions(ingredient, provider);
          const override = unitOverrides[ingredient.id];
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
            <li key={ingredient.id} className="draft-recipe-ingredient-row">
              <span>{displayText}</span>
              {options.length > 1 && (
                <select
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
              {override && overrideText === null && (
                <small>{messages.conversionUnavailable}</small>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
