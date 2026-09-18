import { describe, expect, it } from "vitest";
import { defaultParseContext } from "../../src/parsing/context";
import { parseStep } from "../../src/parsing/step";

describe("duration annotations", () => {
  it.each([
    ["10 dakika pişir", { kind: "exact", value: 10 }],
    ["10-12 dakika pişir", { kind: "range", min: 10, max: 12 }],
    ["yaklaşık 10 dakika pişir", { kind: "approximate", value: 10 }],
    ["en az 10 dakika dinlendir", { kind: "minimum", value: 10 }],
    ["10 dakikaya kadar pişir", { kind: "maximum", value: 10 }],
  ])("parses %s", (text, quantity) => {
    const parsed = parseStep(text, defaultParseContext("tr"));
    expect(parsed.durations).toHaveLength(1);
    expect(parsed.durations[0].value).toEqual(quantity);
    expect(parsed.durations[0].unit).toBe("minute");
  });

  it("preserves an inexact overnight duration without inventing hours", () => {
    const parsed = parseStep("Rest overnight.", defaultParseContext("en"));
    expect(parsed.durations).toHaveLength(1);
    expect(parsed.durations[0]).toMatchObject({
      value: { kind: "inexact", expression: "overnight" },
      rawText: "overnight",
    });
    expect(parsed.durations[0].unit).toBeUndefined();
  });

  it("keeps multiple durations as separate source-spanned annotations", () => {
    const text = "5 dakika kavur, ardından 20 dakika pişir.";
    const parsed = parseStep(text, defaultParseContext("tr"));
    expect(parsed.durations.map((item) => item.value)).toEqual([
      { kind: "exact", value: 5 },
      { kind: "exact", value: 20 },
    ]);
    for (const annotation of parsed.durations) {
      expect(text.slice(annotation.startOffset, annotation.endOffset)).toBe(
        annotation.rawText,
      );
    }
  });

  it("keeps a stop condition separate from numeric duration", () => {
    const parsed = parseStep(
      "10 dakika veya kızarana kadar pişir",
      defaultParseContext("tr"),
    );
    expect(parsed.durations).toHaveLength(1);
    expect(parsed.durations[0]).toMatchObject({
      value: { kind: "exact", value: 10 },
      unit: "minute",
      relation: "or",
      conditionText: "kızarana kadar",
    });
  });
});

describe("temperature annotations", () => {
  it("parses Celsius, Fahrenheit and fan mode without changing raw spans", () => {
    const c = parseStep("180°C'de pişir", defaultParseContext("tr"));
    expect(c.temperatures[0]).toMatchObject({ value: 180, unit: "celsius" });

    const f = parseStep("Bake at 350°F", defaultParseContext("en"));
    expect(f.temperatures[0]).toMatchObject({ value: 350, unit: "fahrenheit" });

    const fan = parseStep("fan 160°C", defaultParseContext("en"));
    expect(fan.temperatures[0]).toMatchObject({
      value: 160,
      unit: "celsius",
      ovenMode: "fan",
    });
  });

  it("recognizes preheat intent before or straddling the temperature", () => {
    const english = parseStep(
      "Preheat the fan oven to 160°C and bake.",
      defaultParseContext("en"),
    );
    expect(english.temperatures[0]).toMatchObject({
      value: 160,
      unit: "celsius",
      ovenMode: "fan",
      preheat: true,
    });

    const turkish = parseStep(
      "Fanlı fırını önceden 160°C'ye ısıt ve pişir.",
      defaultParseContext("tr"),
    );
    expect(turkish.temperatures[0]).toMatchObject({
      value: 160,
      unit: "celsius",
      ovenMode: "fan",
      preheat: true,
    });
  });
});

describe("multilingual step integration", () => {
  it.each([
    ["en", "Bake at 350°F for 12 minutes.", 350, "fahrenheit"],
    ["tr", "180°C'de 12 dakika pişir.", 180, "celsius"],
    ["fr", "Cuire 12 minutes à 180°C.", 180, "celsius"],
    ["de", "12 Minuten bei 180°C backen.", 180, "celsius"],
    ["es", "Hornear durante 12 minutos a 180°C.", 180, "celsius"],
  ] as const)(
    "parses duration and temperature together for %s",
    (locale, text, temperature, unit) => {
      const parsed = parseStep(text, defaultParseContext(locale));
      expect(parsed.durations).toHaveLength(1);
      expect(parsed.durations[0]).toMatchObject({
        value: { kind: "exact", value: 12 },
        unit: "minute",
      });
      expect(parsed.temperatures).toHaveLength(1);
      expect(parsed.temperatures[0]).toMatchObject({
        value: temperature,
        unit,
      });
    },
  );
});

describe("qualitative heat", () => {
  it.each([
    ["tr", "orta ateş", "medium"],
    ["en", "medium-high heat", "medium_high"],
    ["fr", "feu moyen", "medium"],
    ["de", "mittlere Hitze", "medium"],
    ["es", "fuego medio", "medium"],
  ] as const)(
    "parses %s heat without fabricating a temperature",
    (locale, text, level) => {
      const parsed = parseStep(text, defaultParseContext(locale));
      expect(parsed.heat[0]).toMatchObject({
        kind: "heat",
        level,
        rawText: text,
      });
      expect(parsed.temperatures).toHaveLength(0);
    },
  );
});
