import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "./focus-trap";

export interface ConfirmRequest {
  message: string;
  /** Shown in bold under the message, such as the recipe's title. */
  detail?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/** Asks first; runs `onConfirm` only if the cook agrees. */
export type Confirm = (request: ConfirmRequest, onConfirm: () => void) => void;

// A component shown on its own, outside the app's dialog host, falls back
// to the browser's confirm().
const ConfirmContext = createContext<Confirm>((request, onConfirm) => {
  const text = request.detail
    ? `${request.message}\n\n${request.detail}`
    : request.message;
  if (window.confirm(text)) onConfirm();
});

export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

interface Pending {
  request: ConfirmRequest;
  onConfirm(): void;
  returnFocus: Element | null;
}

/**
 * One confirmation dialog for the whole app, drawn inside `hostRef` (the
 * app shell) so it takes the shell's theme. Focus starts on the safe
 * choice, Escape cancels, and focus goes back where it was.
 */
export function ConfirmProvider({
  hostRef,
  cancelLabel,
  children,
}: {
  hostRef: RefObject<HTMLElement | null>;
  cancelLabel: string;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback<Confirm>((request, onConfirm) => {
    setPending({ request, onConfirm, returnFocus: document.activeElement });
  }, []);
  const close = (confirmed: boolean) => {
    if (!pending) return;
    setPending(null);
    (pending.returnFocus as HTMLElement | null)?.focus?.();
    if (confirmed) pending.onConfirm();
  };
  const host = hostRef.current;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending &&
        host &&
        createPortal(
          <ConfirmDialog
            request={pending.request}
            cancelLabel={cancelLabel}
            onClose={close}
          />,
          host,
        )}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  request,
  cancelLabel,
  onClose,
}: {
  request: ConfirmRequest;
  cancelLabel: string;
  onClose(confirmed: boolean): void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop is no control; it only keeps a click from taking focus out of the dialog.
    <div
      className="draft-recipe-confirm-backdrop"
      // A click must not take focus out of the question, or the next key
      // would go to the screen behind it. Buttons still get their clicks.
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        ref={dialogRef}
        className="draft-recipe-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="draft-recipe-confirm-message"
        onKeyDown={(event) => {
          // Keys stay with the question: the screen behind must not act on
          // them (Cooking Mode's arrow keys, the app's Escape).
          event.stopPropagation();
          if (event.key !== "Escape") return;
          event.preventDefault();
          onClose(false);
        }}
      >
        <p id="draft-recipe-confirm-message">
          {request.message}
          {request.detail && (
            <>
              <br />
              <strong>{request.detail}</strong>
            </>
          )}
        </p>
        <div className="draft-recipe-actions">
          <button ref={cancelRef} type="button" onClick={() => onClose(false)}>
            {request.cancelLabel ?? cancelLabel}
          </button>
          <button
            type="button"
            className={
              request.destructive
                ? "draft-recipe-danger-action"
                : "draft-recipe-primary-action"
            }
            onClick={() => onClose(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
