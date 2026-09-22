import { type RefObject, useEffect } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Focusable descendants in DOM order. Disabled controls are excluded by the
 * selector itself, matching what a real Tab press would skip anyway.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
}

/**
 * Keeps Tab/Shift+Tab cycling within `containerRef`'s focusable descendants
 * instead of escaping into whatever the host page (Logseq's own app behind
 * this modal) renders next in DOM order. Handles the edge cases a real
 * dialog needs: zero focusable descendants (Tab just keeps focus on the
 * container), and focus starting on the container itself rather than one of
 * its descendants (the case right after initial mount-focus).
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const activeIndex = focusable.indexOf(
        document.activeElement as HTMLElement,
      );
      if (event.shiftKey) {
        if (activeIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (activeIndex === -1 || activeIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    }

    const container = containerRef.current;
    container?.addEventListener("keydown", handleKeyDown);
    return () => container?.removeEventListener("keydown", handleKeyDown);
  }, [containerRef]);
}
