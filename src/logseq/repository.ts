import { encodeIngredientMeta } from "../application/ingredient-meta";
import type { RecipeRepository } from "../application/recipe-repository";
import type {
  ExistingRecipeStructure,
  NewRecipeInput,
} from "../application/types";
import type { Recipe, RecipeMeta } from "../domain/recipe";
import { defaultParseContext } from "../parsing/context";
import { parseIngredient } from "../parsing/ingredient";
import { setRecipeCover } from "./assets";
import {
  createRecipeInLogseq,
  markExistingRecipeInLogseq,
  type RecipeAuthoringHost,
  writeOptionalRootFields,
} from "./authoring";
import {
  createLogseqRecipeRepository,
  currentLogseqRecipeHost,
  type LogseqRecipeHost,
} from "./logseq-recipe-repository";
import { PROPERTY_KEYS } from "./property-keys";
import { writeRecipeMeta } from "./recipe-meta-store";
import {
  ensureRecipeSchema,
  type PropertySchemaEditor,
  type RecipeSchemaCapabilities,
} from "./schema";
import type { DraftRecipeSettings } from "./settings";

async function uniqueDuplicateTitle(
  host: RecipeAuthoringHost,
  baseTitle: string,
): Promise<string> {
  let attempt = 1;
  let candidate = `${baseTitle} (copy)`;
  while (await host.getPage(candidate)) {
    attempt += 1;
    candidate = `${baseTitle} (copy ${attempt})`;
  }
  return candidate;
}

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

    async duplicateRecipe(id: string): Promise<Recipe> {
      const source = await readRepository.getRecipe(id);
      if (!source) throw new Error(`Recipe not found: ${id}`);

      await ensureRecipeSchema(host.editor, options.schemaCapabilities);
      const title = await uniqueDuplicateTitle(host.editor, source.title);
      const structure = await createRecipeInLogseq(
        host.editor,
        {
          title,
          baseYield: source.baseYield,
          yieldUnit: source.yieldUnit,
          locale: source.parserLocale,
          sourceMeasurementSystem: source.sourceMeasurementSystem,
          measurementSystemOverride: source.measurementSystemOverride,
        },
        { jsonProperty: options.schemaCapabilities.jsonProperty },
      );

      const context = {
        ...defaultParseContext(source.parserLocale ?? "en"),
        ...(source.sourceMeasurementSystem
          ? { sourceMeasurementSystem: source.sourceMeasurementSystem }
          : {}),
      };

      for (const ingredient of source.ingredients) {
        const blockId = await readRepository.addSectionItem(
          structure.rootId,
          "ingredients",
          ingredient.rawText,
        );
        await host.editor.upsertBlockProperty(
          blockId,
          PROPERTY_KEYS.ingredientMeta,
          encodeIngredientMeta(
            parseIngredient(ingredient.rawText, context),
            context,
          ),
        );
        if (ingredient.scaleMode === "fixed") {
          await readRepository.setIngredientScaleMode(blockId, "fixed");
        }
      }
      for (const step of source.steps) {
        await readRepository.addSectionItem(
          structure.rootId,
          "steps",
          step.rawText,
        );
      }
      for (const note of source.notes) {
        await readRepository.addSectionItem(
          structure.rootId,
          "notes",
          note.text,
        );
      }

      const meta: RecipeMeta = {
        categories: source.categories,
        tags: source.tags,
        ingredientConversionOverrides: source.ingredientConversionOverrides,
        ...(source.parserLocale ? { parserLocale: source.parserLocale } : {}),
        ...(source.sourceMeasurementSystem
          ? { sourceMeasurementSystem: source.sourceMeasurementSystem }
          : {}),
        ...(source.measurementSystemOverride
          ? { measurementSystemOverride: source.measurementSystemOverride }
          : {}),
      };
      await writeRecipeMeta(host.editor, structure.rootId, meta, {
        jsonProperty: options.schemaCapabilities.jsonProperty,
      });

      await writeOptionalRootFields(host.editor, structure.rootId, {
        prepMinutes: source.prepMinutes,
        chillMinutes: source.chillMinutes,
        cookMinutes: source.cookMinutes,
        sourceUrl: source.sourceUrl,
      });

      if (source.cover) {
        await setRecipeCover(host.editor, structure.rootId, source.cover, {
          coverReference: options.schemaCapabilities.coverReference,
        });
      }

      const created = await readRepository.getRecipe(structure.rootId);
      if (!created) {
        throw new Error(
          "Recipe was duplicated but could not be read back from Logseq.",
        );
      }
      return created;
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
