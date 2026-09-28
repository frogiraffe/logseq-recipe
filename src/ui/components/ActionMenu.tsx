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
  align = "start",
}: {
  label: string;
  icon: ReactNode;
  items: ActionMenuItem[];
  /** "end" opens toward the left, for a menu at the right edge. */
  align?: "start" | "end";
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

  // A narrow window may have no room on the side the menu opens toward:
  // shift it back inside, 8 px from the edge. Measured from its button and
  // width, which the opening animation's scale leaves untouched.
  const keepInWindow = () => {
    const menu = ref.current;
    const list = menu?.querySelector<HTMLElement>(".draft-recipe-menu-items");
    if (!menu?.open || !list) return;
    const button = menu.getBoundingClientRect();
    const left =
      align === "end" ? button.right - list.offsetWidth : button.left;
    const room =
      (document.documentElement.clientWidth || window.innerWidth) - 8;
    const shift = Math.max(
      8 - left,
      Math.min(0, room - left - list.offsetWidth),
    );
    list.style.translate = shift ? `${shift}px 0` : "";
  };

  return (
    <details
      className={
        align === "end"
          ? "draft-recipe-menu draft-recipe-menu-end"
          : "draft-recipe-menu"
      }
      ref={ref}
      onToggle={keepInWindow}
    >
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
