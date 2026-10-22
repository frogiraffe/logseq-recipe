import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import { enMessages, frMessages } from "../../src/ui/i18n";
import { copyText, recipeText } from "../../src/ui/recipe-text";

const recipe: Recipe = {
  id: "r1",
  title: "Cookies",
  baseYield: 12,
  yieldUnit: "cookies",
  prepMinutes: 15,
  cookMinutes: 10,
  categories: [],
  tags: [],
  ingredients: [
    {
      id: "i1",
      rawText: "100 g butter",
      amount: { kind: "exact", value: 100 },
      unit: "g",
      ingredientText: "butter",
      scaleMode: "linear",
      group: { id: "g1", title: "For the dough:" },
    },
    {
      id: "i2",
      rawText: "1 pinch salt",
      amount: { kind: "exact", value: 1 },
      unit: "pinch",
      ingredientText: "salt",
      scaleMode: "fixed",
      group: { id: "g1", title: "For the dough:" },
    },
    {
      id: "i3",
      rawText: "a handful of nuts",
      ingredientText: "a handful of nuts",
      scaleMode: "linear",
    },
  ],
  steps: [
    {
      id: "s1",
      rawText: "Mix.\nThen rest.",
      durations: [],
      temperatures: [],
      heat: [],
      children: [
        { id: "c1", kind: "note", text: "Don't overmix." },
        {
          id: "c2",
          kind: "image",
          text: "![dough](../assets/dough.png)",
          path: "assets/dough.png",
          alt: "dough",
        },
      ],
    },
    {
      id: "s2",
      rawText: "Bake.",
      durations: [],
      temperatures: [],
      heat: [],
    },
  ],
  notes: [{ id: "n1", text: "Keeps for a week." }],
  sourceUrl: "https://example.com/cookies",
  schemaVersion: 1,
  ingredientConversionOverrides: [],
};

describe("recipeText", () => {
  it("writes the recipe as shown, at the chosen servings", () => {
    expect(recipeText(recipe, 24, "metric", {}, enMessages)).toBe(
      [
        "Cookies",
        "Servings: 24 cookies",
        "Prep time: 15 min · Cook time: 10 min · Total time: 25 min",
        "",
        "Ingredients",
        "For the dough:",
        "- 200 g butter",
        "- 1 pinch salt",
        "- a handful of nuts",
        "",
        "Steps",
        "1. Mix.",
        "   Then rest.",
        "   - Don't overmix.",
        "2. Bake.",
        "",
        "Notes",
        "- Keeps for a week.",
        "",
        "Source: https://example.com/cookies",
      ].join("\n"),
    );
  });

  it("keeps an ingredient's detail lines and a French group's spacing", () => {
    const detailed: Recipe = {
      ...recipe,
      ingredients: [
        {
          ...recipe.ingredients[0],
          group: { id: "g1", title: "Pour la pâte :" },
          details: ["à température ambiante"],
        },
      ],
    };
    const text = recipeText(detailed, 12, "metric", {}, frMessages);
    expect(text).toContain(
      "Pour la pâte\u00a0:\n- 100 g butter\n   à température ambiante",
    );
  });

  it("uses an ingredient's chosen unit", () => {
    expect(
      recipeText(recipe, 12, "metric", { i1: "kg" }, enMessages),
    ).toContain("- 0.1 kg butter");
  });
});

describe("copyText", () => {
  it("falls back to a selection when the Clipboard API is refused", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"));
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });

    expect(await copyText("Cookies")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
    writeText.mockRestore();
  });
});
