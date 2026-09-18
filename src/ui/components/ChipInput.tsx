import { type ClipboardEvent, type KeyboardEvent, useState } from "react";
import type { FacetSuggestion } from "../../application/list-recipes";

export type ChipVariant = "category" | "tag";

export function addChipValue(values: string[], raw: string): string[] {
  const value = raw.trim();
  if (!value) return values;
  if (
    values.some(
      (existing) => existing.toLocaleLowerCase() === value.toLocaleLowerCase(),
    )
  ) {
    return values;
  }
  return [...values, value];
}

// Prefix matches rank above contains matches; usage count breaks ties within
// each group. Already-selected values are excluded so the dropdown never
// offers a chip the user has already added.
export function filterChipSuggestions(
  draft: string,
  suggestions: readonly FacetSuggestion[],
  selected: readonly string[],
  limit = 8,
): FacetSuggestion[] {
  const query = draft.trim().toLocaleLowerCase();
  if (!query) return [];
  const selectedLower = new Set(selected.map((v) => v.toLocaleLowerCase()));
  const prefix: FacetSuggestion[] = [];
  const contains: FacetSuggestion[] = [];

  for (const suggestion of suggestions) {
    const lower = suggestion.value.toLocaleLowerCase();
    if (selectedLower.has(lower)) continue;
    if (lower.startsWith(query)) prefix.push(suggestion);
    else if (lower.includes(query)) contains.push(suggestion);
  }

  const byCountDesc = (a: FacetSuggestion, b: FacetSuggestion) =>
    b.count - a.count;
  prefix.sort(byCountDesc);
  contains.sort(byCountDesc);
  return [...prefix, ...contains].slice(0, limit);
}

export interface ChipInputProps {
  id?: string;
  values: string[];
  variant: ChipVariant;
  ariaLabel: string;
  placeholder?: string;
  removeLabel: string;
  suggestions?: FacetSuggestion[];
  onChange(values: string[]): void;
}

export function ChipInput({
  id,
  values,
  variant,
  ariaLabel,
  placeholder,
  removeLabel,
  suggestions = [],
  onChange,
}: ChipInputProps) {
  const [draft, setDraft] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const chipClass =
    variant === "category"
      ? "draft-recipe-category-chip"
      : "draft-recipe-tag-chip";

  const matches = filterChipSuggestions(draft, suggestions, values);
  const open = !dismissed && matches.length > 0;

  function commit() {
    const next = addChipValue(values, draft);
    if (next !== values) onChange(next);
    setDraft("");
    setDismissed(false);
  }

  function selectSuggestion(value: string) {
    const next = addChipValue(values, value);
    if (next !== values) onChange(next);
    setDraft("");
    setDismissed(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (!open) return;
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      if (!open) return;
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, -1));
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setDismissed(true);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const active = open ? matches[activeIndex] : undefined;
      if (active) selectSuggestion(active.value);
      else commit();
      return;
    }
    if (event.key === ",") {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!text.includes(",")) return;
    event.preventDefault();
    const parts = text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    let next = values;
    for (const part of parts) next = addChipValue(next, part);
    if (next !== values) onChange(next);
    setDraft("");
  }

  return (
    <div className="draft-recipe-chip-input-wrapper">
      <div className="draft-recipe-chip-input">
        {values.map((value) => (
          <span className={chipClass} key={value}>
            {value}
            <button
              type="button"
              aria-label={`${removeLabel}: ${value}`}
              onClick={() =>
                onChange(values.filter((existing) => existing !== value))
              }
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          role="combobox"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setDismissed(false);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={commit}
        />
      </div>
      {open && (
        <div className="draft-recipe-chip-suggestions" role="listbox">
          {matches.map((suggestion, index) => (
            <button
              key={suggestion.value}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? "draft-recipe-chip-suggestion-active"
                  : undefined
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion.value)}
            >
              {suggestion.value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
