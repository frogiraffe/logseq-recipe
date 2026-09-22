import { describe, expect, it } from "vitest";
import {
  flattenUnsplitSource,
  looksUnsplit,
  splitIndentedOutline,
} from "../../src/application/split-outline";

describe("splitIndentedOutline", () => {
  it("returns null for a single line - nothing to split", () => {
    expect(splitIndentedOutline("Classic Banana Bread")).toBeNull();
  });

  it("returns null when every line shares the same indentation as the first", () => {
    expect(
      splitIndentedOutline(
        "Classic Banana Bread\nYield: 10 slices\nCook: 55 min",
      ),
    ).toBeNull();
  });

  it("builds a nested tree from a realistic recipe outline", () => {
    const text = [
      "Classic Banana Bread",
      "  Yield: 10 slices",
      "  Prep: 15 min",
      "  Cook: 55-60 min",
      "  Ingredients",
      "    3 ripe bananas (mashed)",
      "    120 g butter (melted)",
      "  Steps",
      "    Preheat the oven to 175°C.",
      "    Fold in the flour just until no dry streaks remain.",
      "  Notes",
      "    Very ripe bananas give the best flavor.",
    ].join("\n");

    const tree = splitIndentedOutline(text);

    expect(tree?.text).toBe("Classic Banana Bread");
    expect(tree?.children.map((node) => node.text)).toEqual([
      "Yield: 10 slices",
      "Prep: 15 min",
      "Cook: 55-60 min",
      "Ingredients",
      "Steps",
      "Notes",
    ]);

    const ingredients = tree?.children.find((n) => n.text === "Ingredients");
    expect(ingredients?.children.map((n) => n.text)).toEqual([
      "3 ripe bananas (mashed)",
      "120 g butter (melted)",
    ]);

    const steps = tree?.children.find((n) => n.text === "Steps");
    expect(steps?.children.map((n) => n.text)).toEqual([
      "Preheat the oven to 175°C.",
      "Fold in the flour just until no dry streaks remain.",
    ]);

    const notes = tree?.children.find((n) => n.text === "Notes");
    expect(notes?.children.map((n) => n.text)).toEqual([
      "Very ripe bananas give the best flavor.",
    ]);
  });

  it("strips a ```lang fenced code block wrapper before splitting", () => {
    const fenced = [
      "```text",
      "Classic Banana Bread",
      "  Ingredients",
      "    2 eggs",
      "```",
    ].join("\n");

    const tree = splitIndentedOutline(fenced);

    expect(tree?.text).toBe("Classic Banana Bread");
    expect(tree?.children[0].text).toBe("Ingredients");
    expect(tree?.children[0].children[0].text).toBe("2 eggs");
  });

  it("ignores blank lines within the outline", () => {
    const text = "Title\n  Ingredients\n\n    1 egg\n\n  Steps\n    Mix.";

    const tree = splitIndentedOutline(text);

    expect(tree?.children.map((n) => n.text)).toEqual(["Ingredients", "Steps"]);
    expect(tree?.children[0].children.map((n) => n.text)).toEqual(["1 egg"]);
  });

  it("supports tab indentation, not just spaces", () => {
    const text = "Title\n\tIngredients\n\t\t1 egg";

    const tree = splitIndentedOutline(text);

    expect(tree?.children[0].text).toBe("Ingredients");
    expect(tree?.children[0].children[0].text).toBe("1 egg");
  });

  it("returns to a shallower level correctly after several deep lines", () => {
    // Steps must become a sibling of Ingredients, not get nested under it,
    // once the indentation returns to the same level as "Ingredients".
    const text = [
      "Title",
      "  Ingredients",
      "    1 egg",
      "    2 cups flour",
      "  Steps",
      "    Mix.",
    ].join("\n");

    const tree = splitIndentedOutline(text);

    expect(tree?.children.map((n) => n.text)).toEqual(["Ingredients", "Steps"]);
    expect(tree?.children[1].children.map((n) => n.text)).toEqual(["Mix."]);
  });
});

describe("looksUnsplit", () => {
  it("is true for zero children - a single block holding everything", () => {
    expect(looksUnsplit([])).toBe(true);
  });

  it("is true when every child is a flat leaf with no children of its own", () => {
    expect(
      looksUnsplit([{ children: [] }, { children: [] }, { children: [] }]),
    ).toBe(true);
  });

  it("is false once at least one child has real nested children", () => {
    expect(
      looksUnsplit([{ children: [] }, { children: [{ children: [] }] }]),
    ).toBe(false);
  });
});

describe("flattenUnsplitSource", () => {
  it("reconstructs the full outline text from flat sibling chunks Logseq split a paste into", () => {
    // The exact real-world shape reported: Logseq chunked one paste into
    // 3 flat sibling blocks instead of a single blob or a real tree.
    const text = flattenUnsplitSource({
      title: "Classic Banana Bread",
      children: [
        { title: "Yield: 10 slices\nPrep: 15 min\nCook: 60 min", children: [] },
        {
          title:
            "Ingredients\n  3 ripe bananas (mashed)\n  120 g butter (melted)",
          children: [],
        },
        { title: "Steps\n  Preheat the oven to 175°C.", children: [] },
      ],
    });

    const tree = splitIndentedOutline(text);

    expect(tree?.text).toBe("Classic Banana Bread");
    expect(tree?.children.map((n) => n.text)).toEqual([
      "Yield: 10 slices",
      "Prep: 15 min",
      "Cook: 60 min",
      "Ingredients",
      "Steps",
    ]);
    const ingredients = tree?.children.find((n) => n.text === "Ingredients");
    expect(ingredients?.children.map((n) => n.text)).toEqual([
      "3 ripe bananas (mashed)",
      "120 g butter (melted)",
    ]);
  });
});
