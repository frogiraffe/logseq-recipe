import type { RecipeRepository } from "../application/recipe-repository";
import type {
  ExistingRecipeStructure,
  NewRecipeInput,
} from "../application/types";
import type { Recipe } from "../domain/recipe";
import {
  createRecipeInLogseq,
  markExistingRecipeInLogseq,
  type RecipeAuthoringHost,
} from "./authoring";
import {
  createLogseqRecipeRepository,
  currentLogseqRecipeHost,
  type LogseqRecipeHost,
} from "./logseq-recipe-repository";
import {
  ensureRecipeSchema,
  type PropertySchemaEditor,
  type RecipeSchemaCapabilities,
} from "./schema";
import type { DraftRecipeSettings } from "./settings";

export interface DraftRecipeHost extends LogseqRecipeHost {
  editor: LogseqRecipeHost["editor"] &
    RecipeAuthoringHost &
    PropertySchemaEditor;
}

export interface DraftRecipeRepositoryOptions {
  settings: DraftRecipeSettings;
  schemaCapabilities: RecipeSchemaCapabilities;
}

export function createDraftRecipeRepository(
  host: DraftRecipeHost,
  options: DraftRecipeRepositoryOptions,
): RecipeRepository {
  const readRepository = createLogseqRecipeRepository(host, {
    settings: options.settings,
  });

  return {
    ...readRepository,

    async createRecipe(input: NewRecipeInput): Promise<Recipe> {
      await ensureRecipeSchema(host.editor, options.schemaCapabilities);
      const structure = await createRecipeInLogseq(host.editor, input, {
        jsonProperty: options.schemaCapabilities.jsonProperty,
      });
      const recipe = await readRepository.getRecipe(structure.rootId);
      if (!recipe) {
        throw new Error(
          "Recipe was created but could not be read back from Logseq.",
        );
      }
      return recipe;
    },

    async markExistingRecipe(
      structure: ExistingRecipeStructure,
    ): Promise<void> {
      await ensureRecipeSchema(host.editor, options.schemaCapabilities);
      await markExistingRecipeInLogseq(host.editor, structure, {
        jsonProperty: options.schemaCapabilities.jsonProperty,
      });
    },
  };
}

export function currentDraftRecipeHost(): DraftRecipeHost {
  const base = currentLogseqRecipeHost();
  return {
    ...base,
    editor: logseq.Editor as unknown as DraftRecipeHost["editor"],
  };
}
