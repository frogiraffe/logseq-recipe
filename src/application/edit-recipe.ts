import type { IngredientScaleMode } from "../domain/recipe";
import type { RecipeRepository } from "./recipe-repository";
import type { RecipeSectionRole } from "./types";

export interface SectionDiff {
  added: Array<{ tempId: string; text: string }>;
  updated: Array<{ id: string; text: string }>;
  removed: string[];
}

export interface RecipeEditPatch {
  title?: string;
  baseYield?: number;
  yieldUnit?: string | null;
  prepMinutes?: number | null;
  chillMinutes?: number | null;
  cookMinutes?: number | null;
  sourceUrl?: string | null;
  ingredients: SectionDiff;
  steps: SectionDiff;
  notes: SectionDiff;
  ingredientScaleModeChanges?: Array<{
    id: string;
    scaleMode: IngredientScaleMode;
  }>;
  // Full desired final order, including not-yet-created "new:*" temp ids -
  // commitRecipeEdit maps those to their real created ids before reordering.
  ingredientOrder?: string[];
  stepOrder?: string[];
  noteOrder?: string[];
}

export function sectionDiff(
  original: Array<{ id: string; text: string }>,
  current: Array<{ id: string; text: string }>,
): SectionDiff {
  const originalById = new Map(original.map((item) => [item.id, item.text]));
  const currentIds = new Set(current.map((item) => item.id));
  const added: Array<{ tempId: string; text: string }> = [];
  const updated: Array<{ id: string; text: string }> = [];

  for (const item of current) {
    const text = item.text.trim();
    if (!text) continue;
    if (item.id.startsWith("new:")) {
      added.push({ tempId: item.id, text });
      continue;
    }
    if (originalById.get(item.id) !== text) {
      updated.push({ id: item.id, text });
    }
  }

  const removed = original
    .map((item) => item.id)
    .filter((id) => !currentIds.has(id));

  return { added, updated, removed };
}

/**
 * Compares the persisted order of existing items against the edited order.
 * Reports the full current order (including not-yet-created "new:*" temp
 * ids) whenever existing items changed position or any item was added -
 * a new item always needs explicit positioning since its natural insertion
 * point may not match where the user placed it in the list.
 */
export function orderDiff(
  original: ReadonlyArray<{ id: string }>,
  current: ReadonlyArray<{ id: string }>,
): string[] | undefined {
  const currentIds = current.map((item) => item.id);
  const currentExistingIds = currentIds.filter((id) => !id.startsWith("new:"));
  const currentExistingSet = new Set(currentExistingIds);
  const originalFiltered = original
    .map((item) => item.id)
    .filter((id) => currentExistingSet.has(id));

  const existingReordered =
    currentExistingIds.length !== originalFiltered.length ||
    currentExistingIds.some((id, index) => id !== originalFiltered[index]);
  const hasNewItems = currentIds.length !== currentExistingIds.length;

  return existingReordered || hasNewItems ? currentIds : undefined;
}

async function applySectionDiff(
  repository: RecipeRepository,
  recipeId: string,
  role: RecipeSectionRole,
  diff: SectionDiff,
): Promise<Map<string, string>> {
  for (const id of diff.removed) {
    await repository.removeSectionItem(id);
  }
  for (const update of diff.updated) {
    await repository.updateSectionItem(update.id, update.text);
  }
  const createdIds = new Map<string, string>();
  for (const { tempId, text } of diff.added) {
    const realId = await repository.addSectionItem(recipeId, role, text);
    createdIds.set(tempId, realId);
  }
  return createdIds;
}

function resolveOrder(
  order: string[] | undefined,
  createdIds: ReadonlyMap<string, string>,
): string[] | undefined {
  return order?.map((id) => createdIds.get(id) ?? id);
}

export async function commitRecipeEdit(
  repository: RecipeRepository,
  recipeId: string,
  patch: RecipeEditPatch,
): Promise<void> {
  if (patch.title !== undefined) {
    await repository.renameRecipe(recipeId, patch.title);
  }
  if (
    patch.baseYield !== undefined ||
    patch.yieldUnit !== undefined ||
    patch.prepMinutes !== undefined ||
    patch.chillMinutes !== undefined ||
    patch.cookMinutes !== undefined ||
    patch.sourceUrl !== undefined
  ) {
    await repository.updateRecipeFields(recipeId, {
      ...(patch.baseYield !== undefined ? { baseYield: patch.baseYield } : {}),
      ...(patch.yieldUnit !== undefined ? { yieldUnit: patch.yieldUnit } : {}),
      ...(patch.prepMinutes !== undefined
        ? { prepMinutes: patch.prepMinutes }
        : {}),
      ...(patch.chillMinutes !== undefined
        ? { chillMinutes: patch.chillMinutes }
        : {}),
      ...(patch.cookMinutes !== undefined
        ? { cookMinutes: patch.cookMinutes }
        : {}),
      ...(patch.sourceUrl !== undefined ? { sourceUrl: patch.sourceUrl } : {}),
    });
  }

  const ingredientCreated = await applySectionDiff(
    repository,
    recipeId,
    "ingredients",
    patch.ingredients,
  );
  const stepCreated = await applySectionDiff(
    repository,
    recipeId,
    "steps",
    patch.steps,
  );
  const noteCreated = await applySectionDiff(
    repository,
    recipeId,
    "notes",
    patch.notes,
  );

  for (const change of patch.ingredientScaleModeChanges ?? []) {
    const id = ingredientCreated.get(change.id) ?? change.id;
    await repository.setIngredientScaleMode(id, change.scaleMode);
  }

  const ingredientOrder = resolveOrder(
    patch.ingredientOrder,
    ingredientCreated,
  );
  if (ingredientOrder) await repository.reorderSectionItems(ingredientOrder);
  const stepOrder = resolveOrder(patch.stepOrder, stepCreated);
  if (stepOrder) await repository.reorderSectionItems(stepOrder);
  const noteOrder = resolveOrder(patch.noteOrder, noteCreated);
  if (noteOrder) await repository.reorderSectionItems(noteOrder);
}
