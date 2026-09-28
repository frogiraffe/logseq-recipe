import { describe, expect, it } from "vitest";
import {
  analyzeRecipeConversion,
  type ConversionSourceNode,
} from "../../src/application/convert-recipe";
import {
  ingredientLines,
  isIngredientGroupHeading,
} from "../../src/application/ingredient-groups";
import { defaultParseContext } from "../../src/parsing/context";

const tr = defaultParseContext("tr");

function node(
  id: string,
  title: string,
  children: ConversionSourceNode[] = [],
): ConversionSourceNode {
  return { id, title, children };
}

describe("ingredient groups", () => {
  it("reads a line with ingredients nested under it as a group heading", () => {
    expect(
      isIngredientGroupHeading(
        node("g", "Hamur için", [node("a", "200 g un")]),
        tr,
      ),
    ).toBe(true);
    // An ingredient with a note under it keeps its own amount.
    expect(
      isIngredientGroupHeading(
        node("b", "200 g tereyağı", [node("n", "oda sıcaklığında")]),
        tr,
      ),
    ).toBe(false);
    expect(isIngredientGroupHeading(node("t", "Tuz"), tr)).toBe(false);
  });

  it("keeps an unmeasured ingredient with one note under it an ingredient", () => {
    const en = defaultParseContext("en");
    expect(
      isIngredientGroupHeading(
        node("s", "Salt to taste", [node("n", "preferably flaky sea salt")]),
        en,
      ),
    ).toBe(false);
    expect(
      isIngredientGroupHeading(
        node("t", "Tuz", [node("n", "kaya tuzu tercih edin")]),
        tr,
      ),
    ).toBe(false);
    // A colon, a second line, or a measured line still makes a heading.
    expect(
      isIngredientGroupHeading(
        node("g", "Garnish:", [node("p", "parsley")]),
        en,
      ),
    ).toBe(true);
    expect(
      isIngredientGroupHeading(
        node("g", "For serving", [
          node("l", "lemon wedges"),
          node("p", "parsley"),
        ]),
        en,
      ),
    ).toBe(true);
    expect(
      isIngredientGroupHeading(
        node("g", "Glaze", [node("s", "100 g sugar")]),
        en,
      ),
    ).toBe(true);
  });

  it("lists every ingredient in order with the heading it sits under", () => {
    const lines = ingredientLines(
      [
        node("g1", "Hamur için", [
          node("a", "200 g un"),
          node("b", "1 yumurta"),
        ]),
        node("g2", "İç harcı için:", [node("c", "250 g peynir")]),
        node("s", "Tuz"),
      ],
      tr,
    );
    expect(
      lines.map(({ line, group }) => [line.title, group?.title ?? null]),
    ).toEqual([
      ["200 g un", "Hamur için"],
      ["1 yumurta", "Hamur için"],
      ["250 g peynir", "İç harcı için:"],
      ["Tuz", null],
    ]);
  });

  it("converts grouped ingredients instead of dropping them", () => {
    const draft = analyzeRecipeConversion(
      node("r", "Börek", [
        node("y", "Porsiyon: 4"),
        node("i", "Malzemeler", [
          node("g1", "Hamur için", [
            node("a", "200 g un"),
            node("b", "1 yumurta"),
          ]),
          node("g2", "İç harcı için:", [node("c", "250 g peynir")]),
        ]),
        node("s", "Yapılış", [node("s1", "Karıştır.")]),
      ]),
      tr,
    );

    expect(draft.ingredients.map((i) => [i.blockId, i.parsed.rawText])).toEqual(
      [
        ["a", "200 g un"],
        ["b", "1 yumurta"],
        ["c", "250 g peynir"],
      ],
    );
    // The headings are not ingredients waiting for an amount.
    expect(
      draft.issues.filter((issue) => issue.code.startsWith("ingredient")),
    ).toEqual([]);
  });
});
