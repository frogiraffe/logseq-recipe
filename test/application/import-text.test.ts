import { describe, expect, it } from "vitest";
import {
  analyzeRecipeConversion,
  analyzeWithDetectedLocale,
  type ConversionSourceNode,
  detectRecipeLocale,
  isConversionCommittable,
  outlineToSource,
  parseRecipeText,
  withWrittenBlockIds,
} from "../../src/application/convert-recipe";

// Verbatim user paste: bullets only on headings, trailing markdown
// line-break spaces, a 6-space note under a step, and three steps that
// slid back to column 0.
const MINI_HOAGIE = `- Mini Hoagie Rolls
  Porsiyon: 8 adet
  Hazırlık: 30 dk
  Dinlendirme: 165 dk
  Pişirme: 22 dk
  Kaynak: https://brianlagerstrom.com/recipes/crockpot-italian-beef/
- Malzemeler
    450 g ekmeklik un
    290 g su (ılık)
    11,5 g instant maya
    19 g şeker
    11,5 g tuz
    26 g zeytinyağı
    1 tk kuru kekik (üzeri için)
- Yapılış
    Ilık su, instant maya, şeker, un, tuz ve zeytinyağını büyük bir kapta birleştir.
    Hamuru yaklaşık 8-12 dakika yoğur. Hamur pürüzsüz ve elastik olmalı.
      Hamur çok kuru görünüyorsa hemen ek su ekleme.
    Ekmekleri 190°C'de yaklaşık 20-24 dakika pişir.
    18. dakikadan itibaren renklerini kontrol et.
Ekmekleri fırından çıkar ve hemen tel ızgaraya al.
Kesmeden önce en az 30 dakika tamamen soğumalarını bekle.

- Notlar
    Bu versiyonda SteamAdd kullanılmaz.
    Çok fazla tezgah unu kullanmak iç dokuyu kurutabilir.`;

function source(...titles: string[]): ConversionSourceNode {
  return {
    id: "root",
    title: "Recipe",
    children: titles.map((title, index) => ({
      id: `c${index}`,
      title,
      children: [],
    })),
  };
}

describe("parseRecipeText", () => {
  it("groups a real pasted recipe by its section headings, not its ragged indentation", () => {
    const outline = parseRecipeText(MINI_HOAGIE);
    expect(outline?.text).toBe("Mini Hoagie Rolls");
    expect(outline?.children.map((child) => child.text)).toEqual([
      "Porsiyon: 8 adet",
      "Hazırlık: 30 dk",
      "Dinlendirme: 165 dk",
      "Pişirme: 22 dk",
      "Kaynak: https://brianlagerstrom.com/recipes/crockpot-italian-beef/",
      "Malzemeler",
      "Yapılış",
      "Notlar",
    ]);

    const [ingredients, steps, notes] = outline?.children.slice(5) ?? [];
    expect(ingredients.children).toHaveLength(7);
    expect(steps.children.map((step) => step.text)).toEqual([
      "Ilık su, instant maya, şeker, un, tuz ve zeytinyağını büyük bir kapta birleştir.",
      "Hamuru yaklaşık 8-12 dakika yoğur. Hamur pürüzsüz ve elastik olmalı.",
      "Ekmekleri 190°C'de yaklaşık 20-24 dakika pişir.",
      // Starts with a number but the list isn't numbered - kept as written.
      "18. dakikadan itibaren renklerini kontrol et.",
      "Ekmekleri fırından çıkar ve hemen tel ızgaraya al.",
      "Kesmeden önce en az 30 dakika tamamen soğumalarını bekle.",
    ]);
    expect(steps.children[1].children[0].text).toBe(
      "Hamur çok kuru görünüyorsa hemen ek su ekleme.",
    );
    expect(notes.children).toHaveLength(2);
  });

  it("converts end to end: Turkish detected, metric, yield and times read", () => {
    const outline = parseRecipeText(MINI_HOAGIE);
    if (!outline) throw new Error("expected an outline");
    const { draft, detectedLocale } = analyzeWithDetectedLocale(
      outlineToSource(outline),
      "en",
    );

    expect(detectedLocale).toBe("tr");
    expect(draft.sourceMeasurementSystem).toBe("metric");
    expect(draft.metadata).toMatchObject({
      baseYield: 8,
      prepMinutes: 30,
      chillMinutes: 165,
      cookMinutes: 22,
    });
    expect(draft.ingredients).toHaveLength(7);
    expect(draft.steps).toHaveLength(6);
    expect(isConversionCommittable(draft)).toBe(true);
  });

  it("accepts markdown headings, bold/colon headings, and strips 1..n step numbering", () => {
    const outline = parseRecipeText(
      [
        "# Pancakes",
        "Servings: 4",
        "## Ingredients:",
        "* 200 g flour",
        "**Steps**",
        "1. Mix.",
        "2. Cook.",
      ].join("\n"),
    );
    expect(outline).toEqual({
      text: "Pancakes",
      children: [
        { text: "Servings: 4", children: [] },
        {
          text: "Ingredients",
          children: [{ text: "200 g flour", children: [] }],
        },
        {
          text: "Steps",
          children: [
            { text: "Mix.", children: [] },
            { text: "Cook.", children: [] },
          ],
        },
      ],
    });
  });

  it("returns null without any section heading - no structure is guessed", () => {
    expect(parseRecipeText("Pancakes\n200 g flour\nMix and cook.")).toBeNull();
  });
});

