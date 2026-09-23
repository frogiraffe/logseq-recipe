import { describe, expect, it } from "vitest";
import { defaultParseContext } from "../../src/parsing/context";
import {
  ingredientParseContext,
  stepParseContext,
} from "../../src/parsing/detect-locale";

describe("per-line parse language", () => {
  const english = defaultParseContext("en");

  it("reads a Turkish step as Turkish inside an English recipe", () => {
    expect(stepParseContext("4 dakika fırını ısıt", english).locale).toBe("tr");
    // "180°C" scores in every language; the Turkish duration decides.
    expect(
      stepParseContext("180°C'de 10-12 dakika pişir.", english).locale,
    ).toBe("tr");
  });

  it("keeps the recipe language when it reads the line as well as any", () => {
    expect(stepParseContext("Bake for 10 minutes.", english)).toBe(english);
    expect(stepParseContext("Mix well.", english)).toBe(english);
    expect(ingredientParseContext("1 cup flour", english)).toBe(english);
    expect(ingredientParseContext("250 flour", english)).toBe(english);
  });

  it("reads a Turkish unit and keeps an explicit measurement system", () => {
    const context = ingredientParseContext("2 su bardağı un", english, "us");
    expect(context.locale).toBe("tr");
    expect(context.sourceMeasurementSystem).toBe("us");
  });
});
