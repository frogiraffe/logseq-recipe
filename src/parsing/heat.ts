import type { HeatAnnotation } from "../domain/annotations";
import type { ParseContext } from "./context";
import { lexRecipeText } from "./lexer";
import { getLocalePack, type RecipeLocalePack } from "./locales";
import type { HeatAliasValue } from "./locales/types";
import { normalizeLookup } from "./normalize";

const aliasCache = new WeakMap<RecipeLocalePack, Map<string, HeatAliasValue>>();

function heatAliases(pack: RecipeLocalePack): Map<string, HeatAliasValue> {
  let aliases = aliasCache.get(pack);
  if (!aliases) {
    aliases = new Map(
      Object.entries(pack.heatAliases).map(([alias, value]) => [
        normalizeLookup(alias, pack.code),
        value,
      ]),
    );
    aliasCache.set(pack, aliases);
  }
  return aliases;
}

export function parseHeat(
  text: string,
  context: ParseContext,
): HeatAnnotation[] {
  const aliases = heatAliases(getLocalePack(context.locale));

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
