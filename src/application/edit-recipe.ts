import type { IngredientScaleMode } from "../domain/recipe";
import { hasUnsafeMediaMarkup } from "../domain/step-media";
import { RecipeError } from "./errors";
import type { RecipeRepository } from "./recipe-repository";
import { type IngredientLayoutEntry, RECIPE_SECTION_ROLES } from "./types";

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
  // Replaces ingredientOrder once groups are involved: the full final
  // arrangement of ingredients and group headings (temp ids allowed).
  ingredientLayout?: IngredientLayoutEntry[];
  stepOrder?: string[];
  noteOrder?: string[];
  // Per-step notes/attachments; `stepId` may be a "new:*" temp id for a
  // step created in the same save.
  stepChildren?: StepChildrenPatch[];
}

export interface StepChildrenPatch {
  stepId: string;
  diff: SectionDiff;
  order?: string[];
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

/**
 * Drops what a patch says about lines that no longer exist - removed in
 * Logseq while the editor was open. Updating, moving, or removing a deleted
 * block would only fail the save; lines added in this save ("new:*") stay.
 */
export function withoutMissingLines(
  patch: RecipeEditPatch,
  exists: (id: string) => boolean,
): RecipeEditPatch {
  const keep = (id: string) => id.startsWith("new:") || exists(id);
  const diff = (section: SectionDiff): SectionDiff => ({
    added: section.added,
    updated: section.updated.filter((update) => keep(update.id)),
    removed: section.removed.filter(keep),
  });
  const order = (ids: string[] | undefined) =>
    ids ? { value: ids.filter(keep) } : undefined;
  const ingredientOrder = order(patch.ingredientOrder);
  const stepOrder = order(patch.stepOrder);
  const noteOrder = order(patch.noteOrder);
  return {
    ...patch,
    ingredients: diff(patch.ingredients),
    steps: diff(patch.steps),
    notes: diff(patch.notes),
    ...(patch.ingredientScaleModeChanges
      ? {
          ingredientScaleModeChanges: patch.ingredientScaleModeChanges.filter(
            (change) => keep(change.id),
          ),
        }
      : {}),
    ...(ingredientOrder ? { ingredientOrder: ingredientOrder.value } : {}),
    ...(stepOrder ? { stepOrder: stepOrder.value } : {}),
    ...(noteOrder ? { noteOrder: noteOrder.value } : {}),
    ...(patch.ingredientLayout
      ? {
          // A group left with no ingredient stays where it is.
          ingredientLayout: patch.ingredientLayout
            .filter((entry) => keep(entry.id))
            .map((entry) =>
              entry.items
                ? { ...entry, items: entry.items.filter(keep) }
                : entry,
            )
            .filter((entry) => !entry.items || entry.items.length > 0),
        }
      : {}),
    ...(patch.stepChildren
      ? {
          stepChildren: patch.stepChildren
            .filter((entry) => keep(entry.stepId))
            .map((entry) => ({
              ...entry,
              diff: diff(entry.diff),
              ...(entry.order ? { order: entry.order.filter(keep) } : {}),
            })),
        }
      : {}),
  };
}

/**
 * Thrown when a write failed after at least one earlier write succeeded: the
 * graph now holds part of the edit, so the caller must reload from Logseq
 * rather than trust either the old or the edited state.
 */
export class IncompleteSaveError extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "IncompleteSaveError";
  }
}

const ORDER_KEYS = {
  ingredients: "ingredientOrder",
  steps: "stepOrder",
  notes: "noteOrder",
} as const;

/** Pure checks that must pass before the first write. Throws RangeError. */
function validateRecipeEdit(patch: RecipeEditPatch): void {
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new RecipeError("title-required", "Recipe title is required.");
  }
  if (
    patch.baseYield !== undefined &&
    (!Number.isFinite(patch.baseYield) || patch.baseYield <= 0)
  ) {
    throw new RecipeError(
      "base-yield-invalid",
      "Recipe base yield must be positive.",
    );
  }
  for (const value of [
    patch.prepMinutes,
    patch.chillMinutes,
    patch.cookMinutes,
  ]) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      throw new RecipeError(
        "time-invalid",
        "Recipe time fields must be zero or positive.",
      );
    }
  }
  const lists = [
    ...RECIPE_SECTION_ROLES.map((key) => ({
      name: key,
      diff: patch[key],
      order: patch[ORDER_KEYS[key]],
    })),
    ...(patch.stepChildren ?? []).map((entry) => ({
      name: "step notes",
      diff: entry.diff,
      order: entry.order,
    })),
  ];
  for (const { name, diff, order } of lists) {
    for (const { text } of [...diff.added, ...diff.updated]) {
      if (hasUnsafeMediaMarkup(text)) {
        throw new RangeError(
          `Only images and audio inside this graph's assets folder can be attached: ${text}`,
        );
      }
    }
    if (!order) continue;
    const removed = new Set(diff.removed);
    if (new Set(order).size !== order.length) {
      throw new RangeError(`Duplicate item in ${name} order.`);
    }
    if (order.some((id) => removed.has(id))) {
      throw new RangeError(`Removed item still present in ${name} order.`);
    }
  }
  const layout = patch.ingredientLayout;
  if (layout) {
    if (layout.some((entry) => entry.items?.length === 0)) {
      throw new RangeError(
        "An ingredient group needs at least one ingredient.",
      );
    }
    const ids = layout.flatMap((entry) => [entry.id, ...(entry.items ?? [])]);
    const removed = new Set(patch.ingredients.removed);
    if (new Set(ids).size !== ids.length) {
      throw new RangeError("Duplicate item in ingredients layout.");
    }
    if (ids.some((id) => removed.has(id))) {
      throw new RangeError("Removed item still present in ingredients layout.");
    }
  }
}

