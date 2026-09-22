import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { getFocusableElements, useFocusTrap } from "../../src/ui/focus-trap";

function TrapHarness({ empty = false }: { empty?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div ref={ref} tabIndex={-1} data-testid="container">
      {!empty && (
        <>
          <button type="button">first</button>
          <button type="button" disabled>
            disabled
          </button>
          <button type="button">last</button>
        </>
      )}
    </div>
  );
}

describe("getFocusableElements", () => {
  it("finds focusable descendants and skips disabled ones", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <button>a</button>
      <button disabled>b</button>
      <input />
      <a href="#">link</a>
      <a>no href</a>
    `;
    const tags = getFocusableElements(container).map((el) =>
      el.tagName.toLowerCase(),
    );
    expect(tags).toEqual(["button", "input", "a"]);
  });

  it("returns an empty list when there is nothing focusable", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>no controls here</p>";
    expect(getFocusableElements(container)).toEqual([]);
  });
});

describe("useFocusTrap", () => {
  it("wraps Tab from the last focusable element back to the first", () => {
    const { getByText } = render(<TrapHarness />);
    const first = getByText("first");
    const last = getByText("last");
    last.focus();

    fireEvent.keyDown(last, { key: "Tab" });

    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    const { getByText } = render(<TrapHarness />);
    const first = getByText("first");
    const last = getByText("last");
    first.focus();

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(last);
  });

  it("sends the first Tab press from the container itself into the dialog, not past it", () => {
    const { getByTestId, getByText } = render(<TrapHarness />);
    const container = getByTestId("container");
    const first = getByText("first");
    container.focus();

    fireEvent.keyDown(container, { key: "Tab" });

    expect(document.activeElement).toBe(first);
  });

  it("keeps focus on the container when there is nothing focusable inside", () => {
    const { getByTestId } = render(<TrapHarness empty />);
    const container = getByTestId("container");
    container.focus();

    fireEvent.keyDown(container, { key: "Tab" });

    expect(document.activeElement).toBe(container);
  });

  it("does not interfere with keys other than Tab", () => {
    const { getByText } = render(<TrapHarness />);
    const first = getByText("first");
    first.focus();

    const event = fireEvent.keyDown(first, { key: "Enter" });

    expect(event).toBe(true); // not prevented
  });
});
