import { describe, expect, it } from "vitest";
import {
  analyzeRecipeConversion,
  type ConversionSourceNode,
  conversionStructure,
} from "../../src/application/convert-recipe";
import { defaultParseContext } from "../../src/parsing/context";

const node = (
  id: string,
  title: string,
  children: ConversionSourceNode[] = [],
): ConversionSourceNode => ({ id, title, children });

describe("conversion root metadata", () => {
  it("carries recognized metadata into the DB commit structure", () => {
    const root = node("root", "Cookie", [
      node("yield", "Porsiyon: 8"),
      node("prep", "Hazırlık: 15 dk"),
      node("cook", "Pişirme: 12 dk"),
      node("source", "Kaynak: https://example.com/cookie"),
      node("ingredients", "Malzemeler", [node("i1", "120 g un")]),
      node("steps", "Yapılış", [node("s1", "Karıştır.")]),
    ]);

    const draft = analyzeRecipeConversion(root, defaultParseContext("tr"));
    expect(draft.metadata).toMatchObject({
      baseYield: 8,
      prepMinutes: 15,
      cookMinutes: 12,
      sourceUrl: "https://example.com/cookie",
    });
    expect(conversionStructure(draft)).toMatchObject({
      rootId: "root",
      baseYield: 8,
      prepMinutes: 15,
      cookMinutes: 12,
      sourceUrl: "https://example.com/cookie",
    });
  });

  it("reports recognized metadata whose value cannot be represented safely", () => {
    const root = node("root", "Recipe", [
      node("cook", "Cook: 10-12 minutes"),
      node("ingredients", "Ingredients", [node("i1", "1 egg")]),
      node("steps", "Steps", [node("s1", "Cook.")]),
    ]);

    const draft = analyzeRecipeConversion(root, defaultParseContext("en"));
    expect(draft.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-metadata-value",
        blockId: "cook",
      }),
    );
    expect(draft.metadata.cookMinutes).toBeUndefined();
  });
});
