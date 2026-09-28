import { useEffect, useState } from "react";
import { foldLabel } from "../../parsing/normalize";
import type { UiMessages } from "../i18n";

export interface ServingControlProps {
  value: number;
  messages: UiMessages;
  yieldUnit?: string;
  /** The recipe's own servings; a changed value offers a way back to it. */
  baseValue?: number;
  onChange(value: number): void;
}

// "Servings 4 servings" says it twice: a unit that only repeats the label
// (in either number) is left out.
function repeatsLabel(unit: string, label: string): boolean {
  const stem = (word: string) => foldLabel(word).replace(/s$/u, "");
  return stem(unit) === stem(label);
}

export function ServingControl({
  value,
  messages,
  yieldUnit,
  baseValue,
  onChange,
}: ServingControlProps) {
  const [text, setText] = useState(String(value));
  const unit = yieldUnit?.trim();

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = (next: number) => {
    if (Number.isFinite(next) && next > 0) onChange(next);
  };

  function handleTextChange(raw: string) {
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(parsed) && parsed > 0) {
      onChange(parsed);
    }
  }

  function handleBlur() {
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) {
      setText(String(value));
    }
  }

  return (
    <div className="draft-recipe-serving-control">
      <span>{messages.servings}</span>
      <button
        type="button"
        onClick={() => commit(value - 1)}
        aria-label={messages.fewerServings}
        disabled={value - 1 <= 0}
      >
        −
      </button>
      <input
        aria-label={messages.servings}
        type="number"
        min="0.01"
        step="1"
        value={text}
        onChange={(event) => handleTextChange(event.currentTarget.value)}
        onBlur={handleBlur}
      />
      <button
        type="button"
        onClick={() => commit(value + 1)}
        aria-label={messages.moreServings}
      >
        +
      </button>
      {unit && !repeatsLabel(unit, messages.servings) && (
        <span className="draft-recipe-yield-unit">{unit}</span>
      )}
      {baseValue !== undefined &&
        Number.isFinite(baseValue) &&
        value !== baseValue && (
          <button
            type="button"
            className="draft-recipe-quiet-button"
            aria-label={messages.resetServings.replace(
              "{count}",
              String(baseValue),
            )}
            title={messages.resetServings.replace("{count}", String(baseValue))}
            onClick={() => onChange(baseValue)}
          >
            <span aria-hidden="true">↺ {baseValue}</span>
          </button>
        )}
    </div>
  );
}
