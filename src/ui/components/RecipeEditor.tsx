import { useRef, useState } from "react";
import {
  type RecipeEditPatch,
  sectionDiff,
} from "../../application/edit-recipe";
import type { Recipe } from "../../domain/recipe";
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
  onChange,
}: {
  title: string;
  items: EditableItem[];
  addPlaceholder: string;
  removeLabel: string;
  onChange(items: EditableItem[]): void;
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

  return (
    <section className="draft-recipe-section">
      <h2>{title}</h2>
      <ul className="draft-recipe-editor-items">
        {items.map((item) => (
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

  const baseYield = Number(baseYieldText);
  const baseYieldValid =
    baseYieldText.trim() !== "" && Number.isFinite(baseYield) && baseYield > 0;

  function save() {
    if (!title.trim() || !baseYieldValid) return;

    const patch: RecipeEditPatch = {
      ...(title.trim() !== recipe.title ? { title: title.trim() } : {}),
      ...(baseYield !== recipe.baseYield ? { baseYield } : {}),
      ...(yieldUnit.trim() !== (recipe.yieldUnit ?? "")
        ? { yieldUnit: yieldUnit.trim() }
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

      <EditableSection
        title={messages.ingredients}
        items={ingredients}
        addPlaceholder={messages.addIngredient}
        removeLabel={messages.remove}
        onChange={setIngredients}
      />
      <EditableSection
        title={messages.steps}
        items={steps}
        addPlaceholder={messages.addStep}
        removeLabel={messages.remove}
        onChange={setSteps}
      />
      <EditableSection
        title={messages.notes}
        items={notes}
        addPlaceholder={messages.addNote}
        removeLabel={messages.remove}
        onChange={setNotes}
      />

      <div className="draft-recipe-actions">
        <button type="button" onClick={onCancel}>
          {messages.cancel}
        </button>
        <button
          type="button"
          className="draft-recipe-primary-action"
          disabled={!title.trim() || !baseYieldValid}
          onClick={save}
        >
          {messages.save}
        </button>
      </div>
    </section>
  );
}