describe("detectRecipeLocale", () => {
  it("scores section headings and metadata labels per locale", () => {
    expect(
      detectRecipeLocale(source("Porsiyon: 4", "Malzemeler", "Yapılış"), "en"),
    ).toBe("tr");
  });

  it("breaks an en/fr tie with the preferred locale, else gives up", () => {
    const shared = source("Ingredients", "Instructions", "Notes");
    expect(detectRecipeLocale(shared, "en")).toBe("en");
    expect(detectRecipeLocale(shared, "tr")).toBeNull();
    expect(
      detectRecipeLocale(
        source("Servings: 4", "Ingredients", "Instructions", "Notes"),
        "fr",
      ),
    ).toBe("en");
  });

  it("returns null when nothing matches any locale", () => {
    expect(detectRecipeLocale(source("Hello", "World"), "en")).toBeNull();
  });

  describe("a tie broken by unit words only one language has", () => {
    // Headings English and French share, with the lines under them.
    function recipe(
      [ingredientsTitle, stepsTitle, notesTitle]: readonly string[],
      lines: readonly string[],
    ): ConversionSourceNode {
      const [ingredients, steps] = [lines.slice(0, -1), lines.slice(-1)];
      const section = (
        title: string,
        items: readonly string[],
        index: number,
      ) => ({
        id: `s${index}`,
        title,
        children: items.map((item, line) => ({
          id: `s${index}.${line}`,
          title: item,
          children: [],
        })),
      });
      return {
        id: "root",
        title: "Recipe",
        children: [
          section(ingredientsTitle, ingredients, 0),
          section(stepsTitle, steps, 1),
          section(notesTitle, [], 2),
        ],
      };
    }
    const tied = (...lines: string[]) =>
      recipe(["Ingrédients", "Préparation", "Notes"], lines);
    const tiedEnglish = (...lines: string[]) =>
      recipe(["Ingredients", "Preparation", "Notes"], lines);

    const french = tied(
      "250 g de farine",
      "2 c. à soupe de sucre",
      "1 pincée de sel",
      "Cuire 20 minutes à 180°C.",
    );

    it("reads a French recipe with French-only units as French", () => {
      expect(detectRecipeLocale(french, "en")).toBe("fr");
      expect(detectRecipeLocale(french, "tr")).toBe("fr");
    });

    it("reads its units in French measures, unless the user picks a system", () => {
      const { draft, detectedLocale } = analyzeWithDetectedLocale(french, "en");
      expect(detectedLocale).toBe("fr");
      expect(draft.sourceMeasurementSystem).toBe("metric");
      expect(draft.ingredients[1].parsed.unit).toBe("tbsp_metric");

      const chosen = analyzeRecipeConversion(french, {
        locale: "fr",
        sourceMeasurementSystem: "us",
      });
      expect(chosen.sourceMeasurementSystem).toBe("us");
      expect(chosen.ingredients[1].parsed.unit).toBe("tbsp_us");
    });

    it("keeps the old choice when only shared units appear", () => {
      // "g", "ml", "minutes", "°C" are French and English alike, and
      // "tasse" is French and German.
      const neutral = tied(
        "250 g de farine",
        "500 ml de lait",
        "1 tasse de sucre",
        "Cuire 20 minutes à 180°C.",
      );
      expect(detectRecipeLocale(neutral, "en")).toBe("en");
      expect(detectRecipeLocale(neutral, "tr")).toBeNull();
    });

    it("does not guess when the units disagree", () => {
      const mixed = tied(
        "2 c. à soupe de sucre",
        "1 cup milk",
        "Cuire 20 minutes.",
      );
      expect(detectRecipeLocale(mixed, "en")).toBe("en");
      expect(detectRecipeLocale(mixed, "fr")).toBe("fr");
      expect(detectRecipeLocale(mixed, "tr")).toBeNull();
    });

    it("does not pick a language the headings don't name", () => {
      const turkishUnits = tied("2 yemek kaşığı şeker", "Pişirin.");
      expect(detectRecipeLocale(turkishUnits, "en")).toBe("en");
      expect(detectRecipeLocale(turkishUnits, "de")).toBeNull();
    });

    it("needs an amount before the unit word", () => {
      expect(
        detectRecipeLocale(
          tied("Cuillère à soupe de sucre", "Servir en cuillère à soupe."),
          "en",
        ),
      ).toBe("en");
      expect(
        detectRecipeLocale(
          tied("2 cuillères à soupe de crème", "Servir."),
          "en",
        ),
      ).toBe("fr");
      expect(
        detectRecipeLocale(
          tied("Crème, 2 grosses cuillères à soupe", "Servir."),
          "en",
        ),
      ).toBe("en");
    });

    describe("never on a counted unit, which another language may use as a plain word", () => {
      // "pot" and "sachet" are only in the French pack, but English writes
      // them too.
      it.each([
        ["2 pots of cream", "250 g flour", "Bake for 20 minutes."],
        [
          "1 sachet dried yeast",
          "500 g strong white flour",
          "Bake 30 minutes.",
        ],
      ])("keeps an English recipe with %s as it was", (...lines) => {
        const english = tiedEnglish(...lines);
        expect(detectRecipeLocale(english, "en")).toBe("en");
        expect(detectRecipeLocale(english, "tr")).toBeNull();
      });

      it("reads a French recipe with only counted units as before", () => {
        const counted = tied("2 gousses d'ail", "1 pincée de sel", "Servir.");
        expect(detectRecipeLocale(counted, "en")).toBe("en");
        expect(detectRecipeLocale(counted, "tr")).toBeNull();
      });
    });

    it.each([
      ["fr", "1 cuillère à soupe d'huile"],
      ["de", "2 EL Öl"],
      ["tr", "2 yemek kaşığı şeker"],
      ["es", "2 cucharadas de azúcar"],
    ] as const)(
      "reads %s measuring words in a five-way tie: %s",
      (locale, line) => {
        // "URL" is a label every language shares.
        const shared = source("URL: https://example.com", line);
        expect(detectRecipeLocale(shared, "en")).toBe(locale);
        expect(
          detectRecipeLocale(source("URL: https://example.com", "Öl"), "en"),
        ).toBe("en");
      },
    );

    it("breaks a French/German tie the same way", () => {
      // "Portion" is the one label French and German share.
      expect(detectRecipeLocale(source("Portion: 4", "2 EL Öl"), "fr")).toBe(
        "de",
      );
      expect(detectRecipeLocale(source("Portion: 4", "Öl"), "fr")).toBe("fr");
    });

    it("leaves a clear heading winner alone", () => {
      expect(
        detectRecipeLocale(
          source("Malzemeler", "Yapılış", "2 c. à soupe de sucre"),
          "en",
        ),
      ).toBe("tr");
      expect(
        detectRecipeLocale(source("Ingredients", "Method", "2 EL Öl"), "fr"),
      ).toBe("en");
    });
  });
});

describe("withWrittenBlockIds", () => {
  it("moves a previewed conversion onto the blocks written for it", () => {
    const structure = {
      rootId: "import",
      sectionRoles: [{ blockId: "import.0", role: "ingredients" as const }],
      ingredientMetadata: [
        {
          blockId: "import.0.0",
          parsed: {
            rawText: "1 egg",
            ingredientText: "egg",
            confidence: "exact" as const,
          },
        },
      ],
    };
    const ids = new Map([
      ["import", "root-uuid"],
      ["import.0", "section-uuid"],
      ["import.0.0", "egg-uuid"],
    ]);

    expect(withWrittenBlockIds(structure, ids)).toMatchObject({
      rootId: "root-uuid",
      sectionRoles: [{ blockId: "section-uuid" }],
      ingredientMetadata: [{ blockId: "egg-uuid" }],
    });
    expect(() => withWrittenBlockIds(structure, new Map())).toThrow(
      "No block was written for import",
    );
  });
});
