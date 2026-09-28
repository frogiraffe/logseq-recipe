import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecipeFilter } from "../../src/application/list-recipes";
import { FilterBar } from "../../src/ui/components/FilterBar";
import { enMessages } from "../../src/ui/i18n";

describe("FilterBar category/tag filters", () => {
  it("adds a category chip and reports it as the filter", () => {
    const onChange = vi.fn<(filter: RecipeFilter) => void>();
    render(
      <FilterBar
        filter={{}}
        messages={enMessages}
        categorySuggestions={[]}
        tagSuggestions={[]}
        sortBy="title"
        onChange={onChange}
        onSortChange={() => undefined}
      />,
    );

    const input = screen.getByLabelText(enMessages.category);
    fireEvent.change(input, { target: { value: "Dessert" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ categories: ["Dessert"] }),
    );
  });

  it("clears the tags filter entirely once the last chip is removed", () => {
    const onChange = vi.fn<(filter: RecipeFilter) => void>();
    render(
      <FilterBar
        filter={{ tags: ["Quick"] }}
        messages={enMessages}
        categorySuggestions={[]}
        tagSuggestions={[]}
        sortBy="title"
        onChange={onChange}
        onSortChange={() => undefined}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: `${enMessages.remove}: Quick` }),
    );

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ tags: undefined }),
    );
  });

  it("only shows Clear filters once a filter is active, and it resets everything", () => {
    const onChange = vi.fn<(filter: RecipeFilter) => void>();
    const { rerender } = render(
      <FilterBar
        filter={{}}
        messages={enMessages}
        categorySuggestions={[]}
        tagSuggestions={[]}
        sortBy="title"
        onChange={onChange}
        onSortChange={() => undefined}
      />,
    );
    expect(
      screen.queryByRole("button", { name: enMessages.clearFilters }),
    ).toBeNull();

    rerender(
      <FilterBar
        filter={{ query: "cookie" }}
        messages={enMessages}
        categorySuggestions={[]}
        tagSuggestions={[]}
        sortBy="title"
        onChange={onChange}
        onSortChange={() => undefined}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.clearFilters }),
    );
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("offers Clear filters for a 0-minute bound, not for a range cleared to no bounds", () => {
    const clear = (filter: RecipeFilter) => {
      const { unmount } = render(
        <FilterBar
          filter={filter}
          messages={enMessages}
          categorySuggestions={[]}
          tagSuggestions={[]}
          sortBy="title"
          onChange={() => undefined}
          onSortChange={() => undefined}
        />,
      );
      const button = screen.queryByRole("button", {
        name: enMessages.clearFilters,
      });
      unmount();
      return button;
    };

    expect(clear({ prepMinutes: { min: 0 } })).not.toBeNull();
    expect(clear({ totalMinutes: { max: 0 } })).not.toBeNull();
    expect(
      clear({ cookMinutes: { min: undefined, max: undefined } }),
    ).toBeNull();
  });

  it("keeps Contains ingredient/Category/Tags/time ranges behind a Filters disclosure, with Sort and Search always visible", () => {
    const { container } = render(
      <FilterBar
        filter={{}}
        messages={enMessages}
        categorySuggestions={[]}
        tagSuggestions={[]}
        sortBy="title"
        onChange={() => undefined}
        onSortChange={() => undefined}
      />,
    );
    expect(screen.getByLabelText(enMessages.sortBy)).toBeTruthy();
    expect(screen.getByLabelText(enMessages.searchRecipes)).toBeTruthy();

    const disclosure = container.querySelector("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure?.querySelector("summary")?.textContent).toBe(
      enMessages.filters,
    );
    expect(
      disclosure?.contains(
        screen.getByLabelText(enMessages.containsIngredient),
      ),
    ).toBe(true);
  });
});
