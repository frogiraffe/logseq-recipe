import { useEffect, useState } from "react";
import {
  orderDiff,
  type RecipeEditPatch,
  type StepChildrenPatch,
  sectionDiff,
  withoutMissingLines,
} from "../../application/edit-recipe";
import type { IngredientLayoutEntry } from "../../application/types";
import type {
  Ingredient,
  IngredientScaleMode,
  Recipe,
} from "../../domain/recipe";
import { assetMarkup, parseStepChild } from "../../domain/step-media";
import { useConfirmDiscard, useDirtyReport } from "../dirty-guard";
import type { UiMessages } from "../i18n";
import { type EditableItem, SortableList } from "./SortableList";
import { StepMedia } from "./StepChildren";

export interface RecipeEditorProps {
  // Kept live: the editor edits the version it opened with, and only warns
  // (and skips lines deleted since) when this changes underneath it.
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
  // Starts over from the recipe as it is now (after it changed in Logseq).
  onReload?(): void;
  // Shows a step's attached photo or audio as the file itself.
  resolveAssetUrl?(path: string): Promise<string | null>;
}

function initialItems(
  source: Array<{ id: string; text: string }>,
): EditableItem[] {
  return source.map(({ id, text }) => ({ id, text }));
}

// Ingredients as the editor lists them: each group's heading row, then its
// ingredients.
function ingredientItems(ingredients: readonly Ingredient[]): EditableItem[] {
  return ingredients.flatMap((ingredient, index) => {
    const group = ingredient.group;
    const opensGroup =
      group !== undefined && ingredients[index - 1]?.group?.id !== group.id;
    return [
      ...(opensGroup
        ? [{ id: group.id, text: group.title, heading: true }]
        : []),
      { id: ingredient.id, text: ingredient.rawText },
    ];
  });
}

// A heading owns the rows after it, up to the next heading.
function ingredientLayout(
  items: readonly EditableItem[],
): IngredientLayoutEntry[] {
  const layout: IngredientLayoutEntry[] = [];
  let group: IngredientLayoutEntry | undefined;
  for (const item of items) {
    if (item.heading) {
      group = { id: item.id, items: [] };
      layout.push(group);
    } else if (group) {
      group.items?.push(item.id);
    } else {
      layout.push({ id: item.id });
    }
  }
  return layout;
}

// A group of one line reads back as a group only with a colon ("Garnish:"
// over "parsley"); without it that line would read as a note under an
// ingredient named "Garnish". Larger groups need none.
function withReadableHeadings(items: readonly EditableItem[]): EditableItem[] {
  return items.map((item, index) => {
    const text = item.text.trim();
    const onlyItem =
      items[index + 1] !== undefined &&
      !items[index + 1].heading &&
      (items[index + 2] === undefined || items[index + 2].heading);
    return item.heading && onlyItem && !text.endsWith(":")
      ? { ...item, text: `${text}:` }
      : item;
  });
}

// What the editor shows and saves, to tell a real change made elsewhere
// from a reload that changed nothing.
function editableContent(recipe: Recipe): string {
  return JSON.stringify([
    recipe.title,
    recipe.baseYield,
    recipe.yieldUnit,
    recipe.prepMinutes,
    recipe.chillMinutes,
    recipe.cookMinutes,
    recipe.sourceUrl,
    recipe.ingredients.map((i) => [i.id, i.rawText, i.scaleMode, i.group]),
    recipe.steps.map((s) => [
      s.id,
      s.rawText,
      (s.children ?? []).map((child) => [child.id, child.text]),
    ]),
    recipe.notes,
  ]);
}

function lineIds(recipe: Recipe): Set<string> {
  return new Set([
    ...recipe.ingredients.flatMap((i) => [
      i.id,
      ...(i.group ? [i.group.id] : []),
    ]),
    ...recipe.steps.flatMap((s) => [
      s.id,
      ...(s.children ?? []).map((child) => child.id),
    ]),
    ...recipe.notes.map((note) => note.id),
  ]);
}

const TIME_FIELDS = [
  ["prepMinutes", "prepTime"],
  ["chillMinutes", "chillTime"],
  ["cookMinutes", "cookTime"],
] as const;
type TimeField = (typeof TIME_FIELDS)[number][0];

function minutesText(value: number | undefined): string {
  return value !== undefined ? String(value) : "";
}

function hasEmptyGroup(items: readonly EditableItem[]): boolean {
  return items.some(
    (item, index) =>
      item.heading && (index === items.length - 1 || items[index + 1].heading),
  );
}

