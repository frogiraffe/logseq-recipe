import { useState } from "react";
import type { NewRecipeInput } from "../../application/types";
import type { RecipeLocale } from "../../domain/recipe";
import type { MeasurementSystem } from "../../domain/unit";
import type { UiMessages } from "../i18n";

export interface NewRecipeFormProps {
  messages: UiMessages;
  locale: RecipeLocale;
  sourceMeasurementSystem: MeasurementSystem;
  pending?: boolean;
  onSubmit(input: NewRecipeInput): void;
  onCancel(): void;
}

export function NewRecipeForm({
  messages,
  locale,
  sourceMeasurementSystem,
  pending = false,
  onSubmit,
  onCancel,
}: NewRecipeFormProps) {
  const [title, setTitle] = useState("");
  const [baseYieldText, setBaseYieldText] = useState("4");
  const [yieldUnit, setYieldUnit] = useState("");

  const baseYield = Number(baseYieldText);
  const baseYieldValid =
    baseYieldText.trim() !== "" && Number.isFinite(baseYield) && baseYield > 0;

  const submit = () => {
    if (!title.trim() || !baseYieldValid) return;
    onSubmit({
      title: title.trim(),
      baseYield,
      ...(yieldUnit.trim() ? { yieldUnit: yieldUnit.trim() } : {}),
      locale,
      sourceMeasurementSystem,
    });
  };

  return (
    <section className="draft-recipe-new-form">
      <h1>{messages.createRecipe}</h1>
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
      <div className="draft-recipe-actions">
        <button type="button" onClick={onCancel}>
          {messages.cancel}
        </button>
        <button
          type="button"
          className="draft-recipe-primary-action"
          disabled={!title.trim() || !baseYieldValid || pending}
          onClick={submit}
        >
          {messages.save}
        </button>
      </div>
    </section>
  );
}
