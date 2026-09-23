import { deMessages } from "./de";
import { enMessages } from "./en";
import { esMessages } from "./es";
import { frMessages } from "./fr";
import { trMessages } from "./tr";
import type { UiMessages } from "./types";

const DICTIONARIES: Readonly<Record<string, UiMessages>> = {
  en: enMessages,
  tr: trMessages,
  fr: frMessages,
  de: deMessages,
  es: esMessages,
};

/** Unknown or missing languages fall back to English. */
export function getUiMessages(value: unknown): UiMessages {
  return (
    (typeof value === "string" && Object.hasOwn(DICTIONARIES, value)
      ? DICTIONARIES[value]
      : undefined) ?? enMessages
  );
}

export type { UiMessages } from "./types";
export { deMessages, enMessages, esMessages, frMessages, trMessages };
