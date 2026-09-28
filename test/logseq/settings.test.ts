import { describe, expect, it } from "vitest";
import {
  normalizeSettings,
  resolveParserLocale,
  resolveUiLanguage,
} from "../../src/logseq/settings";

describe("Draft Recipe settings", () => {
  it("falls back safely for missing or invalid stored values", () => {
    expect(normalizeSettings({})).toEqual({
      uiLanguage: "auto",
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
      uiLanguage: "auto",
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
});

describe("UI language", () => {
  it("follows Logseq's language on auto, falling back to English", () => {
    expect(resolveUiLanguage("auto", "tr")).toBe("tr");
    expect(resolveUiLanguage("auto", "de-DE")).toBe("de");
    expect(resolveUiLanguage("auto", "zh-CN")).toBe("en");
    expect(resolveUiLanguage("auto", undefined)).toBe("en");
    expect(resolveUiLanguage("fr", "tr")).toBe("fr");
  });
});
