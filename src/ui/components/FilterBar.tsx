import type {
  FacetSuggestion,
  MinuteRange,
  RecipeFilter,
} from "../../application/list-recipes";
import type { UiMessages } from "../i18n";

export interface FilterBarProps {
  filter: RecipeFilter;
  messages: UiMessages;
  categorySuggestions: FacetSuggestion[];
  tagSuggestions: FacetSuggestion[];
  onChange(filter: RecipeFilter): void;
}

type RangeKey = "prepMinutes" | "cookMinutes" | "totalMinutes";

function commaList(value: string): string[] | undefined {
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function rangeValue(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function FilterBar({
  filter,
  messages,
  categorySuggestions,
  tagSuggestions,
  onChange,
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
      <label>
        {messages.searchRecipes}
        <input
          aria-label={messages.searchRecipes}
          value={filter.query ?? ""}
          onChange={(event) =>
            update({ query: event.currentTarget.value || undefined })
          }
        />
      </label>

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

      <label>
        {messages.category}
        <input
          aria-label={messages.category}
          list="draft-recipe-category-suggestions"
          value={(filter.categories ?? []).join(", ")}
          onChange={(event) =>
            update({ categories: commaList(event.currentTarget.value) })
          }
        />
      </label>
      <datalist id="draft-recipe-category-suggestions">
        {categorySuggestions.map((suggestion) => (
          <option key={suggestion.value} value={suggestion.value}>
            {suggestion.count}
          </option>
        ))}
      </datalist>

      <label>
        {messages.tags}
        <input
          aria-label={messages.tags}
          list="draft-recipe-tag-suggestions"
          value={(filter.tags ?? []).join(", ")}
          onChange={(event) =>
            update({ tags: commaList(event.currentTarget.value) })
          }
        />
      </label>
      <datalist id="draft-recipe-tag-suggestions">
        {tagSuggestions.map((suggestion) => (
          <option key={suggestion.value} value={suggestion.value}>
            {suggestion.count}
          </option>
        ))}
      </datalist>

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
    </section>
  );
}
