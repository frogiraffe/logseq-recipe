import { decodeRecipeMeta, encodeRecipeMeta } from "../application/recipe-meta";
import type { TaxonomyExportPlan } from "../application/types";
import type { RecipeMeta } from "../domain/recipe";
import { unwrapBlockPropertyValue } from "./block-reader";
import { PROPERTY_KEYS } from "./property-keys";
import { isRecycledPage } from "./recipe-library";

/**
 * A recipe's categories and tags live in two page properties,
 * recipe_categories and recipe_tags, so Logseq's own queries, tables and
 * page references find recipes by them, and an edit made to them in Logseq
 * is the recipe's new list.
 *
 * recipe_meta keeps a copy of both lists for Logseq Recipe 1.4, which reads
 * only the JSON. Once the plugin has written the properties it marks the
 * JSON (taxonomyInProperties) and reads the properties alone. Without the
 * mark - a recipe from before 1.5, or one 1.4 saved since, which drops it -
 * the two are merged, so nothing written by either version is lost.
 *
 * Some names can't be a page of their own: one with a "/" (Logseq reads it
 * as a namespace path and makes pages of its parts), and one Logseq already
 * uses for a property or a built-in tag ("Task", "Tags"), which would link
 * the recipe to that instead. Such names stay in the JSON only, and a recipe
 * that has one is never marked, so they keep being read from there.
 *
 * Every write compares first, and writes nothing that already matches:
 * running a sync twice, or again after an interruption, changes nothing the
 * first run finished. Pages are only ever created or brought back from the
 * recycle bin, never deleted.
 */
export interface RecipeTaxonomyHost {
  getPage(name: string): Promise<unknown>;
  createPage(
    name: string,
    properties?: Record<string, unknown>,
    options?: { redirect?: boolean },
  ): Promise<unknown>;
  restorePage(name: string): Promise<unknown>;
  getBlockProperty(id: string, key: string): Promise<unknown>;
  // Logseq adds a list to a many-valued property; `reset` replaces it.
  upsertBlockProperty(
    id: string,
    key: string,
    value: unknown,
    options?: { reset?: boolean },
  ): Promise<unknown>;
  removeBlockProperty(id: string, key: string): Promise<unknown>;
}

export type RecipeTaxonomy = Pick<RecipeMeta, "categories" | "tags">;

const FIELDS = [
  [PROPERTY_KEYS.recipeCategories, "categories"],
  [PROPERTY_KEYS.recipeTags, "tags"],
] as const;

