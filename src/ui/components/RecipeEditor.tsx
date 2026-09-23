import { useEffect, useState } from "react";
import {
  orderDiff,
  type RecipeEditPatch,
  type StepChildrenPatch,
  sectionDiff,
} from "../../application/edit-recipe";
import type { IngredientScaleMode, Recipe } from "../../domain/recipe";
import { assetMarkup } from "../../domain/step-media";
import { confirmDiscardIfDirty, useDirtyReport } from "../dirty-guard";
import type { UiMessages } from "../i18n";
import { type EditableItem, SortableList } from "./SortableList";

export interface RecipeEditorProps {
  recipe: Recipe;
  messages: UiMessages;
  pending?: boolean;
  onSave(patch: RecipeEditPatch): void;
  onCancel(): void;
  // Lets the app shell's global Close button apply the same discard
  // confirmation as this form's own Cancel button, since the shell has no
  // other way to know this form has unsaved changes.
  onDirtyChange?(isDirty: boolean): void;
  // Existing graph assets a step can attach; absent hides the picker.
  listStepMediaAssets?(): Promise<string[]>;
}

function initialItems(
  source: Array<{ id: string; text: string }>,
): EditableItem[] {
  return source.map(({ id, text }) => ({ id, text }));
}

export function RecipeEditor({
  recipe,
  messages,
  pending = false,
  onSave,
  onCancel,
  onDirtyChange,
  listStepMediaAssets,
}: RecipeEditorProps) {
  const [title, setTitle] = useState(recipe.title);
  const [baseYieldText, setBaseYieldText] = useState(String(recipe.baseYield));
  const [yieldUnit, setYieldUnit] = useState(recipe.yieldUnit ?? "");
  const [prepMinutesText, setPrepMinutesText] = useState(
    recipe.prepMinutes !== undefined ? String(recipe.prepMinutes) : "",
  );
  const [chillMinutesText, setChillMinutesText] = useState(
    recipe.chillMinutes !== undefined ? String(recipe.chillMinutes) : "",
  );
  const [cookMinutesText, setCookMinutesText] = useState(
    recipe.cookMinutes !== undefined ? String(recipe.cookMinutes) : "",
  );
  const [sourceUrl, setSourceUrl] = useState(recipe.sourceUrl ?? "");
  const [ingredients, setIngredients] = useState<EditableItem[]>(
    initialItems(
      recipe.ingredients.map((i) => ({ id: i.id, text: i.rawText })),
    ),
  );
  const [steps, setSteps] = useState<EditableItem[]>(
    initialItems(recipe.steps.map((s) => ({ id: s.id, text: s.rawText }))),
  );
  const [notes, setNotes] = useState<EditableItem[]>(
    initialItems(recipe.notes),
  );
  const originalStepChildren = (id: string) =>
    (recipe.steps.find((step) => step.id === id)?.children ?? []).map(
      ({ id: childId, text }) => ({ id: childId, text }),
    );
  const [stepChildren, setStepChildren] = useState<
    Record<string, EditableItem[]>
  >(() =>
    Object.fromEntries(
      recipe.steps.map((step) => [step.id, originalStepChildren(step.id)]),
    ),
  );
  const [mediaAssets, setMediaAssets] = useState<string[]>([]);
  useEffect(() => {
    if (!listStepMediaAssets) return undefined;
    let active = true;
    listStepMediaAssets().then(
      (paths) => active && setMediaAssets(paths),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [listStepMediaAssets]);
  const childrenOf = (stepId: string) => stepChildren[stepId] ?? [];
  const [scaleModeById, setScaleModeById] = useState<
    Record<string, IngredientScaleMode>
  >(() =>
    Object.fromEntries(recipe.ingredients.map((i) => [i.id, i.scaleMode])),
  );

  const baseYield = Number(baseYieldText);
  const baseYieldValid =
    baseYieldText.trim() !== "" && Number.isFinite(baseYield) && baseYield > 0;

  function itemsChanged(
    current: EditableItem[],
    original: Array<{ id: string; text: string }>,
  ): boolean {
    if (current.length !== original.length) return true;
    return current.some(
      (item, index) =>
        item.id !== original[index]?.id || item.text !== original[index]?.text,
    );
  }
  const isDirty =
    title.trim() !== recipe.title ||
    baseYieldText.trim() !== String(recipe.baseYield) ||
    yieldUnit.trim() !== (recipe.yieldUnit ?? "") ||
    prepMinutesText.trim() !==
      (recipe.prepMinutes !== undefined ? String(recipe.prepMinutes) : "") ||
    chillMinutesText.trim() !==
      (recipe.chillMinutes !== undefined ? String(recipe.chillMinutes) : "") ||
    cookMinutesText.trim() !==
      (recipe.cookMinutes !== undefined ? String(recipe.cookMinutes) : "") ||
    sourceUrl.trim() !== (recipe.sourceUrl ?? "") ||
    itemsChanged(
      ingredients,
      recipe.ingredients.map((i) => ({ id: i.id, text: i.rawText })),
    ) ||
    itemsChanged(
      steps,
      recipe.steps.map((s) => ({ id: s.id, text: s.rawText })),
    ) ||
    itemsChanged(notes, recipe.notes) ||
    steps.some((step) =>
      itemsChanged(childrenOf(step.id), originalStepChildren(step.id)),
    ) ||
    recipe.ingredients.some((i) => scaleModeById[i.id] !== i.scaleMode);
  useDirtyReport(isDirty, onDirtyChange);

  function parseMinutesField(text: string): number | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  function minutesFieldValid(text: string): boolean {
    return text.trim() === "" || parseMinutesField(text) !== undefined;
  }
  function minutesPatchValue(
    text: string,
    original: number | undefined,
  ): number | null | undefined {
    const value = parseMinutesField(text);
    if (value === undefined) return original !== undefined ? null : undefined;
    return value !== original ? value : undefined;
  }
  function noBlankItems(items: EditableItem[]): boolean {
    return items.every((item) => item.text.trim() !== "");
  }

  const formValid =
    Boolean(title.trim()) &&
    baseYieldValid &&
    minutesFieldValid(prepMinutesText) &&
    minutesFieldValid(chillMinutesText) &&
    minutesFieldValid(cookMinutesText) &&
    noBlankItems(ingredients) &&
    noBlankItems(steps) &&
    noBlankItems(notes) &&
    steps.every((step) => noBlankItems(childrenOf(step.id)));

  function save() {
    if (!formValid) return;

    const prepMinutes = minutesPatchValue(prepMinutesText, recipe.prepMinutes);
    const chillMinutes = minutesPatchValue(
      chillMinutesText,
      recipe.chillMinutes,
    );
    const cookMinutes = minutesPatchValue(cookMinutesText, recipe.cookMinutes);
    const trimmedSourceUrl = sourceUrl.trim();
    const sourceUrlPatch: string | null | undefined =
      trimmedSourceUrl === (recipe.sourceUrl ?? "")
        ? undefined
        : trimmedSourceUrl ||
          (recipe.sourceUrl !== undefined ? null : undefined);
    const trimmedYieldUnit = yieldUnit.trim();
    const yieldUnitPatch: string | null | undefined =
      trimmedYieldUnit === (recipe.yieldUnit ?? "")
        ? undefined
        : trimmedYieldUnit ||
          (recipe.yieldUnit !== undefined ? null : undefined);

    const remainingIds = new Set(ingredients.map((item) => item.id));
    const scaleModeChanges = Object.entries(scaleModeById)
      .filter(([id, mode]) => {
        if (!remainingIds.has(id)) return false;
        const original =
          recipe.ingredients.find((i) => i.id === id)?.scaleMode ?? "linear";
        return original !== mode;
      })
      .map(([id, scaleMode]) => ({ id, scaleMode }));

    const ingredientOrder = orderDiff(recipe.ingredients, ingredients);
    const stepOrder = orderDiff(recipe.steps, steps);
    const noteOrder = orderDiff(recipe.notes, notes);
    const stepChildrenPatch: StepChildrenPatch[] = steps.flatMap((step) => {
      const original = originalStepChildren(step.id);
      const current = childrenOf(step.id);
      const diff = sectionDiff(original, current);
      const order = orderDiff(original, current);
      const changed =
        diff.added.length + diff.updated.length + diff.removed.length > 0 ||
        order !== undefined;
      return changed
        ? [{ stepId: step.id, diff, ...(order ? { order } : {}) }]
        : [];
    });

    const patch: RecipeEditPatch = {
      ...(title.trim() !== recipe.title ? { title: title.trim() } : {}),
      ...(baseYield !== recipe.baseYield ? { baseYield } : {}),
      ...(yieldUnitPatch !== undefined ? { yieldUnit: yieldUnitPatch } : {}),
      ...(prepMinutes !== undefined ? { prepMinutes } : {}),
      ...(chillMinutes !== undefined ? { chillMinutes } : {}),
      ...(cookMinutes !== undefined ? { cookMinutes } : {}),
      ...(sourceUrlPatch !== undefined ? { sourceUrl: sourceUrlPatch } : {}),
      ingredients: sectionDiff(
        recipe.ingredients.map((i) => ({ id: i.id, text: i.rawText })),
        ingredients,
      ),
      steps: sectionDiff(
        recipe.steps.map((s) => ({ id: s.id, text: s.rawText })),
        steps,
      ),
      notes: sectionDiff(recipe.notes, notes),
      ...(scaleModeChanges.length > 0
        ? { ingredientScaleModeChanges: scaleModeChanges }
        : {}),
      ...(ingredientOrder ? { ingredientOrder } : {}),
      ...(stepOrder ? { stepOrder } : {}),
      ...(noteOrder ? { noteOrder } : {}),
      ...(stepChildrenPatch.length > 0
        ? { stepChildren: stepChildrenPatch }
        : {}),
    };
    onSave(patch);
  }

  return (
    <section className="draft-recipe-card draft-recipe-editor">
      <h1>{messages.editRecipe}</h1>
      <div className="draft-recipe-field-group">
        <label className="draft-recipe-field-wide">
          {messages.title}
          <input
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </label>
        <label>
          {messages.servings}
          <input
            type="number"
            min="0.01"
            step="1"
            value={baseYieldText}
            onChange={(event) => setBaseYieldText(event.currentTarget.value)}
          />
        </label>
        <label>
          {messages.yieldUnit}
          <input
            value={yieldUnit}
            placeholder={messages.yieldUnitHelp}
            onChange={(event) => setYieldUnit(event.currentTarget.value)}
          />
        </label>
      </div>
      <div className="draft-recipe-field-group">
        <label>
          {messages.prepTime}
          <input
            type="number"
            min="0"
            step="1"
            value={prepMinutesText}
            onChange={(event) => setPrepMinutesText(event.currentTarget.value)}
          />
        </label>
        <label>
          {messages.chillTime}
          <input
            type="number"
            min="0"
            step="1"
            value={chillMinutesText}
            onChange={(event) => setChillMinutesText(event.currentTarget.value)}
          />
        </label>
        <label>
          {messages.cookTime}
          <input
            type="number"
            min="0"
            step="1"
            value={cookMinutesText}
            onChange={(event) => setCookMinutesText(event.currentTarget.value)}
          />
        </label>
      </div>
      <div className="draft-recipe-field-group">
        <label>
          {messages.source}
          <input
            type="text"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.currentTarget.value)}
          />
        </label>
      </div>

      <SortableList
        title={messages.ingredients}
        items={ingredients}
        addLabel={messages.addIngredient}
        messages={messages}
        onChange={setIngredients}
        renderItemExtra={(item) => (
          <label className="draft-recipe-scale-toggle">
            <input
              type="checkbox"
              checked={scaleModeById[item.id] === "fixed"}
              onChange={(event) =>
                setScaleModeById((current) => ({
                  ...current,
                  [item.id]: event.currentTarget.checked ? "fixed" : "linear",
                }))
              }
            />
            {messages.doesNotScale}
          </label>
        )}
      />
      <SortableList
        title={messages.steps}
        items={steps}
        addLabel={messages.addStep}
        messages={messages}
        onChange={setSteps}
        renderItemBelow={(step) => {
          const children = childrenOf(step.id);
          return (
            <details
              className="draft-recipe-step-children-editor"
              open={children.length > 0 ? true : undefined}
            >
              <summary>
                {children.length > 0
                  ? `${messages.stepNotes} (${children.length})`
                  : messages.stepNotes}
              </summary>
              <SortableList
                nested
                title={`${messages.stepNotes}: ${step.text}`}
                items={children}
                addLabel={messages.addStepNote}
                messages={messages}
                onChange={(next) =>
                  setStepChildren((current) => ({
                    ...current,
                    [step.id]: next,
                  }))
                }
                renderAddExtra={(add) =>
                  mediaAssets.length > 0 && (
                    <select
                      aria-label={`${messages.attachAsset}: ${step.text}`}
                      value=""
                      onChange={(event) => {
                        const markup = assetMarkup(event.currentTarget.value);
                        if (markup) add(markup);
                      }}
                    >
                      <option value="">{messages.attachAsset}</option>
                      {mediaAssets.map((path) => (
                        <option key={path} value={path}>
                          {path}
                        </option>
                      ))}
                    </select>
                  )
                }
              />
            </details>
          );
        }}
      />
      <SortableList
        title={messages.notes}
        items={notes}
        addLabel={messages.addNote}
        messages={messages}
        onChange={setNotes}
      />

      {(!noBlankItems(ingredients) ||
        !noBlankItems(steps) ||
        !noBlankItems(notes) ||
        steps.some((step) => !noBlankItems(childrenOf(step.id)))) && (
        <p className="draft-recipe-validation-error" role="alert">
          {messages.blankItemError}
        </p>
      )}
      <div className="draft-recipe-actions draft-recipe-sticky-actions">
        <button
          type="button"
          onClick={() =>
            confirmDiscardIfDirty(
              isDirty,
              messages.discardChangesConfirm,
              onCancel,
            )
          }
        >
          {messages.cancel}
        </button>
        <button
          type="button"
          className="draft-recipe-primary-action"
          disabled={!formValid || pending}
          aria-busy={pending}
          onClick={save}
        >
          {pending ? messages.saving : messages.save}
        </button>
      </div>
    </section>
  );
}
