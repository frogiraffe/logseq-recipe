import { describe, expect, it } from "vitest";
import {
  formatMinutes,
  parseRecipeMetadataLine,
  rewriteMinutesValue,
  rewriteYieldLine,
} from "../../src/application/recipe-metadata";
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

describe("yields written without a colon", () => {
  it.each([
    ["en", "Serves 4", { baseYield: 4 }],
    ["en", "Makes 12 cookies", { baseYield: 12, yieldUnit: "cookies" }],
    ["tr", "4 kişilik", { baseYield: 4, yieldUnit: "kişilik" }],
    ["tr", "6 kişi için", { baseYield: 6, yieldUnit: "kişi için" }],
    ["tr", "Kaç kişilik: 2", { baseYield: 2 }],
    ["tr", "Kişi sayısı: 4", { baseYield: 4 }],
    ["fr", "Pour 4 personnes", { baseYield: 4, yieldUnit: "personnes" }],
    ["de", "Für 4 Personen", { baseYield: 4, yieldUnit: "Personen" }],
    ["es", "Para 4 personas", { baseYield: 4, yieldUnit: "personas" }],
  ] as const)("reads %s %s", (locale, text, value) => {
    expect(parseRecipeMetadataLine(text, defaultParseContext(locale))).toEqual({
      field: "yield",
      value,
    });
  });

  it.each([
    ["tr", "2 kişi için ayrı tabaklara bölün"],
    ["en", "4 eggs"],
    ["de", "Für den Teig"],
    ["en", "Serves"],
  ] as const)("leaves %s %s alone", (locale, text) => {
    expect(
      parseRecipeMetadataLine(text, defaultParseContext(locale)),
    ).toBeNull();
  });

  it("rewrites a count in place, keeping the cook's words", () => {
    expect(rewriteYieldLine("Serves 4-6", 8, undefined, undefined)).toBe(
      "Serves 8",
    );
    expect(rewriteYieldLine("4 kişilik", 6, "kişilik", "kişilik")).toBe(
      "6 kişilik",
    );
    expect(
      rewriteYieldLine("Makes 12 cookies", 24, "biscuits", "cookies"),
    ).toBe("Makes 24 biscuits");
    expect(rewriteYieldLine("Servings: 4", 6, "people", undefined)).toBe(
      "Servings: 6 people",
    );
  });

  it.each([
    ["en", "Serves 4 to 6", "Serves 8"],
    ["fr", "Pour 4 à 6 personnes", "Pour 8 personnes"],
    ["de", "Für 4 bis 6 Personen", "Für 8 Personen"],
    ["es", "Para 4 a 6 personas", "Para 8 personas"],
    ["tr", "4 ile 6 kişilik", "8 kişilik"],
  ] as const)(
    "rewrites a %s range in words whole: %s",
    (locale, text, rewritten) => {
      const parsed = parseRecipeMetadataLine(text, defaultParseContext(locale));
      const unit =
        parsed?.field === "yield" ? parsed.value?.yieldUnit : undefined;
      expect(rewriteYieldLine(text, 8, unit, unit)).toBe(rewritten);
      // Still read as the yield, so the next change rewrites it again.
      expect(
        parseRecipeMetadataLine(rewritten, defaultParseContext(locale))?.value,
      ).toMatchObject({ baseYield: 8 });
    },
  );
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

describe("writing a time back into its line", () => {
  it.each([
    ["en", "Cook"],
    ["tr", "Pişirme"],
    ["fr", "Cuisson"],
    ["de", "Kochzeit"],
    ["es", "Cocción"],
  ] as const)("reads back what it writes in %s", (locale, label) => {
    const context = defaultParseContext(locale);
    for (const minutes of [0, 5, 45, 60, 90, 125, 22.5]) {
      const line = `${label}: ${formatMinutes(minutes, locale)}`;
      expect(parseRecipeMetadataLine(line, context)?.value).toBe(minutes);
    }
  });

  it("keeps a plain minute amount's own wording", () => {
    expect(
      rewriteMinutesValue("15 dakika", 20, defaultParseContext("tr")),
    ).toBe("20 dakika");
  });

  it("rewrites hours and combined times instead of just their number", () => {
    const tr = defaultParseContext("tr");
    const en = defaultParseContext("en");
    expect(rewriteMinutesValue("1 saat", 90, tr)).toBe("1 saat 30 dk");
    expect(rewriteMinutesValue("1 saat 30 dk", 100, tr)).toBe("1 saat 40 dk");
    expect(rewriteMinutesValue("1½ hours", 30, en)).toBe("30 min");
    expect(rewriteMinutesValue("1 h", 120, en)).toBe("2 h");
    expect(rewriteMinutesValue("1 h 30 min", 100, en)).toBe("1 h 40 min");
    expect(rewriteMinutesValue("1 h 30", 100, defaultParseContext("fr"))).toBe(
      "1 h 40 min",
    );
  });
});
