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

it.each([
  // A card's menu opening rightward from x = 235 in a 320 px window.
  ["start", 235, "-143px 0"],
  // The list's ▾ menu opening leftward from its button's right edge at 168.
  ["end", 138, "60px 0"],
  // Room to spare: left where its CSS puts it.
  ["start", 20, ""],
] as const)(
  "keeps an open %s menu inside a narrow window",
  (align, left, shift) => {
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 320,
    });
    const view = render(
      <ActionMenu
        label="More actions"
        icon="⋯"
        align={align}
        items={[{ label: "Duplicate recipe", onSelect: vi.fn() }]}
      />,
    );
    const menu = view.container.querySelector("details") as HTMLDetailsElement;
    const list = menu.querySelector(".draft-recipe-menu-items") as HTMLElement;
    vi.spyOn(menu, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: left, y: 0, width: 30, height: 30 }),
    );
    Object.defineProperty(list, "offsetWidth", { value: 220 });

    menu.open = true;
    fireEvent(menu, new Event("toggle"));

    expect(list.style.translate).toBe(shift);
    Reflect.deleteProperty(document.documentElement, "clientWidth");
  },
);

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
