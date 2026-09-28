import { describe, expect, it } from "vitest";
import {
  analyzeWithDetectedLocale,
  type ConversionDraft,
  isConversionCommittable,
  outlineToSource,
  parseRecipeText,
  planRecipeConversion,
} from "../../src/application/convert-recipe";
import type { OutlineNode } from "../../src/application/split-outline";
import type { RecipeLocale } from "../../src/domain/recipe";
import { defaultParseContext } from "../../src/parsing/context";

// Whole recipes as they are pasted from recipe sites and notes apps: each
// one read end to end by Import, the way the cook would paste it.

const KEK = `Kremalı Pasta
Porsiyon: 8
Hazırlama süresi: 30 dk
Pişirme süresi: 35 dk

Malzemeler
Kek için:
4 yumurta
1 su bardağı toz şeker
1,5 su bardağı un
1 paket kabartma tozu
Krema için:
500 ml süt
2 yemek kaşığı dolusu nişasta
1 paket vanilin

Yapılışı
Yumurta ve şekeri köpük kıvamına gelene kadar 5 dakika çırpın.
Unu ve kabartma tozunu ekleyip karıştırın.
Önceden ısıtılmış 175 derece fırında 35 dakika pişirin.
Kremayı hazırlayıp soğuyan kekin üzerine sürün.

Notlar
Kek tamamen soğumadan krema sürmeyin.`;

const MERCIMEK = `Mercimek Çorbası
4 kişilik

Malzemeler
1 su bardağı kırmızı mercimek
1 adet kuru soğan
1 adet havuç
2 yemek kaşığı tereyağı
6 su bardağı sıcak su
Tuz

Yapılışı
1. Soğanı ve havucu doğrayıp tereyağında 3-4 dakika kavurun.
2. Mercimeği ve suyu ekleyin.
3. Kısık ateşte 25 dakika pişirin.
4. Blenderdan geçirip servis edin.`;

const CHILI = `Easy Chili
Serves 4-6
Prep: 15 min
Cook: 1 hour 15 minutes

## Ingredients
- 1 tbsp olive oil
- 500 g ground beef
- 1 (400 g) can kidney beans, drained
- 2 (15 oz) cans diced tomatoes
- 1 onion, chopped
- 2 cloves garlic
- Salt to taste

## Method
1. Brown the beef in the oil for 8-10 minutes.
2. Add the onion and garlic and cook 5 minutes.
3. Add the beans and tomatoes and simmer for 1 hour 15 minutes.`;

const PANCAKES = `Fluffy Pancakes

Ingredients
1 1/2 cups flour
3 1/2 tsp baking powder
1 tbsp sugar
1 1/4 cups milk
1 egg
3 tbsp butter, melted

Directions
Whisk the dry ingredients.
Add milk, egg and butter and mix until smooth.
Cook on a hot griddle about 2 minutes per side.`;

const COOKIES = `Chocolate Chip Cookies
Makes about 24

**Ingredients:**
For the dough:
225 g butter, softened
200 g brown sugar
2 eggs
280 g flour
For the topping:
150 g chocolate chips

**Instructions:**
Cream the butter and sugar.
Beat in the eggs, then the flour.
Fold in the chips and bake at 180°C (350°F) for 10-12 minutes.`;

const BAKLAVA = `Ev Baklavası
Kaç kişilik: 10

Hamur için malzemeler
3 yumurta
1 su bardağı süt
1 kg un
Şerbeti için malzemeler
3 su bardağı toz şeker
3 su bardağı su
Yarım limon suyu

Nasıl yapılır?
Hamuru yoğurup 12 bezeye ayırın ve 30 dakika dinlendirin.
Yufkaları açıp tepsiye dizin.
180 derece fırında 1 saat pişirin.
Soğuk şerbeti sıcak baklavaya dökün.`;

const MENEMEN = `Menemen
2 kişilik

Ingredients
3 yumurta
2 adet domates
2 adet sivri biber
1 yemek kaşığı tereyağı

Steps
Biberleri tereyağında 3 dakika kavurun.
Domatesleri ekleyip suyunu çekene kadar pişirin.
Yumurtaları kırıp karıştırın.`;

const SOUP = `Tomato Soup
Serves 4 to 6

Ingredients
2 tins chopped tomatoes
1 bunch basil
1 head garlic
500 ml vegetable stock
1 stick butter

Method
Roast the garlic for 40-45 minutes.
Simmer everything for 20 minutes, then blend.

Notes
Freezes well for up to 3 months.`;

const POGACA = `## Peynirli Poğaça
Kişi sayısı: 4
Hazırlama süresi: 1 saat 15 dakika

## Malzemeler (12 adet için):
- 1 su bardağı ılık süt
  - oda sıcaklığında olsun
- 1 paket instant maya
- 500 g un
- 1 kutu beyaz peynir
- 1 demet maydanoz

## Yapılışı:
1. Süt ve mayayı karıştırıp 10 dakika bekletin.
2. Unu ekleyip yoğurun, 1 saat mayalandırın.
3. 180 derece fırında 20-25 dakika pişirin.`;

