import { describe, expect, it } from "vitest";
import {
  decodeRecipeMeta,
  encodeRecipeMeta,
} from "../../src/application/recipe-meta";

describe("RecipeMeta codec", () => {
  it("round-trips portable recipe metadata", () => {
    const meta = {
      categories: ["Tatlı"],
      tags: ["Quick", "Chocolate"],
      parserLocale: "tr" as const,
      sourceMeasurementSystem: "metric" as const,
      measurementSystemOverride: "us" as const,
      ingredientConversionOverrides: [
        {
          ingredientKey: "özel kakao",
          massUnit: "g" as const,
          volumeUnit: "tbsp_metric" as const,
          gramsPerVolumeUnit: 8.5,
        },
      ],
    };

    expect(decodeRecipeMeta(encodeRecipeMeta(meta))).toEqual(meta);
  });

  it("returns safe empty metadata for malformed JSON", () => {
    expect(decodeRecipeMeta("{broken")).toEqual({
      categories: [],
      tags: [],
      ingredientConversionOverrides: [],
    });
  });

  it("drops unsupported locales, systems and invalid conversion overrides", () => {
    expect(
      decodeRecipeMeta(
        JSON.stringify({
          categories: ["Dessert", 42],
          tags: "not-an-array",
          parserLocale: "ar",
          sourceMeasurementSystem: "unknown",
          measurementSystemOverride: "imperial",
          ingredientConversionOverrides: [
            {
              ingredientKey: "valid",
              massUnit: "g",
              volumeUnit: "cup_metric",
              gramsPerVolumeUnit: 120,
            },
            {
              ingredientKey: "bad",
              massUnit: "g",
              volumeUnit: "cup_metric",
              gramsPerVolumeUnit: 0,
            },
          ],
        }),
      ),
    ).toEqual({
      categories: ["Dessert"],
      tags: [],
      measurementSystemOverride: "imperial",
      ingredientConversionOverrides: [
        {
          ingredientKey: "valid",
          massUnit: "g",
          volumeUnit: "cup_metric",
          gramsPerVolumeUnit: 120,
        },
      ],
    });
  });
});
