import { useMemo, useState } from "react";
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
}

export function IngredientList({
  recipe,
  targetYield,
  measurementSystem,
  messages,
}: IngredientListProps) {
  const [unitOverrides, setUnitOverrides] = useState<
    Record<string, CanonicalUnit>
  >({});
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
              )
            : null;
          const displayText =
            overrideText ??
            formatIngredientForDisplay(
              ingredient,
              recipe.baseYield,
              targetYield,
              measurementSystem,
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
                    setUnitOverrides((current) => {
                      if (!value) {
                        const next = { ...current };
                        delete next[ingredient.id];
                        return next;
                      }
                      return {
                        ...current,
                        [ingredient.id]: value as CanonicalUnit,
                      };
                    });
                  }}
                >
                  <option value="">{messages.inheritDefault}</option>
                  {options.map((unit) => (
                    <option key={unit} value={unit}>
                      {ingredientUnitOptionLabel(unit)}
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
