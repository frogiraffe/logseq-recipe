import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { FacetSuggestion } from "../../src/application/list-recipes";
import {
  ChipInput,
  filterChipSuggestions,
} from "../../src/ui/components/ChipInput";

function Harness({
  initial = [] as string[],
  suggestions = [] as FacetSuggestion[],
  variant = "tag" as "tag" | "category",
}) {
  const [values, setValues] = useState<string[]>(initial);
  return (
    <ChipInput
      values={values}
      variant={variant}
      ariaLabel="Tags"
      removeLabel="Remove"
      suggestions={suggestions}
      onChange={setValues}
    />
  );
}

describe("ChipInput", () => {
  it("commits a chip on Enter and clears the draft", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "Quick Dinner" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Quick Dinner")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("commits a chip on comma without splitting a multi-word value", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "Turkish Desserts" } });
    fireEvent.keyDown(input, { key: "," });

    expect(screen.getByText("Turkish Desserts")).toBeTruthy();
  });

  it("ignores empty tokens and trims whitespace", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryAllByRole("button", { name: /^Remove:/ })).toHaveLength(
      0,
    );

    fireEvent.change(input, { target: { value: "  Dessert  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Dessert")).toBeTruthy();
  });

  it("prevents case-insensitive duplicates", () => {
    render(<Harness initial={["Dessert"]} />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "dessert" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getAllByText(/dessert/i)).toHaveLength(1);
  });

  it("removes the last chip on Backspace when the draft is empty", () => {
    render(<Harness initial={["Dessert", "Quick"]} />);
    const input = screen.getByLabelText("Tags");
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(screen.queryByText("Quick")).toBeNull();
    expect(screen.getByText("Dessert")).toBeTruthy();
  });

  it("removes an individual chip via its remove button", () => {
    render(<Harness initial={["Dessert", "Quick"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove: Dessert" }));

    expect(screen.queryByText("Dessert")).toBeNull();
    expect(screen.getByText("Quick")).toBeTruthy();
  });

  it("commits a pending draft on blur", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "Weeknight" } });
    fireEvent.blur(input);

    expect(screen.getByText("Weeknight")).toBeTruthy();
  });

  it("splits a pasted comma-separated list into separate chips", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    const clipboardData = {
      getData: () => "Sweet, Baked, Quick",
    } as unknown as DataTransfer;
    fireEvent.paste(input, { clipboardData });

    expect(screen.getByText("Sweet")).toBeTruthy();
    expect(screen.getByText("Baked")).toBeTruthy();
    expect(screen.getByText("Quick")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("does not intercept a plain single-value paste", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    const clipboardData = {
      getData: () => "Quick Dinner",
    } as unknown as DataTransfer;
    const event = fireEvent.paste(input, { clipboardData });

    // No comma present: default paste is left to the browser/jsdom, so our
    // handler must not have called preventDefault.
    expect(event).toBe(true);
  });

  describe("autocomplete dropdown", () => {
    const suggestions: FacetSuggestion[] = [
      { value: "Dessert", count: 5 },
      { value: "Dessert Sweet", count: 2 },
      { value: "Quick Dinner", count: 3 },
    ];

    it("stays closed while the field is empty and idle", () => {
      render(<Harness suggestions={suggestions} />);
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("shows prefix matches first once the user types", () => {
      render(<Harness suggestions={suggestions} />);
      const input = screen.getByLabelText("Tags");
      fireEvent.change(input, { target: { value: "des" } });

      const options = screen.getAllByRole("option").map((el) => el.textContent);
      expect(options).toEqual(["Dessert", "Dessert Sweet"]);
    });

    it("excludes already-selected values from suggestions", () => {
      render(<Harness initial={["Dessert"]} suggestions={suggestions} />);
      const input = screen.getByLabelText("Tags");
      fireEvent.change(input, { target: { value: "des" } });

      expect(screen.queryByRole("option", { name: "Dessert" })).toBeNull();
      expect(
        screen.getByRole("option", { name: "Dessert Sweet" }),
      ).toBeTruthy();
    });

    it("commits the selected suggestion as a chip without leaving draft text", () => {
      render(<Harness suggestions={suggestions} />);
      const input = screen.getByLabelText("Tags");
      fireEvent.change(input, { target: { value: "des" } });
      fireEvent.click(screen.getByRole("option", { name: "Dessert" }));

      expect(screen.getByText("Dessert")).toBeTruthy();
      expect(screen.queryByText(/^des$/)).toBeNull();
      expect((input as HTMLInputElement).value).toBe("");
    });

    it("navigates with ArrowDown/ArrowUp and selects the highlighted option on Enter", () => {
      render(<Harness suggestions={suggestions} />);
      const input = screen.getByLabelText("Tags");
      fireEvent.change(input, { target: { value: "des" } });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(screen.getByText("Dessert Sweet")).toBeTruthy();
    });

    it("closes the dropdown on Escape without clearing the typed text", () => {
      render(<Harness suggestions={suggestions} />);
      const input = screen.getByLabelText("Tags");
      fireEvent.change(input, { target: { value: "des" } });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(screen.queryByRole("listbox")).toBeNull();
      expect((input as HTMLInputElement).value).toBe("des");
    });

    it("still commits typed text on Enter when no suggestion is highlighted", () => {
      render(<Harness suggestions={suggestions} />);
      const input = screen.getByLabelText("Tags");
      fireEvent.change(input, { target: { value: "Brand New Tag" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(screen.getByText("Brand New Tag")).toBeTruthy();
    });
  });
});

describe("filterChipSuggestions", () => {
  const suggestions: FacetSuggestion[] = [
    { value: "Dessert", count: 5 },
    { value: "Dessert Sweet", count: 2 },
    { value: "Quick Dinner", count: 3 },
  ];

  it("returns nothing for an empty query", () => {
    expect(filterChipSuggestions("", suggestions, [])).toEqual([]);
  });

  it("ranks prefix matches above contains matches", () => {
    const results = filterChipSuggestions(
      "sweet",
      [
        { value: "Dessert Sweet", count: 1 },
        { value: "Sweet Treats", count: 1 },
      ],
      [],
    );
    expect(results.map((r) => r.value)).toEqual([
      "Sweet Treats",
      "Dessert Sweet",
    ]);
  });

  it("excludes already-selected values case-insensitively", () => {
    const results = filterChipSuggestions("des", suggestions, ["dessert"]);
    expect(results.map((r) => r.value)).toEqual(["Dessert Sweet"]);
  });
});
