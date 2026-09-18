import { type ReactNode, useRef, useState } from "react";
import {
  orderDiff,
  type RecipeEditPatch,
  sectionDiff,
} from "../../application/edit-recipe";
import type { IngredientScaleMode, Recipe } from "../../domain/recipe";
import type { UiMessages } from "../i18n";

interface EditableItem {
  id: string;
  text: string;
}

export interface RecipeEditorProps {
  recipe: Recipe;
  messages: UiMessages;
  onSave(patch: RecipeEditPatch): void;
  onCancel(): void;
}

function initialItems(
  source: Array<{ id: string; text: string }>,
): EditableItem[] {
  return source.map(({ id, text }) => ({ id, text }));
}

function EditableSection({
  title,
  items,
  addPlaceholder,
  removeLabel,
  moveUpLabel,
  moveDownLabel,
  onChange,
  renderItemExtra,
}: {
  title: string;
  items: EditableItem[];
  addPlaceholder: string;
  removeLabel: string;
  moveUpLabel: string;
  moveDownLabel: string;
  onChange(items: EditableItem[]): void;
  renderItemExtra?(item: EditableItem): ReactNode;
}) {
  const counter = useRef(0);
  const [draft, setDraft] = useState("");

  function addItem() {
    const text = draft.trim();
    if (!text) return;
    counter.current += 1;
    onChange([...items, { id: `new:${counter.current}`, text }]);
    setDraft("");
  }

  function moveItem(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  return (
    <section className="draft-recipe-section">
      <h2>{title}</h2>
      <ul className="draft-recipe-editor-items">
        {items.map((item, index) => (
          <li key={item.id} className="draft-recipe-editor-item">
            <input
              aria-label={`${title}: ${item.id}`}
              value={item.text}
              onChange={(event) =>
                onChange(
                  items.map((candidate) =>
                    candidate.id === item.id
                      ? { ...candidate, text: event.currentTarget.value }
                      : candidate,
                  ),
                )
              }
            />
            {renderItemExtra?.(item)}
            <button
              type="button"
              className="draft-recipe-editor-move-button"
              aria-label={`${moveUpLabel}: ${item.text}`}
              disabled={index === 0}
              onClick={() => moveItem(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="draft-recipe-editor-move-button"
              aria-label={`${moveDownLabel}: ${item.text}`}
              disabled={index === items.length - 1}
              onClick={() => moveItem(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`${removeLabel}: ${item.text}`}
              onClick={() =>
                onChange(items.filter((candidate) => candidate.id !== item.id))
              }
            >
              {removeLabel}
            </button>
          </li>
        ))}
      </ul>
      <div className="draft-recipe-editor-add-row">
        <input
          aria-label={addPlaceholder}
          placeholder={addPlaceholder}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
        />
        <button type="button" onClick={addItem}>
          {addPlaceholder}
        </button>
      </div>
    </section>
  );
}

export function RecipeEditor({
  recipe,
  messages,
  onSave,
  onCancel,
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
  const [scaleModeById, setScaleModeById] = useState<
    Record<string, IngredientScaleMode>
  >(() =>
    Object.fromEntries(recipe.ingredients.map((i) => [i.id, i.scaleMode])),
  );

  const baseYield = Number(baseYieldText);
  const baseYieldValid =
    baseYieldText.trim() !== "" && Number.isFinite(baseYield) && baseYield > 0;

  function parseMinutesField(text: string): number | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  function minutesFieldValid(text: string): boolean {
    return text.trim() === "" || parseMinutesField(text) !== undefined;
  }
  function sourceUrlValid(value: string): boolean {
    if (!value.trim()) return true;
    try {
      const url = new URL(value.trim());
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  const formValid =
    Boolean(title.trim()) &&
    baseYieldValid &&
    minutesFieldValid(prepMinutesText) &&
    minutesFieldValid(chillMinutesText) &&
    minutesFieldValid(cookMinutesText) &&
    sourceUrlValid(sourceUrl);

  function save() {
    if (!formValid) return;

    const prepMinutes = parseMinutesField(prepMinutesText);
    const chillMinutes = parseMinutesField(chillMinutesText);
    const cookMinutes = parseMinutesField(cookMinutesText);
    const trimmedSourceUrl = sourceUrl.trim();

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

    const patch: RecipeEditPatch = {
      ...(title.trim() !== recipe.title ? { title: title.trim() } : {}),
      ...(baseYield !== recipe.baseYield ? { baseYield } : {}),
      ...(yieldUnit.trim() !== (recipe.yieldUnit ?? "")
        ? { yieldUnit: yieldUnit.trim() }
        : {}),
      ...(prepMinutes !== undefined && prepMinutes !== recipe.prepMinutes
        ? { prepMinutes }
        : {}),
      ...(chillMinutes !== undefined && chillMinutes !== recipe.chillMinutes
        ? { chillMinutes }
        : {}),
      ...(cookMinutes !== undefined && cookMinutes !== recipe.cookMinutes
        ? { cookMinutes }
        : {}),
      ...(trimmedSourceUrl && trimmedSourceUrl !== (recipe.sourceUrl ?? "")
        ? { sourceUrl: trimmedSourceUrl }
        : {}),
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
    };
    onSave(patch);
  }

  return (
    <section className="draft-recipe-card draft-recipe-editor">
      <h1>{messages.editRecipe}</h1>
      <label>
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
      <label>
        {messages.source}
        <input
          type="url"
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.currentTarget.value)}
        />
      </label>

      <EditableSection
        title={messages.ingredients}
        items={ingredients}
        addPlaceholder={messages.addIngredient}
        removeLabel={messages.remove}
        moveUpLabel={messages.moveUp}
        moveDownLabel={messages.moveDown}
        onChange={setIngredients}
        renderItemExtra={(item) =>
          item.id.startsWith("new:") ? null : (
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
          )
        }
      />
      <EditableSection
        title={messages.steps}
        items={steps}
        addPlaceholder={messages.addStep}
        removeLabel={messages.remove}
        moveUpLabel={messages.moveUp}
        moveDownLabel={messages.moveDown}
        onChange={setSteps}
      />
      <EditableSection
        title={messages.notes}
        items={notes}
        addPlaceholder={messages.addNote}
        removeLabel={messages.remove}
        moveUpLabel={messages.moveUp}
        moveDownLabel={messages.moveDown}
        onChange={setNotes}
      />

      <div className="draft-recipe-actions">
        <button type="button" onClick={onCancel}>
          {messages.cancel}
        </button>
        <button
          type="button"
          className="draft-recipe-primary-action"
          disabled={!formValid}
          onClick={save}
        >
          {messages.save}
        </button>
      </div>
    </section>
  );
}
