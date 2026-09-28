import { describe, expect, it } from "vitest";
import {
  type ConversionSourceNode,
  isSectionHeadingInAnyLocale,
  parseRecipeText,
  planRecipeConversion,
} from "../../src/application/convert-recipe";
import type { OutlineNode } from "../../src/application/split-outline";
import { defaultParseContext } from "../../src/parsing/context";

// Just the text tree, for compact expectations.
function shape(node: OutlineNode): unknown {
  return node.children.length === 0
    ? node.text
    : { [node.text]: node.children.map(shape) };
}

describe("section headings", () => {
  it.each([
    "Malzemeler:",
    "## Malzemeler",
    "**Ingredients:**",
    "Malzemeler (8 adet için)",
    "Hamur için malzemeler",
    "Kekin yapılışı",
    "Hamurun malzemeleri",
    "Nasıl yapılır?",
    "Ingredients for the dough",
    "Zutaten für den Teig",
    "Préparation de la pâte",
    "Ingredientes para la masa",
  ])("recognizes %s", (heading) => {
    expect(isSectionHeadingInAnyLocale(heading)).toBe(true);
  });

  it.each([
    "Mix the dry ingredients",
    "Malzemeleri karıştırın.",
    "Préparation de la sauce : mélanger le beurre et la farine",
    "Ingredients for a really big family dinner party",
    "200 g malzemeler",
  ])("leaves the instruction %s alone", (line) => {
    expect(isSectionHeadingInAnyLocale(line)).toBe(false);
  });
});

describe("import tidying", () => {
  it("turns 'Label:' lines in the ingredients into groups", () => {
    const outline = parseRecipeText(
      [
        "Börek",
        "Porsiyon: 4",
        "Malzemeler",
        "Hamur için:",
        "200 g un",
        "1 yumurta",
        "İç harcı için:",
        "250 g peynir",
        "Yapılış",
        "Karıştır.",
      ].join("\n"),
    );
    expect(outline && shape(outline)).toEqual({
      Börek: [
        "Porsiyon: 4",
        {
          Malzemeler: [
            { "Hamur için:": ["200 g un", "1 yumurta"] },
            { "İç harcı için:": ["250 g peynir"] },
          ],
        },
        { Yapılış: ["Karıştır."] },
      ],
    });
  });

  it("merges a recipe written in parts into one section of each kind", () => {
    const outline = parseRecipeText(
      [
        "Pasta",
        "Kek için malzemeler",
        "3 yumurta",
        "Krema için malzemeler",
        "500 ml süt",
        "Kekin yapılışı",
        "Yumurtaları çırp.",
        "Kremanın hazırlanışı",
        "Sütü ısıt.",
      ].join("\n"),
    );
    expect(outline && shape(outline)).toEqual({
      Pasta: [
        {
          Malzemeler: [
            { "Kek için malzemeler": ["3 yumurta"] },
            { "Krema için malzemeler": ["500 ml süt"] },
          ],
        },
        {
          // Steps have no groups: each part's heading stays as a line.
          Yapılış: [
            "Kekin yapılışı",
            "Yumurtaları çırp.",
            "Kremanın hazırlanışı",
            "Sütü ısıt.",
          ],
        },
      ],
    });
  });
});

describe("Convert rebuilds grouped recipes", () => {
  const en = defaultParseContext("en");
  const node = (
    id: string,
    title: string,
    children: ConversionSourceNode[] = [],
  ): ConversionSourceNode => ({ id, title, children });

  it("offers to nest flat 'Label:' ingredient groups", () => {
    const plan = planRecipeConversion(
      node("r", "Pie", [
        node("y", "Servings: 6"),
        node("i", "Ingredients", [
          node("l1", "For the crust:"),
          node("a", "200 g flour"),
          node("l2", "For the filling:"),
          node("b", "3 apples"),
        ]),
        node("s", "Steps", [node("s1", "Bake.")]),
      ]),
      en,
    );
    expect(plan.kind).toBe("split");
    if (plan.kind !== "split") return;
    expect(shape(plan.outline)).toEqual({
      Pie: [
        "Servings: 6",
        {
          Ingredients: [
            { "For the crust:": ["200 g flour"] },
            { "For the filling:": ["3 apples"] },
          ],
        },
        { Steps: ["Bake."] },
      ],
    });
  });

  it("offers to merge repeated sections instead of refusing them", () => {
    const plan = planRecipeConversion(
      node("r", "Pie", [
        node("y", "Servings: 6"),
        node("i1", "Ingredients for the crust", [node("a", "200 g flour")]),
        node("i2", "Ingredients for the filling", [node("b", "3 apples")]),
        node("s", "Steps", [node("s1", "Bake.")]),
      ]),
      en,
    );
    expect(plan.kind).toBe("split");
    if (plan.kind !== "split") return;
    expect(shape(plan.outline)).toEqual({
      Pie: [
        "Servings: 6",
        {
          Ingredients: [
            { "Ingredients for the crust": ["200 g flour"] },
            { "Ingredients for the filling": ["3 apples"] },
          ],
        },
        { Steps: ["Bake."] },
      ],
    });
  });

  it("converts an already grouped outline as it is", () => {
    const plan = planRecipeConversion(
      node("r", "Pie", [
        node("y", "Servings: 6"),
        node("i", "Ingredients", [
          node("g", "For the crust:", [node("a", "200 g flour")]),
        ]),
        node("s", "Steps", [node("s1", "Bake.")]),
      ]),
      en,
    );
    expect(plan.kind).toBe("convert");
  });
});
