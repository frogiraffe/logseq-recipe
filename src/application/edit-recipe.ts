import type { IngredientScaleMode } from "../domain/recipe";
import type { RecipeRepository } from "./recipe-repository";
import type { RecipeSectionRole } from "./types";

export interface SectionDiff {
  added: string[];
  updated: Array<{ id: string; text: string }>;
  removed: string[];
}

export interface RecipeEditPatch {
  title?: string;
  baseYield?: number;
  yieldUnit?: string;
  prepMinutes?: number;
  chillMinutes?: number;
  cookMinutes?: number;
  sourceUrl?: string;
  ingredients: SectionDiff;
  steps: SectionDiff;
  notes: SectionDiff;
  ingredientScaleModeChanges?: Array<{
    id: string;
    scaleMode: IngredientScaleMode;
  }>;
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
  const added: string[] = [];
  const updated: Array<{ id: string; text: string }> = [];

  for (const item of current) {
    const text = item.text.trim();
    if (!text) continue;
    if (item.id.startsWith("new:")) {
      added.push(text);
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
 * Newly added items (ids not yet persisted) and removed items are ignored -
 * this only reports a reorder when items that exist in both lists actually
 * changed position relative to each other.
 */
export function orderDiff(
  original: ReadonlyArray<{ id: string }>,
  current: ReadonlyArray<{ id: string }>,
): string[] | undefined {
  const currentExistingIds = current
    .map((item) => item.id)
    .filter((id) => !id.startsWith("new:"));
  const currentExistingSet = new Set(currentExistingIds);
  const originalFiltered = original
    .map((item) => item.id)
    .filter((id) => currentExistingSet.has(id));

  const changed =
    currentExistingIds.length !== originalFiltered.length ||
    currentExistingIds.some((id, index) => id !== originalFiltered[index]);

  return changed ? currentExistingIds : undefined;
}

async function applySectionDiff(
  repository: RecipeRepository,
  recipeId: string,
  role: RecipeSectionRole,
  diff: SectionDiff,
): Promise<void> {
  for (const id of diff.removed) {
    await repository.removeSectionItem(id);
  }
  for (const update of diff.updated) {
    await repository.updateSectionItem(update.id, update.text);
  }
  for (const text of diff.added) {
    await repository.addSectionItem(recipeId, role, text);
  }
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
  await applySectionDiff(
    repository,
    recipeId,
    "ingredients",
    patch.ingredients,
  );
  await applySectionDiff(repository, recipeId, "steps", patch.steps);
  await applySectionDiff(repository, recipeId, "notes", patch.notes);

  for (const change of patch.ingredientScaleModeChanges ?? []) {
    await repository.setIngredientScaleMode(change.id, change.scaleMode);
  }
  if (patch.ingredientOrder) {
    await repository.reorderSectionItems(patch.ingredientOrder);
  }
  if (patch.stepOrder) {
    await repository.reorderSectionItems(patch.stepOrder);
  }
  if (patch.noteOrder) {
    await repository.reorderSectionItems(patch.noteOrder);
  }
}