const BROWNIES = `Brownies
Makes 12 cookies

Ingredients
2 cans condensed milk
1 stick butter
200 g dark chocolate

Method
Melt the butter and chocolate for 5 minutes.
Bake at 350°F (175°C) for 1 hour to 1 hour 10 minutes.
Broil at 450°F for 2 minutes, then cool at 200°F for 10 minutes.`;

const SOUPE = `Soupe à la tomate
Pour 4 à 6 personnes
Préparation : 15 min

Ingrédients
2 tasses de bouillon
1 boîte de tomates
1 botte de persil
1 c. à s. d'huile d'olive

Préparation
Faire revenir l'oignon 5 minutes.
Laisser mijoter 1 heure 15 minutes.`;

const GULASCH = `Gulasch
Für 4 bis 6 Personen

Zutaten für den Eintopf
1 Dose Tomaten
2 Zweige Rosmarin
500 g Rindfleisch
1 Kopf Knoblauch

Zubereitung
Das Fleisch 10 Minuten anbraten.
1 Stunde 15 Minuten schmoren lassen.`;

const SOPA = `Sopa de ajo
Para 4 a 6 personas

Ingredientes
1 cabeza de ajo
1 lata de tomates
2 ramitas de romero
1 litro de caldo

Preparación
Dorar el ajo durante 5 minutos.
Cocer a fuego lento 1 hora y 15 minutos.`;

// `preferred`: the cook's own recipe language, which wins a tie.
function imported(
  text: string,
  preferred: RecipeLocale = "en",
): {
  outline: OutlineNode;
  draft: ConversionDraft;
} {
  const outline = parseRecipeText(text, defaultParseContext(preferred));
  if (!outline) throw new Error("no outline");
  const { draft } = analyzeWithDetectedLocale(
    outlineToSource(outline),
    preferred,
  );
  return { outline, draft };
}

function units(draft: ConversionDraft): Array<string | undefined> {
  return draft.ingredients.map((i) => i.parsed.unit);
}

function minutes(draft: ConversionDraft, step: number) {
  return draft.steps[step].annotations.durations.map((d) =>
    d.value.kind === "range"
      ? `${d.value.min}-${d.value.max} ${d.unit}`
      : `${"value" in d.value ? d.value.value : "?"} ${d.unit}`,
  );
}

function line(draft: ConversionDraft, rawText: string) {
  const found = draft.ingredients.find((i) => i.parsed.rawText === rawText);
  if (!found) throw new Error(`no ingredient ${rawText}`);
  return found.parsed;
}

// The group headings Import nests ingredients under.
function groups(outline: OutlineNode): string[] {
  return outline.children
    .flatMap((section) => section.children)
    .filter((child) => child.children.length > 0)
    .map((child) => child.text);
}

