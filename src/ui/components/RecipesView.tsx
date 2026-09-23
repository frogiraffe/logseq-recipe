import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  collectFacetSuggestions,
  filterRecipeSummaries,
  type RecipeFilter,
  type RecipeSortKey,
  sortRecipeSummaries,
} from "../../application/list-recipes";
import type { RecipeSummary } from "../../application/types";
import type { UiMessages } from "../i18n";
import { FilterBar } from "./FilterBar";

// Resolved cover URLs, kept across list renders and reopenings so a card
// never flickers back to its placeholder.
const coverUrls = new Map<string, string | null>();

function RecipeThumb({
  recipe,
  resolveCover,
}: {
  recipe: RecipeSummary;
  resolveCover?(recipe: RecipeSummary): Promise<string | null>;
}) {
  const key = recipe.cover ? `${recipe.cover.kind}:${recipe.cover.value}` : "";
  const [url, setUrl] = useState(() => coverUrls.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!key || !resolveCover) {
      setUrl(null);
      return undefined;
    }
    if (coverUrls.has(key)) {
      setUrl(coverUrls.get(key) ?? null);
      return undefined;
    }
    let active = true;
    resolveCover(recipe).then(
      (resolved) => {
        coverUrls.set(key, resolved);
        if (active) setUrl(resolved);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [key, recipe, resolveCover]);

  return (
    <span className="draft-recipe-thumb" aria-hidden="true">
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="draft-recipe-thumb-letter">
          {recipe.title.trim().charAt(0).toLocaleUpperCase()}
        </span>
      )}
    </span>
  );
}

function totalMinutes(recipe: RecipeSummary): number | undefined {
  const parts = [recipe.prepMinutes, recipe.chillMinutes, recipe.cookMinutes];
  return parts.some((value) => value !== undefined)
    ? parts.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : undefined;
}

export interface RecipesViewProps {
  recipes: RecipeSummary[];
  messages: UiMessages;
  // True only until the first list fetch settles. Without this, an empty
  // `recipes` array while the initial load is still in flight would render
  // the same "No recipes yet" message as a graph that's genuinely empty.
  loading?: boolean;
  // Page-level actions shown beside the heading (create, archive, refresh).
  headerActions?: ReactNode;
  resolveCover?(recipe: RecipeSummary): Promise<string | null>;
  onOpen(id: string): void;
}

export function RecipesView({
  recipes,
  messages,
  loading = false,
  headerActions,
  resolveCover,
  onOpen,
}: RecipesViewProps) {
  const [filter, setFilter] = useState<RecipeFilter>({});
  const [sortBy, setSortBy] = useState<RecipeSortKey>("title");
  const filtered = useMemo(
    () => sortRecipeSummaries(filterRecipeSummaries(recipes, filter), sortBy),
    [recipes, filter, sortBy],
  );
  const categorySuggestions = useMemo(
    () => collectFacetSuggestions(recipes, "categories"),
    [recipes],
  );
  const tagSuggestions = useMemo(
    () => collectFacetSuggestions(recipes, "tags"),
    [recipes],
  );

  return (
    <section className="draft-recipe-recipes-view">
      <header className="draft-recipe-page-header">
        <h1>{messages.recipes}</h1>
        {headerActions && (
          <div className="draft-recipe-page-actions">{headerActions}</div>
        )}
      </header>
      <FilterBar
        filter={filter}
        messages={messages}
        categorySuggestions={categorySuggestions}
        tagSuggestions={tagSuggestions}
        sortBy={sortBy}
        onChange={setFilter}
        onSortChange={setSortBy}
      />

      {loading && recipes.length === 0 ? (
        <p>{messages.loadingRecipes}</p>
      ) : recipes.length === 0 ? (
        <div className="draft-recipe-empty-state">
          <p>
            <strong>{messages.noRecipes}</strong>
          </p>
          <p>{messages.noRecipesHint}</p>
        </div>
      ) : (
        <>
          <p className="draft-recipe-result-count">
            {filtered.length} / {recipes.length} {messages.recipes}
          </p>
          {filtered.length === 0 && <p>{messages.noResults}</p>}
        </>
      )}

      {recipes.length > 0 && filtered.length > 0 && (
        <div className="draft-recipe-recipe-list">
          {filtered.map((recipe) => (
            <button
              type="button"
              className="draft-recipe-recipe-list-item"
              key={recipe.id}
              onClick={() => onOpen(recipe.id)}
            >
              <RecipeThumb recipe={recipe} resolveCover={resolveCover} />
              <span className="draft-recipe-recipe-list-heading">
                <strong>{recipe.title}</strong>
                {totalMinutes(recipe) !== undefined && (
                  <small>{`${totalMinutes(recipe)} ${messages.minutesUnit}`}</small>
                )}
              </span>
              {(recipe.categories.length > 0 || recipe.tags.length > 0) && (
                <span className="draft-recipe-classification-row">
                  {recipe.categories.map((category) => (
                    <span className="draft-recipe-category-chip" key={category}>
                      {category}
                    </span>
                  ))}
                  {recipe.tags.map((tag) => (
                    <span className="draft-recipe-tag-chip" key={tag}>
                      {tag}
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
