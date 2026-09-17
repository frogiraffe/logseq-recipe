export interface RecipeMigrationHost {
  getBlockProperty(id: string, key: string): Promise<unknown>;
  upsertBlockProperty(
    id: string,
    key: string,
    value: unknown,
  ): Promise<unknown>;
}

export interface RecipeMigrationCapabilities {
  jsonProperty: boolean;
}

export interface RecipeMigrationContext {
  host: RecipeMigrationHost;
  recipeId: string;
  capabilities: RecipeMigrationCapabilities;
}

export interface RecipeMigration {
  from: number;
  to: number;
  run(context: RecipeMigrationContext): Promise<void>;
}
