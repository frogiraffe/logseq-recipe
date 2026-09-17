import { decodeRecipeMeta, encodeRecipeMeta } from "../application/recipe-meta";
import { unwrapBlockPropertyValue } from "../logseq/block-reader";
import { PROPERTY_KEYS } from "../logseq/property-keys";
import type { RecipeMigration } from "./types";

export const migrationV1: RecipeMigration = {
  from: 0,
  to: 1,
  async run({ host, recipeId, capabilities }) {
    const rawMeta = unwrapBlockPropertyValue(
      await host.getBlockProperty(recipeId, PROPERTY_KEYS.recipeMeta),
    );
    const normalizedMeta = decodeRecipeMeta(rawMeta);
    const encoded = capabilities.jsonProperty
      ? normalizedMeta
      : encodeRecipeMeta(normalizedMeta);

    const currentComparable =
      typeof rawMeta === "string" ? rawMeta : JSON.stringify(rawMeta ?? null);
    const nextComparable =
      typeof encoded === "string" ? encoded : JSON.stringify(encoded);

    if (currentComparable !== nextComparable) {
      await host.upsertBlockProperty(
        recipeId,
        PROPERTY_KEYS.recipeMeta,
        encoded,
      );
    }
    await host.upsertBlockProperty(recipeId, PROPERTY_KEYS.schemaVersion, 1);
  },
};
