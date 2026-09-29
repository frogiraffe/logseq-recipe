export interface RecipeMigrationHost {
  getBlockProperty(id: string, key: string): Promise<unknown>;
  upsertBlockProperty(
    id: string,
    key: string,
    value: unknown,
  ): Promise<unknown>;
}

export interface RecipeMigrationContext {
  host: RecipeMigrationHost;
  recipeId: string;
}

/**
 * One step of a recipe's schema_version. `run` must be safe to repeat: the
 * runner writes the new version only after it returns, so an interrupted
 * step runs again, from the start, on the next load. A step never deletes
 * what it can't reproduce; see docs/data-model.md for when a change needs
 * one at all.
 */
export interface RecipeMigration {
  from: number;
  to: number;
  run(context: RecipeMigrationContext): Promise<void>;
}
