import type { Recipe } from "../domain/recipe";
import type { RecipeRepository } from "./recipe-repository";

export async function loadRecipe(
  repository: RecipeRepository,
  id: string,
): Promise<Recipe> {
  const recipe = await repository.getRecipe(id);
  if (!recipe) throw new Error(`Recipe not found: ${id}`);
  return recipe;
}
