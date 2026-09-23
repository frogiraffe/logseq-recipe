import { describe, expect, it } from "vitest";
import {
  deMessages,
  enMessages,
  esMessages,
  frMessages,
  getUiMessages,
  trMessages,
} from "../../src/ui/i18n";

const dictionaries = {
  tr: trMessages,
  fr: frMessages,
  de: deMessages,
  es: esMessages,
};

const placeholders = (text: string) =>
  [...text.matchAll(/\{[a-z]+\}/gu)].map((match) => match[0]).sort();

describe("Draft Recipe UI i18n", () => {
  it.each(Object.entries(dictionaries))(
    "keeps %s structurally identical to English",
    (locale, messages) => {
      expect(Object.keys(messages).sort()).toEqual(
        Object.keys(enMessages).sort(),
      );
      expect(messages.uiLocale).toBe(locale);
      for (const [key, value] of Object.entries(messages)) {
        expect(value, key).toBeTypeOf("string");
        expect((value as string).trim(), key).not.toBe("");
        expect(placeholders(value as string), key).toEqual(
          placeholders(enMessages[key as keyof typeof enMessages] as string),
        );
      }
    },
  );

  it("selects each supported language explicitly", () => {
    expect(getUiMessages("tr").recipes).toBe("Tarifler");
    expect(getUiMessages("tr").archiveRecipe).toBe("Tarifi arşivle");
    expect(getUiMessages("fr").recipes).toBe("Recettes");
    expect(getUiMessages("de").recipes).toBe("Rezepte");
    expect(getUiMessages("es").recipes).toBe("Recetas");
  });

  it("falls back to English for unsupported or missing values", () => {
    expect(getUiMessages("it")).toBe(enMessages);
    expect(getUiMessages("toString")).toBe(enMessages);
    expect(getUiMessages(undefined)).toBe(enMessages);
  });
});
