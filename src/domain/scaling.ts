import type { Quantity } from "./quantity";
import type { Ingredient } from "./recipe";

export function servingFactor(baseYield: number, targetYield: number): number {
  if (!Number.isFinite(baseYield) || baseYield <= 0) {
    throw new RangeError("baseYield must be a finite number greater than 0");
  }

  if (!Number.isFinite(targetYield) || targetYield <= 0) {
    throw new RangeError("targetYield must be a finite number greater than 0");
  }

  return targetYield / baseYield;
}

export function scaleAmount(
  amount: number,
  baseYield: number,
  targetYield: number,
): number {
  if (!Number.isFinite(amount)) {
    throw new RangeError("amount must be finite");
  }

  return amount * servingFactor(baseYield, targetYield);
}

export function scaleQuantity(quantity: Quantity, factor: number): Quantity {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError("factor must be a finite number greater than 0");
  }

  switch (quantity.kind) {
    case "exact":
    case "minimum":
    case "maximum":
    case "approximate":
      return { ...quantity, value: quantity.value * factor };
    case "range":
      return {
        kind: "range",
        min: quantity.min * factor,
        max: quantity.max * factor,
      };
    case "inexact":
      return quantity;
  }
}

export function scaleIngredient(
  ingredient: Ingredient,
  baseYield: number,
  targetYield: number,
): Ingredient {
  if (ingredient.amount === undefined || ingredient.scaleMode === "fixed") {
    return ingredient;
  }

  return {
    ...ingredient,
    amount: scaleQuantity(
      ingredient.amount,
      servingFactor(baseYield, targetYield),
    ),
  };
}

export function scaleIngredients(
  ingredients: Ingredient[],
  baseYield: number,
  targetYield: number,
): Ingredient[] {
  return ingredients.map((ingredient) =>
    scaleIngredient(ingredient, baseYield, targetYield),
  );
}
