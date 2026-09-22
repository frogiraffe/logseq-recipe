import { useEffect } from "react";

/**
 * Guards a discard action (Cancel/Close) behind a native confirmation
 * prompt when there are meaningful unsaved changes. Deliberately the
 * simplest viable implementation - a native `confirm()` rather than a
 * custom modal - since the only requirement is that a real edit can't be
 * silently thrown away by a stray click.
 */
export function confirmDiscardIfDirty(
  isDirty: boolean,
  message: string,
  discard: () => void,
): void {
  if (!isDirty || window.confirm(message)) discard();
}

/**
 * Reports a form's own `isDirty` state up to an ancestor (the app shell),
 * so an exit path outside the form itself - the shell's global Close
 * button, which the form has no way to guard directly - can apply the same
 * confirmation instead of silently discarding unsaved changes.
 */
export function useDirtyReport(
  isDirty: boolean,
  onDirtyChange: ((isDirty: boolean) => void) | undefined,
): void {
  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);
}
