import { RECIPE_SCHEMA_VERSION } from "../domain/recipe";
import { propertyNumber } from "../logseq/block-reader";
import { PROPERTY_KEYS } from "../logseq/property-keys";
import type {
  RecipeMigration,
  RecipeMigrationCapabilities,
  RecipeMigrationHost,
} from "./types";
import { migrationV1 } from "./v1";

const MIGRATIONS: readonly RecipeMigration[] = [migrationV1];

export class FutureRecipeSchemaError extends Error {
  constructor(
    readonly foundVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `Recipe schema ${foundVersion} is newer than supported schema ${supportedVersion}.`,
    );
    this.name = "FutureRecipeSchemaError";
  }
}

export async function runRecipeMigrations(
  host: RecipeMigrationHost,
  recipeId: string,
  capabilities: RecipeMigrationCapabilities,
): Promise<number> {
  const rawVersion = await host.getBlockProperty(
    recipeId,
    PROPERTY_KEYS.schemaVersion,
  );
  let version = propertyNumber(rawVersion) ?? 0;

  if (version > RECIPE_SCHEMA_VERSION) {
    throw new FutureRecipeSchemaError(version, RECIPE_SCHEMA_VERSION);
  }

  while (version < RECIPE_SCHEMA_VERSION) {
    const migration = MIGRATIONS.find(
      (candidate) => candidate.from === version,
    );
    if (!migration) {
      throw new Error(
        `No migration path exists from recipe schema ${version}.`,
      );
    }
    await migration.run({ host, recipeId, capabilities });
    version = migration.to;
  }

  return version;
}