export function RecipeEditor({
  recipe: live,
  messages,
  pending = false,
  onSave,
  onCancel,
  onDirtyChange,
  listStepMediaAssets,
  onReload,
  resolveAssetUrl,
}: RecipeEditorProps) {
  const confirmDiscard = useConfirmDiscard(messages);
  // Every change is measured against the version the editor opened with: a
  // line added in Logseq meanwhile is not one this edit removed.
  const [recipe] = useState(live);
  const [openedContent] = useState(() => editableContent(live));
  const changedElsewhere = editableContent(live) !== openedContent;
  const [title, setTitle] = useState(recipe.title);
  const [baseYieldText, setBaseYieldText] = useState(String(recipe.baseYield));
  const [yieldUnit, setYieldUnit] = useState(recipe.yieldUnit ?? "");
  const [minutesTexts, setMinutesTexts] = useState(
    () =>
      Object.fromEntries(
        TIME_FIELDS.map(([field]) => [field, minutesText(recipe[field])]),
      ) as Record<TimeField, string>,
  );
  const [sourceUrl, setSourceUrl] = useState(recipe.sourceUrl ?? "");
  const originalIngredients = ingredientItems(recipe.ingredients);
  const [ingredients, setIngredients] =
    useState<EditableItem[]>(originalIngredients);
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
    TIME_FIELDS.some(
      ([field]) => minutesTexts[field].trim() !== minutesText(recipe[field]),
    ) ||
    sourceUrl.trim() !== (recipe.sourceUrl ?? "") ||
    itemsChanged(ingredients, originalIngredients) ||
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
    TIME_FIELDS.every(([field]) => minutesFieldValid(minutesTexts[field])) &&
    noBlankItems(ingredients) &&
    !hasEmptyGroup(ingredients) &&
    noBlankItems(steps) &&
    noBlankItems(notes) &&
    steps.every((step) => noBlankItems(childrenOf(step.id)));

  function save() {
    if (!formValid) return;

    const timePatch = Object.fromEntries(
      TIME_FIELDS.flatMap(([field]) => {
        const value = minutesPatchValue(minutesTexts[field], recipe[field]);
        return value !== undefined ? [[field, value]] : [];
      }),
    ) as Pick<RecipeEditPatch, TimeField>;
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

    // With groups on either side, the whole arrangement is sent (new lines
    // land at the end of the section until it is applied); otherwise the
    // flat order, as before.
    const grouped =
      ingredients.some((item) => item.heading) ||
      originalIngredients.some((item) => item.heading);
    const layout = ingredientLayout(ingredients);
    const ingredientLayoutPatch =
      grouped &&
      (JSON.stringify(layout) !==
        JSON.stringify(ingredientLayout(originalIngredients)) ||
        ingredients.some((item) => item.id.startsWith("new:")))
        ? layout
        : undefined;
    const ingredientOrder = grouped
      ? undefined
      : orderDiff(recipe.ingredients, ingredients);
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
      ...timePatch,
      ...(sourceUrlPatch !== undefined ? { sourceUrl: sourceUrlPatch } : {}),
      ingredients: sectionDiff(
        originalIngredients,
        withReadableHeadings(ingredients),
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
      ...(ingredientLayoutPatch
        ? { ingredientLayout: ingredientLayoutPatch }
        : {}),
      ...(stepOrder ? { stepOrder } : {}),
      ...(noteOrder ? { noteOrder } : {}),
      ...(stepChildrenPatch.length > 0
        ? { stepChildren: stepChildrenPatch }
        : {}),
    };
    const liveIds = lineIds(live);
    onSave(withoutMissingLines(patch, (id) => liveIds.has(id)));
  }

  return (
    <section className="draft-recipe-card draft-recipe-editor">
      <h1>{messages.editRecipe}</h1>
      {changedElsewhere && (
        <div className="draft-recipe-banner" role="status">
          <p>{messages.recipeChangedElsewhere}</p>
          {onReload && (
            <button
              type="button"
              onClick={() => confirmDiscard(isDirty, onReload)}
            >
              {messages.loadCurrentVersion}
            </button>
          )}
        </div>
      )}
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
        {TIME_FIELDS.map(([field, label]) => (
          <label key={field}>
            {`${messages[label]} (${messages.minutesUnit})`}
            <input
              type="number"
              min="0"
              step="1"
              value={minutesTexts[field]}
              onChange={(event) => {
                const text = event.currentTarget.value;
                setMinutesTexts((current) => ({ ...current, [field]: text }));
              }}
            />
          </label>
        ))}
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
        addHeadingLabel={messages.addIngredientGroup}
        headingLabel={messages.ingredientGroup}
        renderItemExtra={(item) =>
          !item.heading && (
            <label
              className="draft-recipe-scale-toggle"
              title={messages.doesNotScale}
            >
              <input
                type="checkbox"
                aria-label={messages.doesNotScale}
                checked={scaleModeById[item.id] === "fixed"}
                onChange={(event) =>
                  setScaleModeById((current) => ({
                    ...current,
                    [item.id]: event.currentTarget.checked ? "fixed" : "linear",
                  }))
                }
              />
              {messages.fixedAmountShort}
            </label>
          )
        }
      />
      {hasEmptyGroup(ingredients) && (
        <p className="draft-recipe-validation-error" role="alert">
          {messages.emptyIngredientGroup}
        </p>
      )}
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
                renderItemContent={(item) => {
                  const child = parseStepChild(item.id, item.text);
                  if (child.kind === "note") return null;
                  return (
                    <span className="draft-recipe-editor-media">
                      <StepMedia
                        child={child}
                        messages={messages}
                        resolveAssetUrl={resolveAssetUrl}
                      />
                      <span>{child.path.split("/").pop()}</span>
                    </span>
                  );
                }}
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
        <button type="button" onClick={() => confirmDiscard(isDirty, onCancel)}>
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
