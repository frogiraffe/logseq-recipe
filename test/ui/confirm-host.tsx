import { render } from "@testing-library/react";
import { type ReactNode, useRef } from "react";
import { ConfirmProvider } from "../../src/ui/confirm";
import { enMessages } from "../../src/ui/i18n";

function Host({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <ConfirmProvider hostRef={ref} cancelLabel={enMessages.cancel}>
        {children}
      </ConfirmProvider>
    </div>
  );
}

/** Renders `ui` with the app's confirm dialog instead of window.confirm. */
export function renderWithConfirm(ui: ReactNode) {
  return render(<Host>{ui}</Host>);
}
