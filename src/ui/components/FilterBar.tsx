import type {
  FacetSuggestion,
  MinuteRange,
  RecipeFilter,
  RecipeSortKey,
} from "../../application/list-recipes";
import type { UiMessages } from "../i18n";
import { ChipInput } from "./ChipInput";

export interface FilterBarProps {
  filter: RecipeFilter;
  messages: UiMessages;
  categorySuggestions: FacetSuggestion[];
  tagSuggestions: FacetSuggestion[];
  sortBy: RecipeSortKey;
  onChange(filter: RecipeFilter): void;
  onSortChange(sortBy: RecipeSortKey): void;
}

type RangeKey = "prepMinutes" | "cookMinutes" | "totalMinutes";

function rangeValue(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function hasActiveFilters(filter: RecipeFilter): boolean {
  return (
    Boolean(filter.query) ||
    Boolean(filter.ingredient) ||
    (filter.categories?.length ?? 0) > 0 ||
    (filter.tags?.length ?? 0) > 0 ||
    Boolean(filter.prepMinutes?.min ?? filter.prepMinutes?.max) ||
    Boolean(filter.cookMinutes?.min ?? filter.cookMinutes?.max) ||
    Boolean(filter.totalMinutes?.min ?? filter.totalMinutes?.max)
  );
}

export function FilterBar({
  filter,
  messages,
  categorySuggestions,
  tagSuggestions,
  sortBy,
  onChange,
  onSortChange,
}: FilterBarProps) {
  const update = (patch: Partial<RecipeFilter>) =>
    onChange({ ...filter, ...patch });
  const updateRange = (
    key: RangeKey,
    edge: keyof MinuteRange,
    value: string,
  ) => {
    const nextRange: MinuteRange = {
      ...filter[key],
      [edge]: rangeValue(value),
    };
    if (key === "prepMinutes") update({ prepMinutes: nextRange });
    else if (key === "cookMinutes") update({ cookMinutes: nextRange });
    else update({ totalMinutes: nextRange });
  };

  return (
    <section className="draft-recipe-filters" aria-label={messages.filters}>
      <label className="draft-recipe-search-field">
        {messages.searchRecipes}
        <input
          aria-label={messages.searchRecipes}
          type="search"
          placeholder={messages.searchRecipesPlaceholder}
          value={filter.query ?? ""}
          onChange={(event) =>
            update({ query: event.currentTarget.value || undefined })
          }
        />
      </label>
      <label>
        {messages.sortBy}
        <select
          aria-label={messages.sortBy}
          value={sortBy}
          onChange={(event) =>
            onSortChange(event.currentTarget.value as RecipeSortKey)
          }
        >
          <option value="title">{messages.sortByTitle}</option>
          <option value="totalTime">{messages.sortByTotalTime}</option>
        </select>
      </label>

      {hasActiveFilters(filter) && (
        <button type="button" onClick={() => onChange({})}>
          {messages.clearFilters}
        </button>
      )}

      <details className="draft-recipe-advanced-disclosure draft-recipe-filters-disclosure">
        <summary>{messages.filters}</summary>

        <div className="draft-recipe-filters-advanced-grid">
          <label>
            {messages.containsIngredient}
            <input
              aria-label={messages.containsIngredient}
              value={filter.ingredient ?? ""}
              onChange={(event) =>
                update({ ingredient: event.currentTarget.value || undefined })
              }
            />
          </label>

          <div className="draft-recipe-field">
            <label htmlFor="draft-recipe-filter-categories">
              {messages.category}
            </label>
            <ChipInput
              id="draft-recipe-filter-categories"
              values={filter.categories ?? []}
              variant="category"
              ariaLabel={messages.category}
              removeLabel={messages.remove}
              suggestions={categorySuggestions}
              onChange={(values) =>
                update({ categories: values.length > 0 ? values : undefined })
              }
            />
          </div>

          <div className="draft-recipe-field">
            <label htmlFor="draft-recipe-filter-tags">{messages.tags}</label>
            <ChipInput
              id="draft-recipe-filter-tags"
              values={filter.tags ?? []}
              variant="tag"
              ariaLabel={messages.tags}
              removeLabel={messages.remove}
              suggestions={tagSuggestions}
              onChange={(values) =>
                update({ tags: values.length > 0 ? values : undefined })
              }
            />
          </div>

          {(
            [
              ["prepMinutes", messages.prepTime],
              ["cookMinutes", messages.cookTime],
              ["totalMinutes", messages.totalTime],
            ] as const
          ).map(([key, label]) => (
            <fieldset key={key} className="draft-recipe-range-filter">
              <legend>{label}</legend>
              <input
                aria-label={`${label} ${messages.rangeMin}`}
                type="number"
                min="0"
                placeholder={messages.rangeMin}
                value={filter[key]?.min ?? ""}
                onChange={(event) =>
                  updateRange(key, "min", event.currentTarget.value)
                }
              />
              <input
                aria-label={`${label} ${messages.rangeMax}`}
                type="number"
                min="0"
                placeholder={messages.rangeMax}
                value={filter[key]?.max ?? ""}
                onChange={(event) =>
                  updateRange(key, "max", event.currentTarget.value)
                }
              />
            </fieldset>
          ))}
        </div>
      </details>
    </section>
  );
}
