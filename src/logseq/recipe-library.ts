import {
  propertyString,
  type RecipeBlockSnapshot,
  toRecipeBlockSnapshot,
} from "./block-reader";
import { PROPERTY_KEYS } from "./property-keys";

const RECIPE_LIBRARY_PAGE = "Recipe Library";
export type RecipeLibrarySectionRole = "recipes" | "archived";

export interface RecipeLibraryHost {
  getPage(id: string): Promise<unknown>;
  createPage(title: string): Promise<unknown>;
  restorePage(page: string): Promise<unknown>;
  getPageBlocksTree(page: string): Promise<unknown>;
  appendBlockInPage(page: string, title: string): Promise<unknown>;
  getBlockProperty(id: string, key: string): Promise<unknown>;
  upsertBlockProperty(
    id: string,
    key: string,
    value: unknown,
  ): Promise<unknown>;
  moveBlock(
    source: string,
    target: string,
    options: { children: true },
  ): Promise<unknown>;
}

const SECTION_TITLES: Record<RecipeLibrarySectionRole, string> = {
  recipes: "Recipes",
  archived: "Archived",
};

function isRecycledPage(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return (
    page[":logseq.property/deleted-at"] != null ||
    page["logseq.property/deleted-at"] != null ||
    page.deletedAt != null
  );
}

function blockId(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new Error("Logseq did not return a library section block.");
  }
  const block = value as Record<string, unknown>;
  if (typeof block.uuid === "string") return block.uuid;
  if (typeof block.id === "number" || typeof block.id === "string") {
    return String(block.id);
  }
  throw new Error("Logseq library section has no stable id/uuid.");
}

export async function ensureRecipeLibrary(
  host: RecipeLibraryHost,
): Promise<Record<RecipeLibrarySectionRole, string>> {
  const page = await host.getPage(RECIPE_LIBRARY_PAGE);
  if (isRecycledPage(page)) {
    await host.restorePage(RECIPE_LIBRARY_PAGE);
  } else if (!page) {
    await host.createPage(RECIPE_LIBRARY_PAGE);
  }

  const tree = await host.getPageBlocksTree(RECIPE_LIBRARY_PAGE);
  const sections = {} as Record<RecipeLibrarySectionRole, string>;
  const blocks = (Array.isArray(tree) ? tree : [])
    .map(toRecipeBlockSnapshot)
    .filter(
      (block): block is RecipeBlockSnapshot =>
        block !== null && !block.isPropertyValue,
    );
  const roles = await Promise.all(
    blocks.map((block) =>
      host.getBlockProperty(block.uuid, PROPERTY_KEYS.librarySectionRole),
    ),
  );
  for (const [index, block] of blocks.entries()) {
    const role = propertyString(roles[index]);
    if ((role === "recipes" || role === "archived") && !sections[role]) {
      sections[role] = block.uuid;
    }
  }

  for (const role of ["recipes", "archived"] as const) {
    if (sections[role]) continue;
    const block = await host.appendBlockInPage(
      RECIPE_LIBRARY_PAGE,
      SECTION_TITLES[role],
    );
    const id = blockId(block);
    await host.upsertBlockProperty(id, PROPERTY_KEYS.librarySectionRole, role);
    sections[role] = id;
  }
  return sections;
}

export async function moveRecipeToLibrarySection(
  host: RecipeLibraryHost,
  recipeId: string,
  role: RecipeLibrarySectionRole,
): Promise<void> {
  const sections = await ensureRecipeLibrary(host);
  await host.moveBlock(recipeId, sections[role], { children: true });
}
