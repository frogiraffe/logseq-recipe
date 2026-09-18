import type { HeatAnnotation } from "../domain/annotations";
import type { ParseContext } from "./context";
import { lexRecipeText } from "./lexer";
import { getLocalePack } from "./locales";
import { normalizeLookup } from "./normalize";

export function parseHeat(
  text: string,
  context: ParseContext,
): HeatAnnotation[] {
  const pack = getLocalePack(context.locale);
  const aliases = new Map(
    Object.entries(pack.heatAliases).map(([alias, value]) => [
      normalizeLookup(alias, context.locale),
      value,
    ]),
  );

  return lexRecipeText(text, context.locale)
    .filter((token) => token.kind === "heat")
    .flatMap<HeatAnnotation>((token) => {
      const value = aliases.get(String(token.normalized));
      if (!value) return [];
      return [
        {
          kind: "heat",
          ...value,
          rawText: token.raw,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
        },
      ];
    });
}
