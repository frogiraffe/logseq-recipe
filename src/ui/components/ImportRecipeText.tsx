import { useMemo, useState } from "react";
import {
  analyzeWithDetectedLocale,
  outlineToSource,
  parseRecipeText,
} from "../../application/convert-recipe";
import type { OutlineNode } from "../../application/split-outline";
import type { RecipeLocale } from "../../domain/recipe";
import { defaultParseContext } from "../../parsing/context";
import { useConfirmDiscard, useDirtyReport } from "../dirty-guard";
import type { UiMessages } from "../i18n";

export interface ImportRecipeTextProps {
  messages: UiMessages;
  fallbackLocale: RecipeLocale;
  // The text to start from, when returning from the import's preview.
  initialText?: string;
  pending?: boolean;
  onImport(outline: OutlineNode, text: string): void;
  onCancel(): void;
  onDirtyChange?(isDirty: boolean): void;
}

export function ImportRecipeText({
  messages,
  fallbackLocale,
  initialText = "",
  pending = false,
  onImport,
  onCancel,
  onDirtyChange,
}: ImportRecipeTextProps) {
  const confirmDiscard = useConfirmDiscard(messages);
  const [text, setText] = useState(initialText);
  const outline = useMemo(
    () => parseRecipeText(text, defaultParseContext(fallbackLocale)),
    [text, fallbackLocale],
  );
  const preview = useMemo(
    () =>
      outline
        ? analyzeWithDetectedLocale(outlineToSource(outline), fallbackLocale)
            .draft
        : null,
    [outline, fallbackLocale],
  );
  const isDirty = text.trim() !== "";
  useDirtyReport(isDirty, onDirtyChange);

  return (
    <section className="draft-recipe-new-form">
      <h1>{messages.importRecipe}</h1>
      <p>{messages.importRecipeHelp}</p>
      <label>
        {messages.recipeText}
        <textarea
          rows={16}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
      </label>
      {isDirty && !outline && (
        <div className="draft-recipe-error">{messages.importNoSections}</div>
      )}
      {preview && (
        <dl className="draft-recipe-convert-summary">
          <div>
            <dt>{messages.title}</dt>
            <dd>{preview.title}</dd>
          </div>
          <div>
            <dt>{messages.parserLanguage}</dt>
            <dd>{preview.locale.toUpperCase()}</dd>
          </div>
          {preview.metadata.baseYield !== undefined && (
            <div>
              <dt>{messages.servings}</dt>
              <dd>{preview.metadata.baseYield}</dd>
            </div>
          )}
          <div>
            <dt>{messages.ingredients}</dt>
            <dd>{preview.ingredients.length}</dd>
          </div>
          <div>
            <dt>{messages.steps}</dt>
            <dd>{preview.steps.length}</dd>
          </div>
        </dl>
      )}
      <div className="draft-recipe-actions">
        <button type="button" onClick={() => confirmDiscard(isDirty, onCancel)}>
          {messages.cancel}
        </button>
        <button
          type="button"
          className="draft-recipe-primary-action"
          disabled={!outline || pending}
          onClick={() => outline && onImport(outline, text)}
        >
          {messages.importRecipeAction}
        </button>
      </div>
    </section>
  );
}
