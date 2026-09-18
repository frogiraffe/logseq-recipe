import { describe, expect, it } from "vitest";
import {
  convertForDisplay,
  convertUnit,
  unitFamily,
} from "../../src/units/convert";

describe("standard unit conversion", () => {
  it("uses explicit cooking-volume standards", () => {
    expect(convertUnit(1, "tbsp_us", "ml")).toBeCloseTo(14.78676478125, 10);
    expect(convertUnit(1, "cup_us", "ml")).toBeCloseTo(236.5882365, 9);
    expect(convertUnit(1, "cup_metric", "ml")).toBe(250);
    expect(convertUnit(1, "fl_oz_imperial", "ml")).toBeCloseTo(28.4130625, 9);
  });

  it("converts temperature with formulas", () => {
    expect(convertUnit(180, "celsius", "fahrenheit")).toBeCloseTo(356, 10);
    expect(convertUnit(32, "fahrenheit", "celsius")).toBeCloseTo(0, 10);
  });

  it("rejects incompatible dimensions", () => {
    expect(() => convertUnit(100, "g", "ml")).toThrow(RangeError);
    expect(() => convertUnit(1, "cup_us", "g")).toThrow(RangeError);
  });

  it("selects a matching cooking unit in the display system", () => {
    expect(convertForDisplay(1, "cup_us", "metric")).toEqual({
      value: 236.5882365 / 250,
      unit: "cup_metric",
    });
    expect(convertForDisplay(1, "tbsp_metric", "imperial").unit).toBe(
      "tbsp_imperial",
    );
  });

  it("classifies unit families", () => {
    expect(unitFamily("kg")).toBe("mass");
    expect(unitFamily("cup_us")).toBe("volume");
    expect(unitFamily("minute")).toBe("time");
    expect(unitFamily("celsius")).toBe("temperature");
    expect(unitFamily("egg")).toBe("count");
  });
});
