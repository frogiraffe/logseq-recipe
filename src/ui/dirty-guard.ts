import { useCallback, useEffect } from "react";
import { useConfirm } from "./confirm";
import type { UiMessages } from "./i18n";

/**
 * Guards a discard action (Cancel/Close) behind a confirmation when there
 * are unsaved changes, so a real edit can't be thrown away by a stray
 * click. `confirmDiscard(isDirty, discard)` discards at once when clean.
 */
export function useConfirmDiscard(
  messages: Pick<
    UiMessages,
    "discardChangesConfirm" | "discardChanges" | "keepEditing"
  >,
): (isDirty: boolean, discard: () => void) => void {
  const confirm = useConfirm();
  const { discardChangesConfirm, discardChanges, keepEditing } = messages;
  return useCallback(
    (isDirty, discard) => {
      if (!isDirty) {
        discard();
        return;
      }
      confirm(
        {
          message: discardChangesConfirm,
          confirmLabel: discardChanges,
          cancelLabel: keepEditing,
          destructive: true,
        },
        discard,
      );
    },
    [confirm, discardChangesConfirm, discardChanges, keepEditing],
  );
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