function resolveOrder(
  order: string[] | undefined,
  createdIds: ReadonlyMap<string, string>,
): string[] | undefined {
  return order?.map((id) => createdIds.get(id) ?? id);
}

/**
 * Validates everything first, then writes in the order that loses the least
 * on failure: additions, updates, title/fields, ordering, and removals last -
 * so an interrupted save never destroys content it hasn't replaced yet.
 */
export async function commitRecipeEdit(
  repository: RecipeRepository,
  recipeId: string,
  patch: RecipeEditPatch,
): Promise<void> {
  validateRecipeEdit(patch);
  if (patch.title !== undefined) {
    await repository.validateRename(recipeId, patch.title);
  }

  let wrote = false;
  async function write(operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (cause) {
      throw wrote ? new IncompleteSaveError(cause) : cause;
    }
    wrote = true;
  }

  // Temp ids are only unique within one list (every editor list counts
  // "new:1", "new:2", ...), so each list resolves through its own map.
  const created = {
    ingredients: new Map<string, string>(),
    steps: new Map<string, string>(),
    notes: new Map<string, string>(),
  };
  for (const key of RECIPE_SECTION_ROLES) {
    for (const { tempId, text } of patch[key].added) {
      await write(async () => {
        created[key].set(
          tempId,
          await repository.addSectionItem(recipeId, key, text),
        );
      });
    }
  }
  const stepChildren = patch.stepChildren ?? [];
  const childCreated = stepChildren.map(() => new Map<string, string>());
  for (const [index, entry] of stepChildren.entries()) {
    const stepId = created.steps.get(entry.stepId) ?? entry.stepId;
    for (const { tempId, text } of entry.diff.added) {
      await write(async () => {
        childCreated[index].set(
          tempId,
          await repository.addStepChild(stepId, text),
        );
      });
    }
  }
  const updates = [
    ...RECIPE_SECTION_ROLES.flatMap((key) => patch[key].updated),
    ...stepChildren.flatMap((entry) => entry.diff.updated),
  ];
  for (const update of updates) {
    await write(() => repository.updateSectionItem(update.id, update.text));
  }
  const title = patch.title;
  if (title !== undefined) {
    await write(() => repository.renameRecipe(recipeId, title));
  }
  const fields = {
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
  };
  if (Object.keys(fields).length > 0) {
    await write(() => repository.updateRecipeFields(recipeId, fields));
  }
  for (const change of patch.ingredientScaleModeChanges ?? []) {
    const id = created.ingredients.get(change.id) ?? change.id;
    await write(() => repository.setIngredientScaleMode(id, change.scaleMode));
  }

  const orders = [
    ...RECIPE_SECTION_ROLES.map((key) =>
      resolveOrder(patch[ORDER_KEYS[key]], created[key]),
    ),
    ...stepChildren.map((entry, index) =>
      resolveOrder(entry.order, childCreated[index]),
    ),
  ];
  for (const order of orders) {
    if (order) await write(() => repository.reorderSectionItems(order));
  }
  const layout = patch.ingredientLayout?.map((entry) => ({
    id: created.ingredients.get(entry.id) ?? entry.id,
    ...(entry.items
      ? {
          items: entry.items.map((id) => created.ingredients.get(id) ?? id),
        }
      : {}),
  }));
  if (layout) {
    await write(() => repository.arrangeIngredients(recipeId, layout));
  }

  // Reversed, so a removed group's ingredients go before its heading
  // (removing the heading first would already have taken them with it).
  const removals = [
    ...stepChildren.flatMap((entry) => entry.diff.removed),
    ...RECIPE_SECTION_ROLES.flatMap((key) => [...patch[key].removed].reverse()),
  ];
  for (const id of removals) {
    await write(() => repository.removeSectionItem(id));
  }
}
