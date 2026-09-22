import { useMemo, useState } from "react";
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

export interface RecipesViewProps {
  recipes: RecipeSummary[];
  messages: UiMessages;
  // True only until the first list fetch settles. Without this, an empty
  // `recipes` array while the initial load is still in flight would render
  // the same "No recipes yet" message as a graph that's genuinely empty.
  loading?: boolean;
  onOpen(id: string): void;
}

export function RecipesView({
  recipes,
  messages,
  loading = false,
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
      <h1>{messages.recipes}</h1>
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
        <p>{messages.noRecipes}</p>
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
              <strong>{recipe.title}</strong>
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
