import { encodeRecipeMeta } from "../application/recipe-meta";
import type { RecipeMeta } from "../domain/recipe";
import { PROPERTY_KEYS } from "./property-keys";

export interface RecipeMetaWriterHost {
  upsertBlockProperty(
    id: string,
    key: string,
    value: unknown,
  ): Promise<unknown>;
}

export async function writeRecipeMeta(
  host: RecipeMetaWriterHost,
  recipeId: string,
  meta: RecipeMeta,
  capabilities: { jsonProperty: boolean },
): Promise<void> {
  const value = capabilities.jsonProperty ? meta : encodeRecipeMeta(meta);
  await host.upsertBlockProperty(recipeId, PROPERTY_KEYS.recipeMeta, value);
}
