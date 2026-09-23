import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ArchivedRecipesView } from "../../src/ui/components/ArchivedRecipesView";
import { enMessages } from "../../src/ui/i18n";

it("shows archived recipes and offers restore and native Logseq navigation", () => {
  const onRestore = vi.fn();
  const onOpenInLogseq = vi.fn();
  render(
    <ArchivedRecipesView
      recipes={[
        {
          id: "recipe-1",
          title: "Cookie",
          categories: [],
          tags: [],
          ingredientTexts: [],
          archivedAt: Date.UTC(2026, 8, 23),
        },
        {
          id: "recipe-2",
          title: "Soup",
          categories: [],
          tags: [],
          ingredientTexts: [],
        },
      ]}
      messages={enMessages}
      onRestore={onRestore}
      onDelete={vi.fn()}
      onOpenInLogseq={onOpenInLogseq}
    />,
  );

  expect(screen.getByText("Cookie")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Restore: Cookie" }));
  fireEvent.click(screen.getByRole("button", { name: "Open in Logseq: Soup" }));
  expect(onRestore).toHaveBeenCalledWith("recipe-1");
  expect(onOpenInLogseq).toHaveBeenCalledWith("recipe-2");
  expect(screen.getAllByText(enMessages.restoreRecipe)).toHaveLength(2);
});

it("distinguishes an empty archive from a loading archive", () => {
  const props = {
    recipes: [],
    messages: enMessages,
    onRestore: vi.fn(),
    onDelete: vi.fn(),
    onOpenInLogseq: vi.fn(),
  };
  const { rerender } = render(<ArchivedRecipesView {...props} loading />);
  expect(screen.queryByText(enMessages.noArchivedRecipes)).toBeNull();

  rerender(<ArchivedRecipesView {...props} />);
  expect(screen.getByText(enMessages.noArchivedRecipes)).toBeTruthy();
});

it("asks for confirmation before permanently deleting", () => {
  const onDelete = vi.fn();
  render(
    <ArchivedRecipesView
      recipes={[
        {
          id: "recipe-1",
          title: "Cookie",
          categories: [],
          tags: [],
          ingredientTexts: [],
        },
      ]}
      messages={enMessages}
      onRestore={vi.fn()}
      onDelete={onDelete}
      onOpenInLogseq={vi.fn()}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: enMessages.deleteRecipePermanently }),
  );
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));
  expect(
    screen.queryByText(enMessages.deleteRecipePermanentlyConfirm),
  ).toBeNull();

  fireEvent.click(
    screen.getByRole("button", { name: enMessages.deleteRecipePermanently }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: `${enMessages.deleteRecipePermanently}: Cookie`,
    }),
  );
  expect(onDelete).toHaveBeenCalledWith("recipe-1");
});
