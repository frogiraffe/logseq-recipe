import { describe, expect, it } from "vitest";
import {
  RecipeError,
  sectionMissing,
  titleTaken,
} from "../../src/application/errors";
import { sameTitle } from "../../src/application/list-recipes";
import { FutureRecipeSchemaError } from "../../src/migrations/runner";
import { errorMessage } from "../../src/ui/error-message";
import { enMessages, trMessages } from "../../src/ui/i18n";

describe("errorMessage", () => {
  it("says a known failure in the interface language", () => {
    expect(errorMessage(titleTaken("Kek"), trMessages)).toBe(
      '"Kek" adında bir tarif zaten var.',
    );
    expect(errorMessage(sectionMissing("steps"), trMessages)).toBe(
      "Bu tarifin Logseq'te Yapılış bölümü yok; düzenlemek için geri ekleyin.",
    );
    expect(
      errorMessage(
        new RecipeError(
          "time-invalid",
          "Recipe time fields must be zero or positive.",
        ),
        enMessages,
      ),
    ).toBe(enMessages.errorTimeInvalid);
    expect(errorMessage(new FutureRecipeSchemaError(9, 1), enMessages)).toBe(
      enMessages.errorFutureSchema,
    );
  });

  it("wraps anything else with its own detail", () => {
    expect(errorMessage(new Error("Block not found"), trMessages)).toBe(
      "Logseq bu işlemi tamamlayamadı: Block not found",
    );
  });
});

describe("sameTitle", () => {
  it("ignores case, including Turkish dotted and dotless i", () => {
    expect(sameTitle(" Kek ", "KEK")).toBe(true);
    expect(sameTitle("IRMIK", "ırmık")).toBe(true);
    expect(sameTitle("Kek", "Keks")).toBe(false);
  });
});
