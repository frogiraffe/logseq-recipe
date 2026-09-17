import { useEffect, useState } from "react";
import type { UiMessages } from "../i18n";

export interface ServingControlProps {
  value: number;
  messages: UiMessages;
  yieldUnit?: string;
  onChange(value: number): void;
}

export function ServingControl({
  value,
  messages,
  yieldUnit,
  onChange,
}: ServingControlProps) {
  const [text, setText] = useState(String(value));

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
      <button type="button" onClick={() => commit(value - 1)} aria-label="-">
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
      <button type="button" onClick={() => commit(value + 1)} aria-label="+">
        +
      </button>
      {yieldUnit?.trim() && (
        <span className="draft-recipe-yield-unit">{yieldUnit.trim()}</span>
      )}
    </div>
  );
}
