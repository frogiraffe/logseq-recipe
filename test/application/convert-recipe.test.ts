import { describe, expect, it } from "vitest";
import {
  acceptConversionIngredientAsRaw,
  analyzeRecipeConversion,
  type ConversionSourceNode,
  classifyConversionSection,
  conversionStructure,
  correctConversionIngredient,
  correctConversionYield,
  isConversionCommittable,
} from "../../src/application/convert-recipe";
import { defaultParseContext } from "../../src/parsing/context";

function node(
  id: string,
  title: string,
  children: ConversionSourceNode[] = [],
): ConversionSourceNode {
  return { id, title, children };
}

describe("analyzeRecipeConversion", () => {
  it("recognizes localized recipe sections without writing technical metadata", () => {
    const root = node("root", "Cookie Tarifi", [
      node("yield", "Porsiyon: 8"),
      node("ingredients", "Malzemeler", [
        node("i1", "120 g tereyağı"),
        node("i2", "1 yumurta"),
      ]),
      node("steps", "Yapılış", [
        node("s1", "Tereyağını erit."),
        node("s2", "180°C'de 10-12 dakika pişir."),
      ]),
      node("notes", "Notlar", [node("n1", "Ortası yumuşak kalabilir.")]),
    ]);

    const result = analyzeRecipeConversion(root, defaultParseContext("tr"));

    expect(result.rootId).toBe("root");
    expect(result.locale).toBe("tr");
    expect(result.metadata.baseYield).toBe(8);
    expect(result.unknownSections).toEqual([]);
    expect(result.sections).toEqual([
      { blockId: "ingredients", role: "ingredients", confidence: "exact" },
      { blockId: "steps", role: "steps", confidence: "exact" },
      { blockId: "notes", role: "notes", confidence: "exact" },
    ]);
    expect(result.issues).toEqual([]);
    expect(isConversionCommittable(result)).toBe(true);
    expect(result.ingredients).toHaveLength(2);
    expect(result.ingredients[0].parsed).toMatchObject({
      amount: { kind: "exact", value: 120 },
      unit: "g",
      ingredientText: "tereyağı",
    });
    expect(result.steps[1].annotations.durations[0].value).toEqual({
      kind: "range",
      min: 10,
      max: 12,
    });

    expect(conversionStructure(result).ingredientMetadata).toEqual(
      result.ingredients.map((ingredient) => ({
        blockId: ingredient.blockId,
        parsed: ingredient.parsed,
      })),
    );
  });

  it("reports duplicate section roles rather than silently choosing one", () => {
    const root = node("root", "Recipe", [
      node("yield", "Yield: 8"),
      node("a", "Ingredients", [node("i1", "100 g flour")]),
      node("b", "Ingredients", [node("i2", "1 egg")]),
      node("steps", "Steps", [node("s1", "Mix.")]),
    ]);

    const result = analyzeRecipeConversion(root, defaultParseContext("en"));

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "duplicate-section-role",
        blockId: "b",
      }),
    );
    expect(isConversionCommittable(result)).toBe(false);
    expect(
      result.sections.filter((section) => section.role === "ingredients"),
    ).toHaveLength(2);
  });

  it("lets the user classify an unknown structured section exactly once", () => {
    const root = node("root", "Recipe", [
      node("yield", "Yield: 8"),
      node("stuff", "What you need", [node("i1", "100 g flour")]),
      node("steps", "Steps", [node("s1", "Mix.")]),
    ]);

    const result = analyzeRecipeConversion(root, defaultParseContext("en"));

    expect(result.unknownSections).toEqual([
      {
        blockId: "stuff",
        title: "What you need",
        children: [{ id: "i1", title: "100 g flour", children: [] }],
      },
    ]);
    expect(result.issues).toContainEqual({
      code: "unrecognized-section",
      message: 'Could not determine the role of section "What you need".',
      blockId: "stuff",
    });
    expect(isConversionCommittable(result)).toBe(false);

    const classified = classifyConversionSection(
      result,
      "stuff",
      "ingredients",
    );
    expect(classified.unknownSections).toEqual([]);
    expect(classified.sections).toContainEqual({
      blockId: "stuff",
      role: "ingredients",
      confidence: "exact",
    });
    expect(classified.ingredients[0].parsed).toMatchObject({
      amount: { kind: "exact", value: 100 },
      unit: "g",
      ingredientText: "flour",
    });
    expect(
      classified.issues.some((issue) => issue.code === "unrecognized-section"),
    ).toBe(false);
    expect(
      classified.issues.some(
        (issue) => issue.code === "no-ingredients-section",
      ),
    ).toBe(false);
    expect(isConversionCommittable(classified)).toBe(true);
    expect(conversionStructure(classified).ingredientMetadata).toEqual([
      {
        blockId: "i1",
        parsed: expect.objectContaining({
          rawText: "100 g flour",
          amount: { kind: "exact", value: 100 },
          unit: "g",
          ingredientText: "flour",
        }),
      },
    ]);
  });

  it("blocks conversion when base yield is missing", () => {
    const root = node("root", "Recipe", [
      node("ingredients", "Ingredients", [node("i1", "100 g flour")]),
      node("steps", "Steps", [node("s1", "Mix.")]),
    ]);

    const result = analyzeRecipeConversion(root, defaultParseContext("en"));

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing-base-yield" }),
    );
    expect(isConversionCommittable(result)).toBe(false);
  });

  it("records the source root's title so the preview can show what is being converted", () => {
    const root = node("root", "Chocolate Cookie with Tons of Butter", [
      node("ingredients", "Ingredients", [node("i1", "100 g flour")]),
      node("steps", "Steps", [node("s1", "Mix.")]),
    ]);

    const result = analyzeRecipeConversion(root, defaultParseContext("en"));

    expect(result.title).toBe("Chocolate Cookie with Tons of Butter");
  });

  it("does not invent ingredients from free-form narrative", () => {
    const root = node("root", "Cookie note", [
      node("story", "Yesterday I made cookies with some butter and sugar."),
    ]);

    const result = analyzeRecipeConversion(root, defaultParseContext("en"));

    expect(result.ingredients).toEqual([]);
    expect(result.steps).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "no-ingredients-section" }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "no-steps-section" }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing-base-yield" }),
    );
  });
});

