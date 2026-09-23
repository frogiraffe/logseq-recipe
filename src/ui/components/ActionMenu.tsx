import { type ReactNode, useEffect, useRef } from "react";

export interface ActionMenuItem {
  label: string;
  onSelect(): void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Overflow actions behind one button. A native <details> disclosure (not an
 * ARIA menu), so it needs no arrow-key model: Tab walks the items, Escape and
 * outside clicks close it, and choosing an item closes it too.
 */
export function ActionMenu({
  label,
  icon,
  items,
}: {
  label: string;
  icon: ReactNode;
  items: ActionMenuItem[];
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        menu.open = false;
        menu.querySelector("summary")?.focus();
        return;
      }
      if (!menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close, true);
    };
  }, []);

  return (
    <details className="draft-recipe-menu" ref={ref}>
      <summary aria-label={label} title={label}>
        <span aria-hidden="true">{icon}</span>
      </summary>
      <div className="draft-recipe-menu-items">
        {items.map((item) => (
          <button
            type="button"
            key={item.label}
            className={item.danger ? "draft-recipe-menu-danger" : undefined}
            disabled={item.disabled}
            onClick={() => {
              if (ref.current) ref.current.open = false;
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
