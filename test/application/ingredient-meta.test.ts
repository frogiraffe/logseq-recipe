import { describe, expect, it } from "vitest";
import {
  decodeIngredientMeta,
  encodeIngredientMeta,
  ingredientMetaMatchesContext,
} from "../../src/application/ingredient-meta";
import { defaultParseContext } from "../../src/parsing/context";
import { parseIngredient } from "../../src/parsing/ingredient";

describe("ingredient metadata codec", () => {
  it("round-trips structured ingredient data with parser context", () => {
    const context = defaultParseContext("en");
    context.sourceMeasurementSystem = "us";
    const parsed = parseIngredient("1 cup flour", context);

    const decoded = decodeIngredientMeta(encodeIngredientMeta(parsed, context));

    expect(decoded).toMatchObject({
      version: 1,
      locale: "en",
      sourceMeasurementSystem: "us",
      parsed: {
        rawText: "1 cup flour",
        amount: { kind: "exact", value: 1 },
        unit: "cup_us",
        ingredientText: "flour",
      },
    });
    expect(
      decoded && ingredientMetaMatchesContext(decoded, parsed.rawText, context),
    ).toBe(true);
  });

  it("rejects malformed metadata instead of trusting it", () => {
    expect(decodeIngredientMeta("not-json")).toBeNull();
    expect(
      decodeIngredientMeta(
        JSON.stringify({
          version: 1,
          locale: "en",
          sourceMeasurementSystem: "us",
          parsed: {
            rawText: "1 cup flour",
            ingredientText: "flour",
            confidence: "exact",
            amount: { kind: "exact", value: "1" },
            unit: "cup_us",
          },
        }),
      ),
    ).toBeNull();
  });

  it("invalidates metadata when raw text or parse context changes", () => {
    const us = defaultParseContext("en");
    us.sourceMeasurementSystem = "us";
    const metric = defaultParseContext("en");
    metric.sourceMeasurementSystem = "metric";
    const parsed = parseIngredient("1 cup flour", us);
    const decoded = decodeIngredientMeta(encodeIngredientMeta(parsed, us));

    expect(decoded).not.toBeNull();
    if (!decoded) return;

    expect(ingredientMetaMatchesContext(decoded, "1 cup flour", us)).toBe(true);
    expect(ingredientMetaMatchesContext(decoded, "2 cup flour", us)).toBe(
      false,
    );
    expect(ingredientMetaMatchesContext(decoded, "1 cup flour", metric)).toBe(
      false,
    );
  });
});
