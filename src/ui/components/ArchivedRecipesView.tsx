import { useState } from "react";
import type { ArchivedRecipeSummary } from "../../application/types";
import type { UiMessages } from "../i18n";

export interface ArchivedRecipesViewProps {
  recipes: ArchivedRecipeSummary[];
  messages: UiMessages;
  loading?: boolean;
  pending?: boolean;
  onRestore(id: string): void;
  onDelete(id: string): void;
  onOpenInLogseq(id: string): void;
}

export function ArchivedRecipesView({
  recipes,
  messages,
  loading = false,
  pending = false,
  onRestore,
  onDelete,
  onOpenInLogseq,
}: ArchivedRecipesViewProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  return (
    <section className="draft-recipe-archived-view">
      <h1>{messages.archivedRecipes}</h1>
      {loading ? (
        <p>{messages.loadingRecipes}</p>
      ) : recipes.length === 0 ? (
        <p>{messages.noArchivedRecipes}</p>
      ) : (
        <ul className="draft-recipe-archived-list">
          {recipes.map((recipe) => (
            <li key={recipe.id} className="draft-recipe-archived-item">
              <span className="draft-recipe-archived-title">
                <strong>{recipe.title}</strong>
                {recipe.archivedAt !== undefined && (
                  <small>
                    {messages.archivedOn.replace(
                      "{date}",
                      new Intl.DateTimeFormat(messages.uiLocale, {
                        dateStyle: "medium",
                      }).format(recipe.archivedAt),
                    )}
                  </small>
                )}
              </span>
              {confirmingDeleteId === recipe.id ? (
                <div className="draft-recipe-archive-confirm">
                  <p>{messages.deleteRecipePermanentlyConfirm}</p>
                  <div className="draft-recipe-actions">
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                    >
                      {messages.cancel}
                    </button>
                    <button
                      type="button"
                      aria-label={`${messages.deleteRecipePermanently}: ${recipe.title}`}
                      disabled={pending}
                      onClick={() => {
                        setConfirmingDeleteId(null);
                        onDelete(recipe.id);
                      }}
                    >
                      {messages.deleteRecipePermanently}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="draft-recipe-actions">
                  <button
                    type="button"
                    aria-label={`${messages.restoreRecipe}: ${recipe.title}`}
                    disabled={pending}
                    onClick={() => onRestore(recipe.id)}
                  >
                    {messages.restoreRecipe}
                  </button>
                  <button
                    type="button"
                    aria-label={`${messages.openInLogseq}: ${recipe.title}`}
                    onClick={() => onOpenInLogseq(recipe.id)}
                  >
                    {messages.openInLogseq}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirmingDeleteId(recipe.id)}
                  >
                    {messages.deleteRecipePermanently}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
