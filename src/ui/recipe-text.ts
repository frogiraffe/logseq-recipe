import { totalMinutes } from "../application/list-recipes";
import type { Recipe } from "../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import { createIngredientConversionProvider } from "../units/ingredient-registry";
import type { UiMessages } from "./i18n";
import {
  ingredientDisplayParts,
  ingredientTargetUnitParts,
  joinIngredientParts,
} from "./ingredient-display";

/**
 * The recipe as plain text, to paste into a message or another app: the
 * amounts as the card shows them (at these servings, in these units), the
 * steps with their notes, and the notes. Photos and audio are left out.
 */
export function recipeText(
  recipe: Recipe,
  targetYield: number,
  system: MeasurementSystem,
  unitOverrides: Record<string, CanonicalUnit>,
  messages: UiMessages,
): string {
  const provider = createIngredientConversionProvider(
    recipe.ingredientConversionOverrides,
  );
  const minutes = (label: string, value: number | undefined) =>
    value === undefined
      ? []
      : [`${label}${messages.colon} ${value} ${messages.minutesUnit}`];
  const times = [
    ...minutes(messages.prepTime, recipe.prepMinutes),
    ...minutes(messages.chillTime, recipe.chillMinutes),
    ...minutes(messages.cookTime, recipe.cookMinutes),
    ...minutes(messages.totalTime, totalMinutes(recipe)),
  ];
  const servings = [
    targetYield.toLocaleString(messages.uiLocale),
    recipe.yieldUnit?.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  const ingredients: string[] = [];
  recipe.ingredients.forEach((ingredient, index) => {
    const group = ingredient.group;
    if (group && recipe.ingredients[index - 1]?.group?.id !== group.id) {
      ingredients.push(
        `${group.title.replace(/\s*:\s*$/, "")}${messages.colon}`,
      );
    }
    const override = unitOverrides[ingredient.id];
    const parts =
      (override &&
        ingredientTargetUnitParts(
          ingredient,
          recipe.baseYield,
          targetYield,
          override,
          provider,
          messages.uiLocale,
        )) ||
      ingredientDisplayParts(
        ingredient,
        recipe.baseYield,
        targetYield,
        system,
        messages.uiLocale,
      );
    ingredients.push(
      `- ${joinIngredientParts(parts)}`,
      ...(ingredient.details ?? []).map((detail) => `   ${detail}`),
    );
  });

  const steps = recipe.steps.flatMap((step, index) => [
    `${index + 1}. ${step.rawText.replace(/\n/g, "\n   ")}`,
    ...(step.children ?? [])
      .filter((child) => child.kind === "note")
      .map((child) => `   - ${child.text}`),
  ]);

  const sections: string[][] = [
    [
      recipe.title,
      `${messages.servings}${messages.colon} ${servings}`,
      ...(times.length > 0 ? [times.join(" · ")] : []),
    ],
    ...(ingredients.length > 0 ? [[messages.ingredients, ...ingredients]] : []),
    ...(steps.length > 0 ? [[messages.steps, ...steps]] : []),
    ...(recipe.notes.length > 0
      ? [[messages.notes, ...recipe.notes.map((note) => `- ${note.text}`)]]
      : []),
    ...(recipe.sourceUrl?.trim()
      ? [[`${messages.source}${messages.colon} ${recipe.sourceUrl.trim()}`]]
      : []),
  ];
  return sections.map((lines) => lines.join("\n")).join("\n\n");
}

/** Copies `text`, falling back to a selection where the Clipboard API is refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}
