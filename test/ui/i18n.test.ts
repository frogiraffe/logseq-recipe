import { describe, expect, it } from "vitest";
import { getUiMessages } from "../../src/ui/i18n";
import { enMessages } from "../../src/ui/i18n/en";
import { trMessages } from "../../src/ui/i18n/tr";

describe("Draft Recipe UI i18n", () => {
  it("keeps English and Turkish dictionaries structurally identical", () => {
    expect(Object.keys(trMessages).sort()).toEqual(
      Object.keys(enMessages).sort(),
    );
  });

  it("selects Turkish explicitly", () => {
    expect(getUiMessages("tr").recipes).toBe("Tarifler");
    expect(getUiMessages("tr").startCooking).toBe("Pişirmeye başla");
  });

  it("falls back to English for unsupported or missing values", () => {
    expect(getUiMessages("fr")).toBe(enMessages);
    expect(getUiMessages(undefined)).toBe(enMessages);
  });
});
