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

  it("does not collapse a duration range into a fake exact metadata value", () => {
    expect(
      parseRecipeMetadataLine("Cook: 10-12 minutes", defaultParseContext("en")),
    ).toEqual({ field: "cook", value: null });
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