// Each name once, trimmed, the first spelling kept: Logseq matches page
// names without regard to case.
function distinctNames(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = value.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function entityId(value: unknown): number | null {
  if (typeof value === "number") return value;
  const id = (value as { id?: unknown } | null)?.id;
  return typeof id === "number" ? id : null;
}

// A usable page: one that exists and isn't in the recycle bin.
function livePageId(page: unknown): number | null {
  return page && !isRecycledPage(page) ? entityId(page) : null;
}

// A property, or one of Logseq's own tags. Ordinary pages and journals
// have no ident; tags people or plugins made are pages like any other.
function isReserved(page: unknown): boolean {
  const ident = (page as { ident?: unknown } | null)?.ident;
  return typeof ident === "string" && !/^:(user|plugin)\.class\//u.test(ident);
}

function asList(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : raw == null ? [] : [raw];
}

// The pages a property points at, however Logseq returns them.
function referencedIds(raw: unknown): Set<number> {
  return new Set(
    asList(raw)
      .map(entityId)
      .filter((id): id is number => id !== null),
  );
}

// The names of the pages (or values) a property points at.
function referencedNames(raw: unknown): string[] {
  return distinctNames(
    asList(raw).flatMap((value) => {
      if (typeof value === "string") return [value];
      const record = (value ?? {}) as Record<string, unknown>;
      const name = record.title ?? record.originalName ?? record.name;
      return typeof name === "string" ? [name] : [];
    }),
  );
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** A recipe's category and tag properties as names. */
export async function readTaxonomyProperties(
  host: Pick<RecipeTaxonomyHost, "getBlockProperty">,
  recipeId: string,
): Promise<RecipeTaxonomy> {
  const [categories, tags] = await Promise.all(
    FIELDS.map(async ([key]) =>
      referencedNames(await host.getBlockProperty(recipeId, key)),
    ),
  );
  return { categories, tags };
}

// `names` in the order of `order` (the JSON copy, in the order the cook
// chose), then the rest as Logseq gave them.
function inCopyOrder(names: string[], order: readonly string[]): string[] {
  const rank = new Map(
    order.map((name, index) => [name.trim().toLowerCase(), index]),
  );
  const at = (name: string) =>
    rank.get(name.toLowerCase()) ?? Number.POSITIVE_INFINITY;
  return names
    .map((name, index) => ({ name, index }))
    .sort((a, b) => at(a.name) - at(b.name) || a.index - b.index)
    .map(({ name }) => name);
}

/** The categories and tags a recipe has, from its JSON and its properties. */
export function resolveRecipeTaxonomy(
  meta: RecipeMeta,
  properties: RecipeTaxonomy,
): RecipeTaxonomy {
  const field = (name: "categories" | "tags") =>
    meta.taxonomyInProperties
      ? inCopyOrder(properties[name], meta[name])
      : distinctNames([...meta[name], ...properties[name]]);
  return { categories: field("categories"), tags: field("tags") };
}

// One lookup per page name for a whole run, updated as pages are created.
function pageLookup(host: RecipeTaxonomyHost) {
  const known = new Map<string, Promise<unknown>>();
  const get = (name: string) => {
    const key = name.toLowerCase();
    let page = known.get(key);
    if (!page) {
      page = host.getPage(name);
      known.set(key, page);
    }
    return page;
  };
  return {
    /** The page of this name, or null when it must be created. */
    find: async (name: string) => livePageId(await get(name)),
    /** Whether a recipe can link to a page of exactly this name. */
    usable: async (name: string) =>
      !name.includes("/") && !isReserved(await get(name)),
    async ensure(name: string): Promise<number> {
      const page = await host.getPage(name);
      if (isRecycledPage(page)) await host.restorePage(name);
      else if (!page) await host.createPage(name, {}, { redirect: false });
      const created = await host.getPage(name);
      const id = livePageId(created);
      if (id === null) {
        throw new Error(`Logseq page "${name}" could not be created.`);
      }
      known.set(name.toLowerCase(), Promise.resolve(created));
      return id;
    },
  };
}

type PageLookup = ReturnType<typeof pageLookup>;

// The names the properties can hold, and those that stay in the JSON.
async function splitNames(
  taxonomy: RecipeTaxonomy,
  pages: PageLookup,
): Promise<{ fits: RecipeTaxonomy; kept: string[] }> {
  const kept: string[] = [];
  const field = async (names: readonly string[]) => {
    const fits: string[] = [];
    for (const name of names) {
      if (await pages.usable(name)) fits.push(name);
      else kept.push(name);
    }
    return fits;
  };
  return {
    fits: {
      categories: await field(taxonomy.categories),
      tags: await field(taxonomy.tags),
    },
    kept,
  };
}

interface FieldChange {
  key: string;
  names: string[];
  // Per name: the page it already is, or null when it must be created.
  pages: Array<number | null>;
}

async function changesFor(
  host: RecipeTaxonomyHost,
  recipeId: string,
  taxonomy: RecipeTaxonomy,
  pages: PageLookup,
): Promise<FieldChange[]> {
  const changes: FieldChange[] = [];
  for (const [key, field] of FIELDS) {
    const names = distinctNames(taxonomy[field]);
    const current = referencedIds(await host.getBlockProperty(recipeId, key));
    const resolved = await Promise.all(names.map((name) => pages.find(name)));
    const matches = resolved.every((id) => id !== null)
      ? sameSet(new Set(resolved as number[]), current)
      : false;
    if (names.length === 0 ? current.size > 0 : !matches) {
      changes.push({ key, names, pages: resolved });
    }
  }
  return changes;
}

async function applyChanges(
  host: RecipeTaxonomyHost,
  recipeId: string,
  changes: readonly FieldChange[],
  pages: PageLookup,
): Promise<void> {
  for (const change of changes) {
    if (change.names.length === 0) {
      await host.removeBlockProperty(recipeId, change.key);
      continue;
    }
    // Page ids only: a name written to a page property becomes a loose
    // value block, not the page of that name.
    const ids: number[] = [];
    for (const [index, name] of change.names.entries()) {
      ids.push(change.pages[index] ?? (await pages.ensure(name)));
    }
    await host.upsertBlockProperty(recipeId, change.key, [...new Set(ids)], {
      reset: true,
    });
  }
}

/** Brings one recipe's category and tag properties in line with `taxonomy`. */
export async function syncRecipeTaxonomy(
  host: RecipeTaxonomyHost,
  recipeId: string,
  taxonomy: RecipeTaxonomy,
  pages: PageLookup = pageLookup(host),
): Promise<boolean> {
  const changes = await changesFor(host, recipeId, taxonomy, pages);
  await applyChanges(host, recipeId, changes, pages);
  return changes.length > 0;
}

async function readMeta(
  host: RecipeTaxonomyHost,
  recipeId: string,
): Promise<RecipeMeta> {
  return decodeRecipeMeta(
    unwrapBlockPropertyValue(
      await host.getBlockProperty(recipeId, PROPERTY_KEYS.recipeMeta),
    ),
  );
}

// A recipe whose categories or tags are still only in its JSON: what they
// become, the JSON's and the properties' together, and the property
// changes that takes. Null when there is nothing to move: none, or only
// names that can't be pages and already stay in the JSON.
async function pendingMove(
  host: RecipeTaxonomyHost,
  recipeId: string,
  pages: PageLookup,
): Promise<{
  meta: RecipeMeta;
  taxonomy: RecipeTaxonomy;
  changes: FieldChange[];
  kept: string[];
} | null> {
  const meta = await readMeta(host, recipeId);
  if (meta.taxonomyInProperties) return null;
  if (meta.categories.length === 0 && meta.tags.length === 0) return null;
  const taxonomy = resolveRecipeTaxonomy(
    meta,
    await readTaxonomyProperties(host, recipeId),
  );
  const { fits, kept } = await splitNames(taxonomy, pages);
  const changes = await changesFor(host, recipeId, fits, pages);
  if (changes.length === 0 && kept.length > 0) return null;
  return { meta, taxonomy, changes, kept };
}

/** What moveRecipeTaxonomy would write, without writing or creating anything. */
export async function planRecipeTaxonomy(
  host: RecipeTaxonomyHost,
  recipes: ReadonlyArray<{ id: string }>,
): Promise<TaxonomyExportPlan> {
  const pages = pageLookup(host);
  const properties = new Set<string>();
  const create = new Map<string, string>();
  const reuse = new Map<string, string>();
  const keep = new Map<string, string>();
  let recipeCount = 0;
  for (const recipe of recipes) {
    const move = await pendingMove(host, recipe.id, pages);
    if (!move) continue;
    recipeCount += 1;
    for (const change of move.changes) {
      properties.add(change.key);
      for (const [index, name] of change.names.entries()) {
        const target = change.pages[index] === null ? create : reuse;
        target.set(name.toLowerCase(), name);
      }
    }
    for (const name of move.kept) keep.set(name.toLowerCase(), name);
  }
  return {
    recipeCount,
    propertyNames: FIELDS.map(([key]) => key).filter((key) =>
      properties.has(key),
    ),
    pagesToCreate: [...create.values()],
    pagesToReuse: [...reuse.values()],
    namesKeptInPlugin: [...keep.values()],
  };
}

/**
 * Moves every recipe's categories and tags still only in its JSON into the
 * properties, one recipe at a time; how many recipes it moved. A recipe is
 * marked only after its properties are written, so an interrupted run
 * leaves the rest to the next one.
 */
export async function moveRecipeTaxonomy(
  host: RecipeTaxonomyHost,
  recipes: ReadonlyArray<{ id: string }>,
): Promise<number> {
  let moved = 0;
  for (const recipe of recipes) {
    const move = await pendingMove(host, recipe.id, pageLookup(host));
    if (!move) continue;
    await writeRecipeMeta(
      host,
      recipe.id,
      { ...move.meta, ...move.taxonomy },
      true,
    );
    moved += 1;
  }
  return moved;
}

/**
 * Saves a recipe's meta. With the properties available, categories and tags
 * go there first; the JSON, with its copy - and its mark, when the
 * properties hold every name - only once they are in.
 */
export async function writeRecipeMeta(
  host: RecipeTaxonomyHost,
  recipeId: string,
  meta: RecipeMeta,
  useProperties: boolean,
): Promise<void> {
  const { taxonomyInProperties: _, ...rest } = meta;
  const taxonomy = {
    categories: distinctNames(meta.categories),
    tags: distinctNames(meta.tags),
  };
  let marked = false;
  if (useProperties) {
    const pages = pageLookup(host);
    const { fits, kept } = await splitNames(taxonomy, pages);
    await syncRecipeTaxonomy(host, recipeId, fits, pages);
    marked = kept.length === 0;
  }
  await host.upsertBlockProperty(
    recipeId,
    PROPERTY_KEYS.recipeMeta,
    encodeRecipeMeta({
      ...rest,
      ...taxonomy,
      ...(marked ? { taxonomyInProperties: true as const } : {}),
    }),
  );
}
