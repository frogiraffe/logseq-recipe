import { describe, expect, it } from "vitest";
import { formatMeasurement, unitLabel } from "../../src/units/format";

describe("unitLabel", () => {
  it("defaults to English", () => {
    expect(unitLabel("g")).toBe("g");
    expect(unitLabel("tbsp_metric")).toBe("tbsp");
  });

  it("localizes to Turkish", () => {
    expect(unitLabel("tbsp_metric", "tr")).toBe("yemek kaşığı");
    expect(unitLabel("minute", "tr")).toBe("dk");
    expect(unitLabel("celsius", "tr")).toBe("°C");
  });

  it("pluralizes English count-unit nouns only when the count isn't 1", () => {
    expect(unitLabel("clove", "en", 1)).toBe("clove");
    expect(unitLabel("clove", "en", 2)).toBe("cloves");
    expect(unitLabel("slice", "en", 3)).toBe("slices");
    expect(unitLabel("pinch", "en", 2)).toBe("pinches");
    expect(unitLabel("piece", "en", 0.5)).toBe("pieces");
  });

  it("never pluralizes a non-count unit", () => {
    expect(unitLabel("g", "en", 5)).toBe("g");
    expect(unitLabel("tbsp_metric", "en", 5)).toBe("tbsp");
  });

  it("does not pluralize Turkish count-unit nouns - Turkish doesn't inflect after a number", () => {
    expect(unitLabel("clove", "tr", 1)).toBe("diş");
    expect(unitLabel("clove", "tr", 5)).toBe("diş");
  });

  it("treats an omitted count as singular", () => {
    expect(unitLabel("clove")).toBe("clove");
  });
});

describe("formatMeasurement", () => {
  it("formats a value with its localized, count-aware unit label", () => {
    expect(formatMeasurement(2, "clove", "en")).toBe("2 cloves");
    expect(formatMeasurement(1, "clove", "en")).toBe("1 clove");
    expect(formatMeasurement(180, "celsius", "tr")).toBe("180 °C");
  });
});

describe("French, German, and Spanish formatting", () => {
  it("localizes unit labels", () => {
    expect(unitLabel("tbsp_metric", "fr")).toBe("c. à s.");
    expect(unitLabel("tbsp_metric", "de")).toBe("EL");
    expect(unitLabel("tbsp_metric", "es")).toBe("cda.");
  });

  it("pluralizes count units by each locale's plural rules", () => {
    expect(unitLabel("egg", "fr", 1.5)).toBe("œuf");
    expect(unitLabel("egg", "fr", 2)).toBe("œufs");
    expect(unitLabel("egg", "de", 1)).toBe("Ei");
    expect(unitLabel("egg", "de", 3)).toBe("Eier");
    expect(unitLabel("piece", "de", 3)).toBe("Stück");
    expect(unitLabel("clove", "es", 2)).toBe("dientes");
    expect(unitLabel("clove", "es", 1)).toBe("diente");
    expect(unitLabel("g", "es", 500)).toBe("g");
  });

  it("uses a decimal comma outside English", () => {
    expect(formatMeasurement(1.25, "l", "en")).toBe("1¼ L");
    expect(formatMeasurement(1.3, "kg", "en")).toBe("1.3 kg");
    expect(formatMeasurement(1.3, "kg", "de")).toBe("1,3 kg");
    expect(formatMeasurement(1.3, "kg", "fr")).toBe("1,3 kg");
    expect(formatMeasurement(1.3, "kg", "tr")).toBe("1,3 kg");
  });
});
