import { describe, expect, it } from "vitest";
import {
  normalizeSettings,
  resolveMeasurementSystem,
  resolveParserLocale,
} from "../../src/logseq/settings";

describe("Draft Recipe settings", () => {
  it("falls back safely for missing or invalid stored values", () => {
    expect(normalizeSettings({})).toEqual({
      uiLanguage: "en",
      defaultParserLocale: "auto",
      defaultMeasurementSystem: "metric",
    });
    expect(
      normalizeSettings({
        uiLanguage: "xx",
        defaultParserLocale: "ar",
        defaultMeasurementSystem: "unknown",
      }),
    ).toEqual({
      uiLanguage: "en",
      defaultParserLocale: "auto",
      defaultMeasurementSystem: "metric",
    });
  });

  it("preserves valid enum values", () => {
    expect(
      normalizeSettings({
        uiLanguage: "tr",
        defaultParserLocale: "es",
        defaultMeasurementSystem: "imperial",
      }),
    ).toEqual({
      uiLanguage: "tr",
      defaultParserLocale: "es",
      defaultMeasurementSystem: "imperial",
    });
  });

  it("resolves parser locale by recipe -> plugin -> Logseq -> English", () => {
    const settings = normalizeSettings({ defaultParserLocale: "de" });
    expect(resolveParserLocale("fr", settings, "tr")).toBe("fr");
    expect(resolveParserLocale(undefined, settings, "tr")).toBe("de");
    expect(
      resolveParserLocale(
        undefined,
        normalizeSettings({ defaultParserLocale: "auto" }),
        "es",
      ),
    ).toBe("es");
    expect(
      resolveParserLocale(
        undefined,
        normalizeSettings({ defaultParserLocale: "auto" }),
        "ar",
      ),
    ).toBe("en");
  });

  it("resolves display measurement by recipe override then global default", () => {
    const settings = normalizeSettings({ defaultMeasurementSystem: "us" });
    expect(resolveMeasurementSystem("imperial", settings)).toBe("imperial");
    expect(resolveMeasurementSystem(undefined, settings)).toBe("us");
  });
});
