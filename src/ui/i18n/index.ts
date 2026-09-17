import { enMessages } from "./en";
import { trMessages } from "./tr";
import type { UiMessages } from "./types";

export function getUiMessages(value: unknown): UiMessages {
  return value === "tr" ? trMessages : enMessages;
}

export type { UiMessages } from "./types";
export { enMessages, trMessages };
