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
  regroupConversionSource,
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
      detail: "What you need",
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
  });

  it("surfaces an unrecognized leaf line as ignored/unclassified content instead of silently dropping it", () => {
    const root = node("root", "Recipe", [
      node("yield", "Yield: 8"),
      node("stray", "Adapted from a family recipe."),
      node("ingredients", "Ingredients", [node("i1", "100 g flour")]),
      node("steps", "Steps", [node("s1", "Mix.")]),
    ]);

    const result = analyzeRecipeConversion(root, defaultParseContext("en"));

    expect(result.issues).toContainEqual({
      code: "unclassified-content",
      message:
        'Line "Adapted from a family recipe." was not recognized as a section, metadata field, ingredient, step, or note, and will be ignored.',
      detail: "Adapted from a family recipe.",
      blockId: "stray",
    });
    // Purely informational - it must not block an otherwise-valid conversion.
    expect(isConversionCommittable(result)).toBe(true);
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

  it("requires a choice before converting a line with two amounts", () => {
    const draft = analyzeRecipeConversion(
      node("root", "Recipe", [
        node("y", "Yield: 2"),
        node("i", "Ingredients", [node("i1", "1 kg flour + 200 g sugar")]),
        node("s", "Steps", [node("s1", "Mix.")]),
      ]),
      defaultParseContext("en"),
    );
    expect(draft.issues).toContainEqual(
      expect.objectContaining({
        code: "ingredient-amount-ambiguous",
        blockId: "i1",
      }),
    );
    expect(isConversionCommittable(draft)).toBe(false);
    expect(
      isConversionCommittable(acceptConversionIngredientAsRaw(draft, "i1")),
    ).toBe(true);
  });

  it("offers a line with no amount for review without blocking", () => {
    const draft = analyzeRecipeConversion(
      node("root", "Recipe", [
        node("y", "Yield: 2"),
        node("i", "Ingredients", [
          node("i1", "Salt and pepper to taste"),
          node("i2", "Tuz, karabiber"),
        ]),
        node("s", "Steps", [node("s1", "Mix.")]),
      ]),
      defaultParseContext("en"),
    );
    expect(draft.issues.map((issue) => issue.code)).toEqual([
      "ingredient-amount-unparsed",
      "ingredient-amount-unparsed",
    ]);
    expect(isConversionCommittable(draft)).toBe(true);
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

describe("regroupConversionSource", () => {
  // The real paste shape: metadata on the title block, headings sharing a
  // block with their items, steps/notes landing as siblings of their
  // heading, and one step with a genuine nested child.
  const pasted = node(
    "root",
    "Chunky Chocolate Chip Cookies\nYield: 4 cookies\nPrep: 15 min\nCook: 11 min",
    [
      node("ing", "Ingredients\n  60 g butter\n  100 g flour"),
      node("steps", "Steps\n  Melt the butter.\n    Do not brown it."),
      node("s2", "Add the sugar."),
      node("s3", "Bake for 10 min.\n  Edges should color.", [
        node("s3a", "Rest on the tray."),
      ]),
      node("notes", "Notes\n  Centers look underdone."),
      node("n2", "Half milk, half dark chocolate."),
    ],
  );

  it("rebuilds a convertible outline from a mis-split paste", () => {
    const context = defaultParseContext("en");
    expect(analyzeRecipeConversion(pasted, context).steps).toHaveLength(0);

    const outline = regroupConversionSource(pasted, context);
    expect(outline?.text).toBe("Chunky Chocolate Chip Cookies");
    expect(outline?.children.map((n) => n.text)).toEqual([
      "Yield: 4 cookies",
      "Prep: 15 min",
      "Cook: 11 min",
      "Ingredients",
      "Steps",
      "Notes",
    ]);
    const [, , , ingredients, steps, notes] = outline?.children ?? [];
    expect(ingredients.children.map((n) => n.text)).toEqual([
      "60 g butter",
      "100 g flour",
    ]);
    // Indented continuation lines become nested blocks, exactly as the
    // single-block split nests them; the step's own text stays one line.
    expect(steps.children.map((n) => n.text)).toEqual([
      "Melt the butter.",
      "Add the sugar.",
      "Bake for 10 min.",
    ]);
    expect(steps.children[0].children.map((n) => n.text)).toEqual([
      "Do not brown it.",
    ]);
    expect(steps.children[2].children.map((n) => n.text)).toEqual([
      "Edges should color.",
      "Rest on the tray.",
    ]);
    expect(notes.children).toHaveLength(2);
  });

  it("moves metadata out of a multi-line title block of a nested recipe", () => {
    const outline = regroupConversionSource(
      node("root", "Cookies\nYield: 4", [
        node("ing", "Ingredients", [node("i1", "60 g butter")]),
        node("st", "Steps", [node("s1", "Bake.")]),
      ]),
      defaultParseContext("en"),
    );
    expect(outline?.text).toBe("Cookies");
    expect(outline?.children.map((n) => n.text)).toEqual([
      "Yield: 4",
      "Ingredients",
      "Steps",
    ]);
  });

  it("keeps a step's unindented extra lines in its own text", () => {
    const outline = regroupConversionSource(
      node("root", "Soup\nYield: 2", [
        node("i", "Ingredients\n1 l water"),
        node("s", "Steps\nBoil the water.\nThen salt it."),
        node("s2", "Simmer for 10 min.\nStir now and then."),
      ]),
      defaultParseContext("en"),
    );
    const steps = outline?.children.find((n) => n.text === "Steps");
    expect(steps?.children.map((n) => n.text)).toEqual([
      "Boil the water.",
      "Then salt it.",
      "Simmer for 10 min.\nStir now and then.",
    ]);
  });

  it("returns null when regrouping still finds no steps", () => {
    const context = defaultParseContext("en");
    expect(
      regroupConversionSource(
        node("root", "Shopping list", [node("a", "milk"), node("b", "eggs")]),
        context,
      ),
    ).toBeNull();
  });
});

describe("English labels under another recipe language", () => {
  it("recognizes English headings and metadata in a Turkish recipe", () => {
    const draft = analyzeRecipeConversion(
      node("root", "Kurabiye", [
        node("y", "Yield: 4 cookies"),
        node("p", "Prep: 15 min"),
        node("ing", "Ingredients", [node("i1", "60 g tereyağı")]),
        node("st", "Steps", [node("s1", "Tereyağını erit.")]),
        node("n", "Notes", [node("n1", "Yarı sütlü.")]),
      ]),
      defaultParseContext("tr"),
    );
    expect(draft.metadata).toMatchObject({ baseYield: 4, prepMinutes: 15 });
    expect(draft.sections.map((s) => s.role)).toEqual([
      "ingredients",
      "steps",
      "notes",
    ]);
    expect(draft.ingredients[0].parsed.amount).toEqual({
      kind: "exact",
      value: 60,
    });
    expect(isConversionCommittable(draft)).toBe(true);
  });
});
