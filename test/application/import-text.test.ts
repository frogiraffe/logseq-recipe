import { describe, expect, it } from "vitest";
import {
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
