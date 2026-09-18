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
  ingredients: SectionDiff;
  steps: SectionDiff;
  notes: SectionDiff;
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
  if (patch.baseYield !== undefined || patch.yieldUnit !== undefined) {
    await repository.updateRecipeYield(recipeId, {
      ...(patch.baseYield !== undefined ? { baseYield: patch.baseYield } : {}),
      ...(patch.yieldUnit !== undefined ? { yieldUnit: patch.yieldUnit } : {}),
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
}
