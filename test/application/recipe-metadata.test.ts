import { describe, expect, it } from "vitest";
import { parseRecipeMetadataLine } from "../../src/application/recipe-metadata";
import { defaultParseContext } from "../../src/parsing/context";

describe("recipe root metadata parsing", () => {
  it("parses Turkish yield and exact duration metadata", () => {
    const context = defaultParseContext("tr");
    expect(parseRecipeMetadataLine("Porsiyon: 8", context)).toEqual({
      field: "yield",
      value: { baseYield: 8 },
    });
    expect(parseRecipeMetadataLine("Hazırlık: 1 saat 30 dk", context)).toEqual({
      field: "prep",
      value: 90,
    });
    expect(parseRecipeMetadataLine("Pişirme: 12 dk", context)).toEqual({
      field: "cook",
      value: 12,
    });
  });

  it("preserves a yield unit when explicitly written", () => {
    expect(
      parseRecipeMetadataLine("Yield: 12 cookies", defaultParseContext("en")),
    ).toEqual({
      field: "yield",
      value: { baseYield: 12, yieldUnit: "cookies" },
    });
  });

  it("reads a grouped serving count", () => {
    expect(
      parseRecipeMetadataLine(
        "Yield: 1,000 servings",
        defaultParseContext("en"),
      )?.value,
    ).toEqual({
      baseYield: 1000,
      yieldUnit: "servings",
    });
  });

  it("does not collapse a duration range into a fake exact metadata value", () => {
    expect(
      parseRecipeMetadataLine("Cook: 10-12 minutes", defaultParseContext("en")),
    ).toEqual({ field: "cook", value: null });
  });

  it("does not sum alternative cooking times", () => {
    expect(
      parseRecipeMetadataLine(
        "Cook: 10 min or 12 min",
        defaultParseContext("en"),
      )?.value,
    ).toBeNull();
    expect(
      parseRecipeMetadataLine(
        "Pişirme: 10 dakika veya 12 dakika",
        defaultParseContext("tr"),
      )?.value,
    ).toBeNull();
  });

  it("keeps a single time followed by a condition", () => {
    expect(
      parseRecipeMetadataLine(
        "Cook: 45 min or until golden",
        defaultParseContext("en"),
      )?.value,
    ).toBe(45);
    expect(
      parseRecipeMetadataLine(
        "Cocción: 10 min o hasta dorar",
        defaultParseContext("es"),
      )?.value,
    ).toBe(10);
  });

  it("reads a yield with a describing parenthetical", () => {
    expect(
      parseRecipeMetadataLine(
        "Yield: 1 loaf (about 10 slices)",
        defaultParseContext("en"),
      )?.value,
    ).toEqual({ baseYield: 1, yieldUnit: "loaf" });
  });

  it("reads a duration in a different supported language than its label", () => {
    expect(
      parseRecipeMetadataLine("Pişirme: 1 h 5 min", defaultParseContext("tr"))
        ?.value,
    ).toBe(65);
    expect(
      parseRecipeMetadataLine("Cook: 1 saat 5 dk", defaultParseContext("tr"))
        ?.value,
    ).toBe(65);
  });

  it("accepts a source as free text, not only http(s) URLs", () => {
    expect(
      parseRecipeMetadataLine(
        "Source: https://example.com/recipe",
        defaultParseContext("en"),
      ),
    ).toEqual({ field: "source", value: "https://example.com/recipe" });
    expect(
      parseRecipeMetadataLine("Source: my cookbook", defaultParseContext("en")),
    ).toEqual({ field: "source", value: "my cookbook" });
  });
});

describe("metadata durations with unrecognized parts", () => {
  it("reads short hour units instead of dropping the hour", () => {
    expect(
      parseRecipeMetadataLine("Cook: 1 h 5 min", defaultParseContext("en"))
        ?.value,
    ).toBe(65);
    expect(
      parseRecipeMetadataLine("Pişirme: 1 sa 5 dk", defaultParseContext("tr"))
        ?.value,
    ).toBe(65);
  });

  it("rejects a value with a number outside any recognized duration", () => {
    expect(
      parseRecipeMetadataLine("Cook: 1 zz 5 min", defaultParseContext("en"))
        ?.value,
    ).toBeNull();
  });
});
