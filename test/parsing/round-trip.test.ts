import { describe, expect, it } from "vitest";
import type { Ingredient } from "../../src/domain/recipe";
import type { MeasurementSystem } from "../../src/domain/unit";
import { defaultParseContext } from "../../src/parsing/context";
import { parseIngredient } from "../../src/parsing/ingredient";
import { formatIngredientForDisplay } from "../../src/ui/ingredient-display";

function roundTrip(
  ingredient: Ingredient,
  system: MeasurementSystem,
  locale: "en" | "tr",
) {
  const rendered = formatIngredientForDisplay(ingredient, 1, 1, system);
  const context = defaultParseContext(locale);
  context.sourceMeasurementSystem = system;
  return { rendered, reparsed: parseIngredient(rendered, context) };
}

describe("ingredient formatter/parser round-trip", () => {
  it("preserves an exact mixed-fraction US volume quantity", () => {
    const ingredient: Ingredient = {
      id: "flour",
      rawText: "1 1/2 cups flour",
      amount: { kind: "exact", value: 1.5 },
      unit: "cup_us",
      ingredientText: "flour",
      scaleMode: "linear",
    };

    const { rendered, reparsed } = roundTrip(ingredient, "us", "en");

    expect(rendered).toBe("1½ cups flour");
    expect(reparsed).toMatchObject({
      amount: { kind: "exact", value: 1.5 },
      unit: "cup_us",
      ingredientText: "flour",
      confidence: "exact",
    });
  });

  it("preserves a formatted range and canonical US tablespoon unit", () => {
    const ingredient: Ingredient = {
      id: "milk",
      rawText: "2-3 tbsp milk",
      amount: { kind: "range", min: 2, max: 3 },
      unit: "tbsp_us",
      ingredientText: "milk",
      scaleMode: "linear",
    };

    const { rendered, reparsed } = roundTrip(ingredient, "us", "en");

    expect(rendered).toBe("2–3 tbsp milk");
    expect(reparsed).toMatchObject({
      amount: { kind: "range", min: 2, max: 3 },
      unit: "tbsp_us",
      ingredientText: "milk",
    });
  });

  it("preserves metric amount, unit, ingredient text and explicit note", () => {
    const ingredient: Ingredient = {
      id: "chocolate",
      rawText: "120 g bitter çikolata (iri doğranmış)",
      amount: { kind: "exact", value: 120 },
      unit: "g",
      ingredientText: "bitter çikolata",
      note: "iri doğranmış",
      scaleMode: "linear",
    };

    const { rendered, reparsed } = roundTrip(ingredient, "metric", "tr");

    expect(rendered).toBe("120 g bitter çikolata (iri doğranmış)");
    expect(reparsed).toMatchObject({
      amount: { kind: "exact", value: 120 },
      unit: "g",
      ingredientText: "bitter çikolata",
      note: "iri doğranmış",
    });
  });
});
