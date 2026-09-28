import type { ArchivedRecipeSummary } from "../../application/types";
import { useConfirm } from "../confirm";
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
  const confirm = useConfirm();
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
                  className="draft-recipe-danger-action"
                  aria-label={`${messages.deleteRecipePermanently}: ${recipe.title}`}
                  disabled={pending}
                  onClick={() =>
                    confirm(
                      {
                        message: messages.deleteRecipePermanentlyConfirm,
                        detail: recipe.title,
                        confirmLabel: messages.deleteRecipePermanently,
                        destructive: true,
                      },
                      () => onDelete(recipe.id),
                    )
                  }
                >
                  {messages.deleteRecipePermanently}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