describe("Import of real pasted recipes", () => {
  it.each([
    ["a Turkish cake in groups", KEK, "tr", 8, 7],
    ["a Turkish soup with numbered steps", MERCIMEK, "tr", 4, 6],
    ["an English chili with cans", CHILI, "en", 4, 7],
    ["English pancakes with no servings", PANCAKES, "en", 1, 6],
    ["English cookies with group labels", COOKIES, "en", 24, 5],
    ["a Turkish baklava written in parts", BAKLAVA, "tr", 10, 6],
    ["a Turkish recipe under English headings", MENEMEN, "en", 2, 4],
    ["an English soup with a worded range", SOUP, "en", 4, 5],
    ["a Turkish pastry with markdown headings", POGACA, "tr", 4, 5],
    ["English brownies with two heats", BROWNIES, "en", 12, 3],
    ["a French soup", SOUPE, "fr", 4, 4],
    ["a German stew", GULASCH, "de", 4, 4],
    ["a Spanish soup", SOPA, "es", 4, 4],
  ] as const)("reads %s", (_name, text, locale, servings, ingredients) => {
    const { draft } = imported(text, locale);
    expect(isConversionCommittable(draft)).toBe(true);
    expect(draft.locale).toBe(locale);
    expect(draft.metadata.baseYield).toBe(servings);
    expect(draft.ingredients).toHaveLength(ingredients);
    expect(draft.steps.length).toBeGreaterThan(1);
  });

  it("keeps groups, counted units, and times of a Turkish cake", () => {
    const { outline, draft } = imported(KEK);
    expect(groups(outline)).toEqual(["Kek için:", "Krema için:"]);
    expect(draft.metadata).toMatchObject({ prepMinutes: 30, cookMinutes: 35 });
    expect(line(draft, "1 paket kabartma tozu").unit).toBe("package");
    expect(line(draft, "2 yemek kaşığı dolusu nişasta")).toMatchObject({
      unit: "tbsp_metric",
      note: "dolusu",
    });
    expect(draft.sections.map((section) => section.role)).toEqual([
      "ingredients",
      "steps",
      "notes",
    ]);
  });

  it("drops step numbers and lets an unmeasured line through", () => {
    const { draft } = imported(MERCIMEK);
    expect(draft.steps[0].rawText).toMatch(/^Soğanı/);
    expect(draft.issues.map((issue) => issue.code)).toEqual([
      "ingredient-amount-unparsed",
    ]);
  });

  it("reads a can with its size, and hours with minutes as one time", () => {
    const { draft } = imported(CHILI);
    expect(line(draft, "1 (400 g) can kidney beans, drained")).toMatchObject({
      amount: { kind: "exact", value: 1 },
      unit: "can",
      note: "400 g",
    });
    expect(line(draft, "2 (15 oz) cans diced tomatoes")).toMatchObject({
      amount: { kind: "exact", value: 2 },
      unit: "can",
    });
    expect(draft.metadata.cookMinutes).toBe(75);
    expect(draft.steps[2].annotations.durations[0]).toMatchObject({
      value: { kind: "exact", value: 75 },
      unit: "minute",
    });
  });

  it("counts a recipe with no servings as one, and asks", () => {
    const { draft } = imported(PANCAKES);
    expect(draft.issues.map((issue) => issue.code)).toContain(
      "missing-base-yield",
    );
  });

  it("nests ingredients under their labels, and reads a converted heat once", () => {
    const { outline, draft } = imported(COOKIES);
    expect(groups(outline)).toEqual(["For the dough:", "For the topping:"]);
    expect(draft.steps[2].annotations.temperatures).toHaveLength(1);
  });

  it("merges a recipe written in parts into groups", () => {
    const { outline, draft } = imported(BAKLAVA);
    expect(groups(outline)).toEqual([
      "Hamur için malzemeler",
      "Şerbeti için malzemeler",
    ]);
    expect(line(draft, "Yarım limon suyu").amount).toEqual({
      kind: "exact",
      value: 0.5,
    });
  });

  it("reads tins, bunches, heads, and sticks as counted units", () => {
    const { draft } = imported(SOUP);
    expect(draft.ingredients.map((i) => i.parsed.unit)).toEqual([
      "can",
      "bunch",
      "head",
      "ml",
      "stick",
    ]);
  });

  it("keeps a line under an ingredient with it, under markdown headings", () => {
    const { outline, draft } = imported(POGACA, "tr");
    expect(draft.title).toBe("Peynirli Poğaça");
    expect(draft.metadata.prepMinutes).toBe(75);
    const ingredients = outline.children.find((c) =>
      c.text.startsWith("Malzemeler"),
    );
    expect(ingredients?.children[0]).toEqual({
      text: "1 su bardağı ılık süt",
      children: [{ text: "oda sıcaklığında olsun", children: [] }],
    });
    expect(units(draft)).toEqual([
      "su_bardagi",
      "package",
      "g",
      "can",
      "bunch",
    ]);
    expect(minutes(draft, 1)).toEqual(["1 hour"]);
    expect(draft.steps[2].annotations.temperatures).toHaveLength(1);
  });

  it("reads an hour range, and tells a converted heat from a second one", () => {
    const { draft } = imported(BROWNIES);
    expect(draft.metadata).toMatchObject({
      baseYield: 12,
      yieldUnit: "cookies",
    });
    expect(units(draft)).toEqual(["can", "stick", "g"]);
    expect(minutes(draft, 1)).toEqual(["60-70 minute"]);
    expect(draft.steps[1].annotations.temperatures).toHaveLength(1);
    expect(draft.steps[2].annotations.temperatures.map((t) => t.value)).toEqual(
      [450, 200],
    );
  });

  it.each([
    ["fr", SOUPE, ["cup_metric", "can", "bunch", "tbsp_metric"], "personnes"],
    ["de", GULASCH, ["can", "sprig", "g", "head"], "Personen"],
    ["es", SOPA, ["head", "can", "sprig", "l"], "personas"],
  ] as const)(
    "reads a %s recipe's counted units, range, and hour with minutes",
    (locale, text, expected, yieldUnit) => {
      const { draft } = imported(text, locale);
      expect(draft.sourceMeasurementSystem).toBe("metric");
      expect(draft.metadata.yieldUnit).toBe(yieldUnit);
      expect(units(draft)).toEqual(expected);
      expect(minutes(draft, 1)).toEqual(["75 minute"]);
    },
  );

  it.each([
    ["KEK", KEK],
    ["CHILI", CHILI],
  ])("rebuilds %s pasted into one Logseq block", (_name, text) => {
    const plan = planRecipeConversion(
      { id: "block", title: text, children: [] },
      defaultParseContext("en"),
    );
    expect(plan.kind).toBe("split");
    if (plan.kind !== "split") return;
    const { draft } = analyzeWithDetectedLocale(
      outlineToSource(plan.outline, "block"),
      "en",
    );
    expect(isConversionCommittable(draft)).toBe(true);
    expect(draft.ingredients.length).toBeGreaterThan(4);
  });
});
