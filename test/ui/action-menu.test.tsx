import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ActionMenu } from "../../src/ui/components/ActionMenu";

function renderMenu(onSelect = vi.fn()) {
  const view = render(
    <ActionMenu
      label="More actions"
      icon="⋯"
      items={[{ label: "Duplicate recipe", onSelect }]}
    />,
  );
  const menu = view.container.querySelector("details") as HTMLDetailsElement;
  return { menu, onSelect };
}

it("closes after choosing an item and runs it", () => {
  const { menu, onSelect } = renderMenu();
  menu.open = true;
  fireEvent.click(screen.getByRole("button", { name: "Duplicate recipe" }));
  expect(onSelect).toHaveBeenCalledOnce();
  expect(menu.open).toBe(false);
});

it("closes on Escape and on a click outside", () => {
  const { menu } = renderMenu();
  menu.open = true;
  fireEvent.keyDown(document, { key: "Escape" });
  expect(menu.open).toBe(false);

  menu.open = true;
  fireEvent.pointerDown(document.body);
  expect(menu.open).toBe(false);
});
