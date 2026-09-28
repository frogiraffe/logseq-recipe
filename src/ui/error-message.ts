import { RecipeError, type RecipeErrorCode } from "../application/errors";
import type { RecipeSectionRole } from "../application/types";
import { FutureRecipeSchemaError } from "../migrations/runner";
import type { UiMessages } from "./i18n";

const MESSAGE_KEYS: Record<RecipeErrorCode, keyof UiMessages> = {
  "title-required": "errorTitleRequired",
  "title-taken": "errorTitleTaken",
  "page-title-taken": "errorPageTitleTaken",
  "base-yield-invalid": "errorBaseYieldInvalid",
  "time-invalid": "errorTimeInvalid",
  "recipe-not-found": "errorRecipeNotFound",
  "section-missing": "errorSectionMissing",
  "recipe-invalid": "errorRecipeInvalid",
};

/**
 * An error as the interface says it: known failures in its own language,
 * anything else (a Logseq API failure) wrapped with its original detail.
 */
export function errorMessage(cause: unknown, messages: UiMessages): string {
  if (cause instanceof RecipeError) {
    const detail =
      cause.code === "section-missing"
        ? messages[(cause.detail ?? "ingredients") as RecipeSectionRole]
        : (cause.detail ?? "");
    return String(messages[MESSAGE_KEYS[cause.code]]).replace(
      "{detail}",
      () => detail,
    );
  }
  if (cause instanceof FutureRecipeSchemaError) {
    return messages.errorFutureSchema;
  }
  const detail = cause instanceof Error ? cause.message : String(cause);
  return messages.errorUnexpected.replace("{detail}", () => detail);
}
