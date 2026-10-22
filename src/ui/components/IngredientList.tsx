import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Recipe } from "../../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../../domain/unit";
import { unitLabel } from "../../units/format";
import { createIngredientConversionProvider } from "../../units/ingredient-registry";
import type { UiMessages } from "../i18n";
import {
  defaultDisplayUnit,
  ingredientDisplayParts,
  ingredientDisplayUnitOptions,
  ingredientTargetUnitParts,
  ingredientUnitOptionLabel,
  joinIngredientParts,
  shownAmount,
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
  // Recipe Card: an amount can be clicked to type how much of it the cook
  // has; the servings follow.
  onScaleTo?(targetYield: number): void;
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
  onScaleTo,
}: IngredientListProps) {
  const provider = useMemo(
    () =>
      createIngredientConversionProvider(recipe.ingredientConversionOverrides),
    [recipe.ingredientConversionOverrides],
  );
  const checkable = Boolean(checked && onToggleChecked);
  // `seed` is the amount the field opened with: leaving it as it was
  // changes nothing, though it is rounded.
  const [scaling, setScaling] = useState<{
    id: string;
    text: string;
    seed: string;
  } | null>(null);
  // Escape leaves the field without the blur that follows applying it.
  const cancelled = useRef(false);
  // After Enter or Escape, focus goes back to the amount that was edited.
  const amountButtons = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (scaling || !refocus.current) return;
    amountButtons.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [scaling]);
  const scaleTo = (shown: { value: number }, text: string, seed: string) => {
    setScaling(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const value = Number(text.replace(",", "."));
    if (text.trim() === seed || !Number.isFinite(value) || value <= 0) return;
    onScaleTo?.(
      Math.max(
        0.01,
        Math.round(((targetYield * value) / shown.value) * 100) / 100,
      ),
    );
  };

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
        {recipe.ingredients.map((ingredient, index) => {
          // The "use default" choice is labelled with the unit it shows
          // ("g", not "Use default"), and that unit isn't listed again:
          // picking it simply returns to the default.
          const autoUnit = defaultDisplayUnit(
            ingredient,
            recipe.baseYield,
            targetYield,
            measurementSystem,
          );
          const options = ingredientDisplayUnitOptions(
            ingredient,
            provider,
          ).filter((unit) => unit !== autoUnit);
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
          const shown =
            onScaleTo && !checkable
              ? shownAmount(
                  ingredient,
                  recipe.baseYield,
                  targetYield,
                  measurementSystem,
                  override,
                  provider,
                )
              : null;
          const named = (template: string) =>
            template.replace("{ingredient}", () => ingredient.ingredientText);
          const quantity =
            shown && scaling?.id === ingredient.id ? (
              <span className="draft-recipe-quantity draft-recipe-scale-to">
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  aria-label={named(messages.scaleToIngredientAmount)}
                  value={scaling.text}
                  // biome-ignore lint/a11y/noAutofocus: the field replaces the amount the cook just clicked.
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) =>
                    setScaling({
                      ...scaling,
                      text: event.currentTarget.value,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== "Escape") {
                      return;
                    }
                    event.preventDefault();
                    cancelled.current = event.key === "Escape";
                    refocus.current = ingredient.id;
                    event.currentTarget.blur();
                  }}
                  onBlur={(event) =>
                    scaleTo(shown, event.currentTarget.value, scaling.seed)
                  }
                />
                {shown.unit && shown.unit !== "egg" && (
                  <span>{unitLabel(shown.unit, messages.uiLocale, 2)}</span>
                )}
              </span>
            ) : shown ? (
              <button
                type="button"
                className="draft-recipe-quantity draft-recipe-scale-button"
                title={named(messages.scaleToIngredient)}
                aria-label={`${parts.quantity}: ${named(messages.scaleToIngredient)}`}
                ref={(button) => {
                  if (button) amountButtons.current.set(ingredient.id, button);
                  else amountButtons.current.delete(ingredient.id);
                }}
                onClick={() => {
                  cancelled.current = false;
                  const seed = String(Math.round(shown.value * 100) / 100);
                  setScaling({ id: ingredient.id, text: seed, seed });
                }}
              >
                {parts.quantity}
              </button>
            ) : (
              <span className="draft-recipe-quantity">{parts.quantity}</span>
            );
          const text = (
            <>
              {quantity}{" "}
              <span className="draft-recipe-ingredient-name">
                {parts.name}
                {ingredient.details && (
                  <small className="draft-recipe-ingredient-details">
                    {ingredient.details.join("\n")}
                  </small>
                )}
              </span>
            </>
          );

          // A group's heading opens its run of ingredients; it stays a row of
          // this one grid so amounts align across groups.
          const group = ingredient.group;
          const startsGroup =
            group !== undefined &&
            recipe.ingredients[index - 1]?.group?.id !== group.id;

          return (
            <Fragment key={ingredient.id}>
              {startsGroup && (
                <li className="draft-recipe-ingredient-group">
                  <h3>{group.title.replace(/\s*:\s*$/, "")}</h3>
                </li>
              )}
              <li
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
                {options.length > 0 && (
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
                    <option value="">
                      {autoUnit
                        ? ingredientUnitOptionLabel(autoUnit, messages.uiLocale)
                        : messages.inheritDefault}
                    </option>
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
            </Fragment>
          );
        })}
      </ul>
    </section>
  );
}