describe("correctConversionIngredient", () => {
  function draftWithUnparsedIngredient() {
    const root = node("root", "Recipe", [
      node("yield", "Yield: 4"),
      node("ingredients", "Ingredients", [node("i1", "biraz süt")]),
      node("steps", "Steps", [node("s1", "Mix.")]),
    ]);
    return analyzeRecipeConversion(root, defaultParseContext("en"));
  }

  it("applies a user-supplied structured interpretation without touching raw text", () => {
    const draft = draftWithUnparsedIngredient();
    expect(draft.ingredients[0].parsed.confidence).toBe("unparsed");
    expect(draft.issues).toContainEqual(
      expect.objectContaining({
        code: "ingredient-amount-unparsed",
        blockId: "i1",
      }),
    );

    const corrected = correctConversionIngredient(draft, "i1", {
      amount: 120,
      unit: "ml",
      ingredientText: "süt",
    });

    expect(corrected.ingredients[0].parsed).toEqual({
      rawText: "biraz süt",
      amount: { kind: "exact", value: 120 },
      unit: "ml",
      ingredientText: "süt",
      confidence: "exact",
    });
    expect(corrected.issues).not.toContainEqual(
      expect.objectContaining({ code: "ingredient-amount-unparsed" }),
    );
    expect(isConversionCommittable(corrected)).toBe(true);
  });

  it("refuses to fabricate a value for a non-positive or missing amount", () => {
    const draft = draftWithUnparsedIngredient();
    const attempt = correctConversionIngredient(draft, "i1", {
      amount: 0,
      ingredientText: "süt",
    });
    expect(attempt).toBe(draft);

    const nanAttempt = correctConversionIngredient(draft, "i1", {
      amount: Number.NaN,
      ingredientText: "süt",
    });
    expect(nanAttempt).toBe(draft);
  });

  it("lets the user explicitly keep the raw ingredient text as-is", () => {
    const draft = draftWithUnparsedIngredient();
    const accepted = acceptConversionIngredientAsRaw(draft, "i1");

    expect(accepted.ingredients[0].parsed).toEqual(draft.ingredients[0].parsed);
    expect(accepted.issues).not.toContainEqual(
      expect.objectContaining({ code: "ingredient-amount-unparsed" }),
    );
  });
});

describe("correctConversionYield", () => {
  function draftMissingYield() {
    const root = node("root", "Recipe", [
      node("ingredients", "Ingredients", [node("i1", "100 g flour")]),
      node("steps", "Steps", [node("s1", "Mix.")]),
    ]);
    return analyzeRecipeConversion(root, defaultParseContext("en"));
  }

  it("resolves the missing-base-yield dead end without fabricating a value", () => {
    const draft = draftMissingYield();
    expect(isConversionCommittable(draft)).toBe(false);

    const corrected = correctConversionYield(draft, 8, "cookies");

    expect(corrected.metadata.baseYield).toBe(8);
    expect(corrected.metadata.yieldUnit).toBe("cookies");
    expect(corrected.issues).not.toContainEqual(
      expect.objectContaining({ code: "missing-base-yield" }),
    );
    expect(isConversionCommittable(corrected)).toBe(true);
  });

  it("allows the yield unit to be omitted", () => {
    const draft = draftMissingYield();
    const corrected = correctConversionYield(draft, 4);

    expect(corrected.metadata.baseYield).toBe(4);
    expect(corrected.metadata.yieldUnit).toBeUndefined();
  });

  it("refuses a non-positive or non-finite yield and leaves the draft unchanged", () => {
    const draft = draftMissingYield();

    expect(correctConversionYield(draft, 0)).toBe(draft);
    expect(correctConversionYield(draft, -3)).toBe(draft);
    expect(correctConversionYield(draft, Number.NaN)).toBe(draft);
    expect(draft.issues).toContainEqual(
      expect.objectContaining({ code: "missing-base-yield" }),
    );
  });
});
