import {
  RecipeError,
  recipeNotFound,
  sectionMissing,
  titleTaken,
} from "../application/errors";
import { ingredientLines } from "../application/ingredient-groups";
import {
  decodeIngredientMeta,
  encodeIngredientMeta,
  ingredientMetaMatchesContext,
} from "../application/ingredient-meta";
import { recipeSummary, sameTitle } from "../application/list-recipes";
import { decodeRecipeMeta } from "../application/recipe-meta";
import {
  metadataLabelLocale,
  rewriteMinutesValue,
  rewriteYieldLine,
  type ScannedMetadataLine,
  scanRecipeMetadataLines,
  splitLabelValue,
} from "../application/recipe-metadata";
import type { RecipeRepository } from "../application/recipe-repository";
import {
  type ArchivedRecipeSummary,
  type IngredientLayoutEntry,
  RECIPE_SECTION_ROLES,
  type RecipeSectionRole,
  type RecipeSummary,
  type ValidationResult,
} from "../application/types";
import { validateLoadedRecipe } from "../application/validate-recipe";
import type {
  IngredientScaleMode,
  Recipe,
  RecipeLocale,
} from "../domain/recipe";
import { RECIPE_SCHEMA_VERSION } from "../domain/recipe";
import { parseStepChild } from "../domain/step-media";
import { defaultParseContext, type ParseContext } from "../parsing/context";
import {
  ingredientParseContext,
  stepParseContext,
} from "../parsing/detect-locale";
import { type ParsedIngredient, parseIngredient } from "../parsing/ingredient";
import { parseStep, withNoteDurations } from "../parsing/step";
import {
  createdBlockUuid,
  flattenRecipeTree,
  pageWithChildren,
  propertyNumber,
  propertyString,
  type RecipeBlockSnapshot,
  toRecipeBlockSnapshot,
  unwrapBlockPropertyValue,
} from "./block-reader";
import { PROPERTY_KEYS } from "./property-keys";
import {
  isInRecipeLibrary,
  moveRecipeToLibrarySection,
  type RecipeLibraryHost,
} from "./recipe-library";
import type { DraftRecipeSettings } from "./settings";
import { resolveParserLocale } from "./settings";

export interface LogseqRecipeHost {
  editor: RecipeLibraryHost & {
    getBlock(
      id: string,
      options?: { includeChildren?: boolean },
    ): Promise<unknown>;
    getPage(id: string): Promise<unknown>;
    getPageBlocksTree(id: string): Promise<unknown>;
    getBlockProperty(id: string, key: string): Promise<unknown>;
    upsertBlockProperty(
      id: string,
      key: string,
      value: unknown,
    ): Promise<unknown>;
    removeBlockProperty(id: string, key: string): Promise<unknown>;
    getProperty(key: string): Promise<unknown>;
    updateBlock(id: string, content: string): Promise<unknown>;
    removeBlock(id: string): Promise<unknown>;
    insertBlock(
      parentId: string,
      content: string,
      options?: { sibling?: boolean },
    ): Promise<unknown>;
    moveBlock(
      srcBlock: string,
      targetBlock: string,
      options?: { before?: boolean; children?: boolean },
    ): Promise<unknown>;
    renamePage(oldName: string, newName: string): Promise<unknown>;
    deletePage(name: string): Promise<unknown>;
    isPageBlock(entity: unknown): boolean;
  };
  db: {
    datascriptQuery<T = unknown>(
      query: string,
      ...inputs: unknown[]
    ): Promise<T>;
    onChanged(
      callback: (payload: { blocks?: unknown[]; txData?: unknown[] }) => void,
    ): () => void;
  };
  app: {
    getUserConfigs(): Promise<{ preferredLanguage?: string }>;
  };
}

export interface LogseqRecipeRepositoryOptions {
  settings: DraftRecipeSettings;
}

function isSectionRole(value: unknown): value is RecipeSectionRole {
  return RECIPE_SECTION_ROLES.includes(value as RecipeSectionRole);
}

function markerIdentFromProperty(value: unknown, label: string): string {
  if (!value || typeof value !== "object") {
    throw new Error(`Logseq ${label} property has not been created yet.`);
  }
  const ident = (value as Record<string, unknown>).ident;
  if (
    typeof ident !== "string" ||
    !/^:plugin\.property\.[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(ident)
  ) {
    throw new Error(`Logseq ${label} property ident is not safe to query.`);
  }
  return ident;
}

export function isTruthyMarkerValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return value != null;
}

function queryRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const row of value) {
    const candidate = Array.isArray(row) ? row[0] : row;
    if (candidate && typeof candidate === "object") {
      rows.push(candidate as Record<string, unknown>);
    }
  }
  return rows;
}

function decodeCoverRef(value: unknown): Recipe["cover"] | undefined {
  const raw = unwrapBlockPropertyValue(value);
  if (typeof raw === "string" && raw.trim()) {
    return { kind: "asset-path", value: raw.trim() };
  }
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const uuid = typeof record.uuid === "string" ? record.uuid : undefined;
    if (uuid) return { kind: "asset-node", value: uuid };
    if (typeof record.id === "number" || typeof record.id === "string") {
      return { kind: "asset-node", value: String(record.id) };
    }
  }
  return undefined;
}

function pageName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.originalName === "string") return record.originalName;
  if (typeof record.name === "string") return record.name;
  return null;
}

/**
 * A recipe root is either a whole page (Create Recipe makes one) or a plain
 * block inside a page (Convert to Recipe can target one). Resolving which
 * is which matters: in a DB graph `getPage()` does NOT return null for a
 * plain block's uuid, so asking it first and trusting the answer loads the
 * *containing page's* top-level blocks via `getPageBlocksTree` instead of
 * that block's own children - the recipe then reads back with no sections
 * at all (no ingredients, no steps), even though its root properties, which
 * are read directly by uuid rather than through this tree, all look fine.
 *
 * A page tree is a fallback only when the page is the requested recipe;
 * getPage(blockUuid) may instead return the block's containing page.
 */
async function loadRoot(
  host: LogseqRecipeHost,
  id: string,
): Promise<RecipeBlockSnapshot | null> {
  const blockSnapshot = toRecipeBlockSnapshot(
    await host.editor.getBlock(id, { includeChildren: true }),
  );
  if (blockSnapshot && blockSnapshot.children.length > 0) return blockSnapshot;

  const page = await host.editor.getPage(id);
  if (
    page &&
    typeof page === "object" &&
    (page as { uuid?: unknown }).uuid === id
  ) {
    const children = await host.editor.getPageBlocksTree(id);
    const pageSnapshot = toRecipeBlockSnapshot(
      pageWithChildren(page, children),
    );
    if (pageSnapshot && pageSnapshot.children.length > 0) return pageSnapshot;
    if (!blockSnapshot) return pageSnapshot;
  }

  return blockSnapshot;
}

async function readRole(
  host: LogseqRecipeHost,
  block: RecipeBlockSnapshot,
): Promise<RecipeSectionRole | undefined> {
  const raw = unwrapBlockPropertyValue(
    await host.editor.getBlockProperty(block.uuid, PROPERTY_KEYS.sectionRole),
  );
  return isSectionRole(raw) ? raw : undefined;
}

async function readSectionMap(
  host: LogseqRecipeHost,
  root: RecipeBlockSnapshot,
): Promise<Partial<Record<RecipeSectionRole, RecipeBlockSnapshot>>> {
  const result: Partial<Record<RecipeSectionRole, RecipeBlockSnapshot>> = {};
  const children = root.children.filter((child) => !child.isPropertyValue);
  const roles = await Promise.all(
    children.map((child) => readRole(host, child)),
  );
  for (const [index, child] of children.entries()) {
    const role = roles[index];
    if (role && !result[role]) result[role] = child;
  }
  return result;
}

// A section's real content lines are never structural: they never carry
// their own section_role (a duplicate/misplaced section marker), and they
// are never a hidden value-carrier block for a ref-typed property set on the
// section itself (e.g. writing section_role="ingredients" on the
// "Ingredients" block can create a child of that same block literally
// titled "ingredients" to hold the value - see isPropertyValue). Either kind
// is structure, never surfaced as an ingredient/step/note line.
async function contentChildren(
  host: LogseqRecipeHost,
  section: RecipeBlockSnapshot | undefined,
): Promise<RecipeBlockSnapshot[]> {
  if (!section) return [];
  const roles = await Promise.all(
    section.children.map((child) => readRole(host, child)),
  );
  return section.children.filter(
    (child, index) => roles[index] === undefined && !child.isPropertyValue,
  );
}

interface ContentTree {
  block: RecipeBlockSnapshot;
  title: string;
  children: ContentTree[];
}

function descendantTitles(tree: ContentTree): string[] {
  return tree.children.flatMap((child) => [
    child.title,
    ...descendantTitles(child),
  ]);
}

// A block with its authored descendants only (no property-value carriers or
// blank lines), for reading ingredient groups.
function contentTree(block: RecipeBlockSnapshot): ContentTree {
  return {
    block,
    title: block.title,
    children: block.children
      .filter((child) => !child.isPropertyValue && child.title.trim())
      .map(contentTree),
  };
}

async function resolveContext(
  host: LogseqRecipeHost,
  options: LogseqRecipeRepositoryOptions,
  rootId: string,
): Promise<ParseContext> {
  const metaRaw = await host.editor.getBlockProperty(
    rootId,
    PROPERTY_KEYS.recipeMeta,
  );
  const meta = decodeRecipeMeta(unwrapBlockPropertyValue(metaRaw));
  const userConfigs = await host.app.getUserConfigs();
  const locale: RecipeLocale = resolveParserLocale(
    meta.parserLocale,
    options.settings,
    userConfigs.preferredLanguage,
  );
  return defaultParseContext(locale, meta.sourceMeasurementSystem);
}

function metadataLineChildren(
  root: RecipeBlockSnapshot,
): Array<{ id: string; title: string }> {
  return root.children
    .filter((child) => !child.isPropertyValue)
    .map((child) => ({ id: child.uuid, title: child.title }));
}

/**
 * Root metadata fields (yield/prep/chill/cook/source) may be authored as
 * plain readable lines under the recipe root (e.g. "Porsiyon: 12"). Those
 * lines - not the hidden property cache - are the source of truth: a native
 * edit to the visible line must win over a stale hidden value, and the
 * hidden property is refreshed to match so it never silently disagrees with
 * what the user can see. Recipes authored purely through the plugin's
 * Create Recipe flow have no such line for a field; the hidden property
 * remains authoritative for those until a visible line is introduced.
 */
function resolveMetadataField<T>(
  line: ScannedMetadataLine<T> | undefined,
  propertyValue: T | undefined,
): T | undefined {
  if (line === undefined) return propertyValue;
  return line.value ?? undefined;
}

async function syncScalarProperty(
  host: LogseqRecipeHost,
  rootId: string,
  key: string,
  resolvedValue: string | number | undefined,
  currentRaw: unknown,
): Promise<void> {
  const current = unwrapBlockPropertyValue(currentRaw);
  if (resolvedValue === undefined) {
    if (current !== undefined && current !== null) {
      await host.editor.removeBlockProperty(rootId, key);
    }
    return;
  }
  if (current !== resolvedValue) {
    await host.editor.upsertBlockProperty(rootId, key, resolvedValue);
  }
}

async function parsedIngredientForBlock(
  host: LogseqRecipeHost,
  block: RecipeBlockSnapshot,
  context: ParseContext,
  synchronizeMetadata: boolean,
): Promise<ParsedIngredient> {
  const storedRaw = unwrapBlockPropertyValue(
    await host.editor.getBlockProperty(
      block.uuid,
      PROPERTY_KEYS.ingredientMeta,
    ),
  );
  const stored = decodeIngredientMeta(storedRaw);

  if (stored && ingredientMetaMatchesContext(stored, block.title, context)) {
    return stored.parsed;
  }

  const parsed = parseIngredient(block.title, context);
  if (synchronizeMetadata) {
    const encoded = encodeIngredientMeta(parsed, context);
    if (storedRaw !== encoded) {
      await host.editor.upsertBlockProperty(
        block.uuid,
        PROPERTY_KEYS.ingredientMeta,
        encoded,
      );
    }
  }
  return parsed;
}

function addIdentity(target: Set<string>, value: unknown): void {
  if (typeof value === "string" || typeof value === "number") {
    target.add(String(value));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  addIdentity(target, record.uuid);
  addIdentity(target, record.id);
}

function recipeEntityRefs(root: RecipeBlockSnapshot): Set<string> {
  const refs = new Set<string>();
  for (const block of flattenRecipeTree(root)) {
    addIdentity(refs, block.uuid);
    addIdentity(refs, block.id);
  }
  return refs;
}

function changedEntityTouchesKnown(
  value: unknown,
  known: ReadonlySet<string>,
): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const refs = new Set<string>();
  addIdentity(refs, record.uuid);
  addIdentity(refs, record.id);
  addIdentity(refs, record.parent);

  for (const ref of refs) {
    if (known.has(ref)) return true;
  }
  return false;
}

function transactionDatomTouchesKnown(
  value: unknown,
  known: ReadonlySet<string>,
): boolean {
  if (!Array.isArray(value)) return false;

  const entityRefs = new Set<string>();
  addIdentity(entityRefs, value[0]);
  for (const ref of entityRefs) {
    if (known.has(ref)) return true;
  }

  const attribute = value[1];
  if (attribute !== ":block/parent" && attribute !== ":block/page")
    return false;

  const targetRefs = new Set<string>();
  addIdentity(targetRefs, value[2]);
  for (const ref of targetRefs) {
    if (known.has(ref)) return true;
  }
  return false;
}

async function resolveSectionBlock(
  host: LogseqRecipeHost,
  rootId: string,
  role: RecipeSectionRole,
): Promise<RecipeBlockSnapshot> {
  const root = await loadRoot(host, rootId);
  if (!root) throw recipeNotFound(rootId);
  const sections = await readSectionMap(host, root);
  const section = sections[role];
  if (!section) throw sectionMissing(role);
  return section;
}

interface ChangePayloadLike {
  blocks?: unknown[];
  txData?: unknown[];
}

/**
 * Read-side cache for the Recipes browser: summary loads and marker checks,
 * kept per Logseq editor (so it outlives one open of the plugin UI) and
 * dropped per recipe as soon as a DB change touches any of its blocks - the
 * same detection the open Recipe Card uses to refresh live. Without it every
 * return to the list re-read every recipe (20-40 host calls each).
 */
interface RecipeReadCache {
  // Recipe root id -> every entity ref inside it (root, sections, items).
  refs: Map<string, Set<string>>;
  summaries: Map<string, Promise<Recipe | null>>;
  markers: Map<string, Promise<boolean>>;
  // Drops every cached recipe that is, or contains, this entity.
  forgetTouching(entityId: string): void;
  clear(): void;
  stop(): void;
}

let readCaches = new WeakMap<object, RecipeReadCache>();
const liveReadCaches = new Set<RecipeReadCache>();

function touches(payload: ChangePayloadLike, known: ReadonlySet<string>) {
  return (
    (payload.blocks ?? []).some((block) =>
      changedEntityTouchesKnown(block, known),
    ) ||
    (payload.txData ?? []).some((datom) =>
      transactionDatomTouchesKnown(datom, known),
    )
  );
}

function readCacheFor(host: LogseqRecipeHost): RecipeReadCache {
  const key = host.editor as object;
  const existing = readCaches.get(key);
  if (existing) return existing;
  const cache: RecipeReadCache = {
    refs: new Map(),
    summaries: new Map(),
    markers: new Map(),
    forgetTouching: () => undefined,
    clear: () => undefined,
    stop: () => undefined,
  };
  const forget = (id: string) => {
    cache.summaries.delete(id);
    cache.refs.delete(id);
    for (const markerKey of [...cache.markers.keys()]) {
      if (markerKey.startsWith(`${id}\u0000`)) cache.markers.delete(markerKey);
    }
  };
  const cachedIds = () =>
    new Set([
      ...cache.summaries.keys(),
      ...[...cache.markers.keys()].map(
        (markerKey) => markerKey.split("\u0000")[0],
      ),
    ]);
  cache.forgetTouching = (entityId) => {
    for (const id of cachedIds()) {
      if (id === entityId || cache.refs.get(id)?.has(entityId)) forget(id);
    }
  };
  cache.clear = () => {
    cache.summaries.clear();
    cache.markers.clear();
    cache.refs.clear();
  };
  cache.stop = host.db.onChanged((payload: ChangePayloadLike) => {
    for (const id of cachedIds()) {
      if (touches(payload, cache.refs.get(id) ?? new Set([id]))) forget(id);
    }
  });
  readCaches.set(key, cache);
  liveReadCaches.add(cache);
  return cache;
}

/** A graph switch must never serve another graph's cached recipes. */
export function clearRecipeReadCaches(): void {
  for (const cache of liveReadCaches) cache.stop();
  liveReadCaches.clear();
  readCaches = new WeakMap();
}

// Caches a promise so concurrent readers share one load; a failed load is
// not cached, so the next read retries.
function cached<T>(
  map: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const hit = map.get(key);
  if (hit) return hit;
  const pending = load();
  map.set(key, pending);
  pending.catch(() => {
    if (map.get(key) === pending) map.delete(key);
  });
  return pending;
}

/** Everything but authoring, which repository.ts adds on top. */
export function createLogseqRecipeRepository(
  host: LogseqRecipeHost,
  options: LogseqRecipeRepositoryOptions,
): Omit<
  RecipeRepository,
  "createRecipe" | "duplicateRecipe" | "markExistingRecipe"
> {
  const cache = readCacheFor(host);
  const knownEntityRefs = cache.refs;
  // Read once per repository (one open of the plugin UI), not once per
  // recipe: a list of 100 recipes used to ask for it 100 times.
  let userConfigs: ReturnType<
    LogseqRecipeHost["app"]["getUserConfigs"]
  > | null = null;
  const getUserConfigs = () => {
    userConfigs ??= host.app.getUserConfigs();
    return userConfigs;
  };

  async function loadRecipe(
    id: string,
    synchronizeIngredientMetadata: boolean,
  ): Promise<Recipe | null> {
    const root = await loadRoot(host, id);
    if (!root) return null;

    const [
      baseYieldRaw,
      yieldUnitRaw,
      prepRaw,
      chillRaw,
      cookRaw,
      sourceUrlRaw,
      metaRaw,
      coverRaw,
      schemaVersionRaw,
    ] = await Promise.all([
      host.editor.getBlockProperty(root.uuid, PROPERTY_KEYS.baseYield),
      host.editor.getBlockProperty(root.uuid, PROPERTY_KEYS.yieldUnit),
      host.editor.getBlockProperty(root.uuid, PROPERTY_KEYS.prepMinutes),
      host.editor.getBlockProperty(root.uuid, PROPERTY_KEYS.chillMinutes),
      host.editor.getBlockProperty(root.uuid, PROPERTY_KEYS.cookMinutes),
      host.editor.getBlockProperty(root.uuid, PROPERTY_KEYS.sourceUrl),
      host.editor.getBlockProperty(root.uuid, PROPERTY_KEYS.recipeMeta),
      host.editor.getBlockProperty(root.uuid, PROPERTY_KEYS.coverRef),
      host.editor.getBlockProperty(root.uuid, PROPERTY_KEYS.schemaVersion),
    ]);

    const schemaVersion = propertyNumber(schemaVersionRaw) ?? 0;
    const canSynchronizeIngredientMetadata =
      synchronizeIngredientMetadata && schemaVersion <= RECIPE_SCHEMA_VERSION;
    const meta = decodeRecipeMeta(unwrapBlockPropertyValue(metaRaw));
    const sections = await readSectionMap(host, root);
    const [userConfigs, ingredientChildren, stepChildren, noteChildren] =
      await Promise.all([
        getUserConfigs(),
        contentChildren(host, sections.ingredients),
        contentChildren(host, sections.steps),
        contentChildren(host, sections.notes),
      ]);
    const locale: RecipeLocale = resolveParserLocale(
      meta.parserLocale,
      options.settings,
      userConfigs.preferredLanguage,
    );
    const context = defaultParseContext(locale, meta.sourceMeasurementSystem);

    // A summary (synchronizeIngredientMetadata=false, e.g. the Recipes
    // browser listing every recipe at once) only ever reads ingredientText
    // back out - it never shows amounts/units or scale mode. Skip the two
    // per-ingredient property round-trips (ingredient_meta, scale_mode) and
    // just run the deterministic parser in memory instead; a full load
    // still uses the cached/synced structured metadata as before.
    const ingredientEntries = ingredientLines(
      ingredientChildren.map(contentTree),
      context,
    ).map(({ line, group }) => ({
      block: line.block,
      group: group && { id: group.block.uuid, title: group.title },
      details: descendantTitles(line),
    }));
    const ingredients = await Promise.all(
      ingredientEntries.map(async ({ block, group, details }) => {
        const lineContext = ingredientParseContext(
          block.title,
          context,
          meta.sourceMeasurementSystem,
        );
        const [parsed, scaleModeRaw] = synchronizeIngredientMetadata
          ? await Promise.all([
              parsedIngredientForBlock(
                host,
                block,
                lineContext,
                canSynchronizeIngredientMetadata,
              ),
              host.editor.getBlockProperty(block.uuid, PROPERTY_KEYS.scaleMode),
            ])
          : ([parseIngredient(block.title, lineContext), undefined] as const);
        return {
          id: block.uuid,
          rawText: parsed.rawText,
          ...(parsed.amount ? { amount: parsed.amount } : {}),
          ...(parsed.unit ? { unit: parsed.unit } : {}),
          ingredientText: parsed.ingredientText,
          ...(parsed.note ? { note: parsed.note } : {}),
          scaleMode:
            propertyString(scaleModeRaw) === "fixed"
              ? ("fixed" as const)
              : ("linear" as const),
          ...(group ? { group } : {}),
          ...(details.length > 0 ? { details } : {}),
        };
      }),
    );

    const steps = stepChildren.map((block) => {
      const children = block.children
        .filter((child) => !child.isPropertyValue && child.title.trim())
        .map((child) =>
          withNoteDurations(
            parseStepChild(child.uuid, child.title),
            stepParseContext(
              child.title,
              context,
              meta.sourceMeasurementSystem,
            ),
          ),
        );
      return {
        id: block.uuid,
        rawText: block.title,
        ...parseStep(
          block.title,
          stepParseContext(block.title, context, meta.sourceMeasurementSystem),
        ),
        ...(children.length > 0 ? { children } : {}),
      };
    });

    const cover = decodeCoverRef(coverRaw);

    const metadataLines = scanRecipeMetadataLines(
      metadataLineChildren(root),
      context,
    );
    const baseYieldFromProperty = propertyNumber(baseYieldRaw);
    const baseYield =
      metadataLines.yield !== undefined
        ? (metadataLines.yield.value?.baseYield ??
          baseYieldFromProperty ??
          Number.NaN)
        : (baseYieldFromProperty ?? Number.NaN);
    const yieldUnit =
      metadataLines.yield !== undefined
        ? metadataLines.yield.value?.yieldUnit
        : propertyString(yieldUnitRaw);
    const prepMinutes = resolveMetadataField(
      metadataLines.prep,
      propertyNumber(prepRaw),
    );
    const chillMinutes = resolveMetadataField(
      metadataLines.chill,
      propertyNumber(chillRaw),
    );
    const cookMinutes = resolveMetadataField(
      metadataLines.cook,
      propertyNumber(cookRaw),
    );
    const sourceUrl = resolveMetadataField(
      metadataLines.source,
      propertyString(sourceUrlRaw),
    );

    if (canSynchronizeIngredientMetadata) {
      const syncs: Array<[string, string | number | undefined, unknown]> = [
        [PROPERTY_KEYS.yieldUnit, yieldUnit, yieldUnitRaw],
        [PROPERTY_KEYS.prepMinutes, prepMinutes, prepRaw],
        [PROPERTY_KEYS.chillMinutes, chillMinutes, chillRaw],
        [PROPERTY_KEYS.cookMinutes, cookMinutes, cookRaw],
        [PROPERTY_KEYS.sourceUrl, sourceUrl, sourceUrlRaw],
      ];
      // baseYield is required: never clear it just because it briefly failed
      // to parse (e.g. a mid-edit typo on the visible line).
      if (Number.isFinite(baseYield)) {
        syncs.push([PROPERTY_KEYS.baseYield, baseYield, baseYieldRaw]);
      }
      await Promise.all(
        syncs.map(([key, value, raw]) =>
          syncScalarProperty(host, root.uuid, key, value, raw),
        ),
      );
    }

    const recipe: Recipe = {
      id: root.uuid,
      title: root.title,
      baseYield,
      ...(yieldUnit ? { yieldUnit } : {}),
      ...(cover ? { cover } : {}),
      ...(prepMinutes !== undefined ? { prepMinutes } : {}),
      ...(chillMinutes !== undefined ? { chillMinutes } : {}),
      ...(cookMinutes !== undefined ? { cookMinutes } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      categories: meta.categories,
      tags: meta.tags,
      ingredients,
      steps,
      notes: noteChildren.map((block) => ({
        id: block.uuid,
        text: block.title,
      })),
      schemaVersion,
      ...(meta.parserLocale ? { parserLocale: meta.parserLocale } : {}),
      ...(meta.sourceMeasurementSystem
        ? { sourceMeasurementSystem: meta.sourceMeasurementSystem }
        : {}),
      ...(meta.measurementSystemOverride
        ? { measurementSystemOverride: meta.measurementSystemOverride }
        : {}),
      ingredientConversionOverrides: meta.ingredientConversionOverrides,
    };

    knownEntityRefs.set(root.uuid, recipeEntityRefs(root));
    return recipe;
  }

  async function listMarkedRecipeIds(
    markerKey:
      | typeof PROPERTY_KEYS.recipeMarker
      | typeof PROPERTY_KEYS.archivedMarker,
  ): Promise<string[]> {
    const markerProperty = await host.editor.getProperty(markerKey);
    const ident = markerIdentFromProperty(markerProperty, markerKey);
    // Bind the marker's value instead of requiring a literal `true`: real DB
    // graphs may represent a checkbox property's stored value in ways this
    // plugin cannot fully control (wrapped value entity, non-boolean scalar,
    // etc). The query only needs to narrow candidates down to entities that
    // have the attribute at all; `isTruthyMarkerValue` below verifies the
    // actual value through the same property-read path recipe loading
    // already relies on, so discovery never has to guess the storage shape.
    const query = `[:find (pull ?r [:db/id :block/uuid :block/title])\n :where [?r ${ident} ?marker]\n        (not [?r :logseq.property/deleted-at _])]`;
    const rows = queryRows(await host.db.datascriptQuery(query));
    const candidateIds = rows
      .map((row) => row.uuid)
      .filter((uuid): uuid is string => typeof uuid === "string");

    const verified = await Promise.all(
      candidateIds.map((uuid) =>
        cached(cache.markers, `${uuid}\u0000${markerKey}`, async () => {
          const raw = await host.editor.getBlockProperty(uuid, markerKey);
          if (!isTruthyMarkerValue(unwrapBlockPropertyValue(raw))) return false;
          if (markerKey !== PROPERTY_KEYS.recipeMarker) return true;
          const archived = await host.editor.getBlockProperty(
            uuid,
            PROPERTY_KEYS.archivedMarker,
          );
          return !isTruthyMarkerValue(unwrapBlockPropertyValue(archived));
        }).then((ok) => (ok ? uuid : null)),
      ),
    );
    return verified.filter((uuid): uuid is string => uuid !== null);
  }

  function loadSummaryRecipe(id: string): Promise<Recipe | null> {
    return cached(cache.summaries, id, () => loadRecipe(id, false));
  }

  // Titles the plugin writes (create, rename, import) stay unique among
  // active and archived recipes, so the list never shows two alike.
  async function titleTakenByAnother(title: string, exceptId: string) {
    const ids = [
      ...(await listMarkedRecipeIds(PROPERTY_KEYS.recipeMarker)),
      ...(await listMarkedRecipeIds(PROPERTY_KEYS.archivedMarker)),
    ].filter((id) => id !== exceptId);
    const recipes = await Promise.all(ids.map(loadSummaryRecipe));
    return recipes.some((recipe) => recipe && sameTitle(recipe.title, title));
  }

  // Page-root recipes rename their page, so a title another page already
  // owns is refused; block-root titles are plain block content.
  async function checkRename(
    id: string,
    title: string,
  ): Promise<{ trimmed: string; pageName: string | null }> {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new RecipeError("title-required", "Recipe title is required.");
    }
    if (await titleTakenByAnother(trimmed, id)) throw titleTaken(trimmed);
    const page = await host.editor.getPage(id);
    const name = pageName(page);
    if (!name || (page as Record<string, unknown>).uuid !== id) {
      return { trimmed, pageName: null };
    }
    if (trimmed !== name) {
      const collision = pageName(await host.editor.getPage(trimmed));
      if (collision && collision !== name) {
        throw new RecipeError(
          "page-title-taken",
          `A Logseq page named "${trimmed}" already exists.`,
          trimmed,
        );
      }
    }
    return { trimmed, pageName: name };
  }

  // Makes `ids` children of `parentId`, in order: the first moves in only
  // if it lives under another block, and the rest follow it.
  async function placeUnder(parentId: string, ids: readonly string[]) {
    const [first, ...rest] = ids;
    if (!first) return;
    const [block, parent] = await Promise.all([
      host.editor.getBlock(first),
      host.editor.getBlock(parentId),
    ]);
    const parentOf = (value: unknown) =>
      (value as { parent?: { id?: unknown } } | null)?.parent?.id;
    const idOf = (value: unknown) => (value as { id?: unknown } | null)?.id;
    if (parentOf(block) === undefined || parentOf(block) !== idOf(parent)) {
      await host.editor.moveBlock(first, parentId, { children: true });
    }
    let previous = first;
    for (const id of rest) {
      await host.editor.moveBlock(id, previous, { before: false });
      previous = id;
    }
  }

  async function recipeEntity(id: string): Promise<unknown> {
    const block = await host.editor.getBlock(id);
    if (block) return block;
    const page = await host.editor.getPage(id);
    return page &&
      typeof page === "object" &&
      (page as { uuid?: unknown }).uuid === id
      ? page
      : null;
  }

  return {
    getRecipe: (id) => loadRecipe(id, true),

    async listRecipeSummaries(options?: {
      fresh?: boolean;
    }): Promise<RecipeSummary[]> {
      if (options?.fresh) cache.clear();
      const ids = await listMarkedRecipeIds(PROPERTY_KEYS.recipeMarker);
      const loaded = await Promise.all(ids.map(loadSummaryRecipe));
      return loaded
        .filter((recipe): recipe is Recipe => recipe !== null)
        .map(recipeSummary);
    },

    async listArchivedRecipeSummaries(): Promise<ArchivedRecipeSummary[]> {
      const ids = await listMarkedRecipeIds(PROPERTY_KEYS.archivedMarker);
      const loaded = await Promise.all(ids.map(loadSummaryRecipe));
      return Promise.all(
        loaded
          .filter((recipe): recipe is Recipe => recipe !== null)
          .map(async (recipe) => {
            const archivedAt = propertyNumber(
              await host.editor.getBlockProperty(
                recipe.id,
                PROPERTY_KEYS.archivedAt,
              ),
            );
            return {
              ...recipeSummary(recipe),
              ...(archivedAt !== undefined
                ? {
                    archivedAt:
                      archivedAt <= 2_147_483_647
                        ? archivedAt * 1_000
                        : archivedAt,
                  }
                : {}),
            };
          }),
      );
    },

    async validateRecipe(id: string): Promise<ValidationResult> {
      const recipe = await loadRecipe(id, true);
      if (!recipe) {
        return {
          valid: false,
          issues: [
            {
              severity: "error",
              code: "recipe-not-found",
              message: `Recipe not found: ${id}`,
            },
          ],
        };
      }
      if (recipe.schemaVersion > RECIPE_SCHEMA_VERSION) {
        return {
          valid: false,
          issues: [
            {
              severity: "error",
              code: "future-schema",
              message: `Recipe schema ${recipe.schemaVersion} is newer than supported schema ${RECIPE_SCHEMA_VERSION}.`,
            },
          ],
        };
      }
      return validateLoadedRecipe(recipe);
    },

    watchRecipe(id: string, listener: () => void): () => void {
      return host.db.onChanged(({ blocks = [], txData = [] }) => {
        const known = knownEntityRefs.get(id) ?? new Set([id]);
        if (
          blocks.some((block) => changedEntityTouchesKnown(block, known)) ||
          txData.some((datom) => transactionDatomTouchesKnown(datom, known))
        ) {
          listener();
        }
      });
    },

    async validateRename(id: string, title: string): Promise<void> {
      await checkRename(id, title);
    },

    async renameRecipe(id: string, title: string): Promise<void> {
      cache.forgetTouching(id);
      const { trimmed, pageName: name } = await checkRename(id, title);
      if (name) await host.editor.renamePage(name, trimmed);
      else await host.editor.updateBlock(id, trimmed);
    },

    async updateRecipeFields(
      id: string,
      patch: {
        baseYield?: number;
        yieldUnit?: string | null;
        prepMinutes?: number | null;
        chillMinutes?: number | null;
        cookMinutes?: number | null;
        sourceUrl?: string | null;
      },
    ): Promise<void> {
      cache.forgetTouching(id);
      if (
        patch.baseYield !== undefined &&
        (!Number.isFinite(patch.baseYield) || patch.baseYield <= 0)
      ) {
        throw new RecipeError(
          "base-yield-invalid",
          "Recipe base yield must be positive.",
        );
      }
      for (const value of [
        patch.prepMinutes,
        patch.chillMinutes,
        patch.cookMinutes,
      ]) {
        if (value != null && (!Number.isFinite(value) || value < 0)) {
          throw new RecipeError(
            "time-invalid",
            "Recipe time fields must be zero or positive.",
          );
        }
      }

      const root = await loadRoot(host, id);
      if (!root) throw recipeNotFound(id);
      const context = await resolveContext(host, options, id);
      const lines = scanRecipeMetadataLines(
        metadataLineChildren(root),
        context,
      );

      // A clearing (null) patch removes the hidden property AND the visible
      // line, if any - otherwise the very next load would resurrect the old
      // value from that line (visible content is the source of truth).
      async function rewriteOrClearLine(
        key: string,
        line: ScannedMetadataLine<unknown> | undefined,
        clear: boolean,
        valueText: () => string,
      ): Promise<void> {
        if (clear) {
          await host.editor.removeBlockProperty(id, key);
          if (line) await host.editor.removeBlock(line.blockId);
          return;
        }
        if (line) {
          const pair = splitLabelValue(line.title);
          const label = pair ? pair.label : line.title;
          await host.editor.updateBlock(
            line.blockId,
            `${label}: ${valueText()}`,
          );
        }
      }

      if (patch.baseYield !== undefined || patch.yieldUnit !== undefined) {
        const originalBaseYield = propertyNumber(
          await host.editor.getBlockProperty(id, PROPERTY_KEYS.baseYield),
        );
        if (patch.baseYield !== undefined) {
          await host.editor.upsertBlockProperty(
            id,
            PROPERTY_KEYS.baseYield,
            patch.baseYield,
          );
        }
        const trimmedUnit =
          patch.yieldUnit === null
            ? undefined
            : patch.yieldUnit !== undefined
              ? patch.yieldUnit.trim() || undefined
              : lines.yield?.value?.yieldUnit;
        if (patch.yieldUnit !== undefined) {
          if (trimmedUnit) {
            await host.editor.upsertBlockProperty(
              id,
              PROPERTY_KEYS.yieldUnit,
              trimmedUnit,
            );
          } else {
            await host.editor.removeBlockProperty(id, PROPERTY_KEYS.yieldUnit);
          }
        }
        const finalBaseYield =
          patch.baseYield ?? originalBaseYield ?? lines.yield?.value?.baseYield;
        if (lines.yield && finalBaseYield !== undefined) {
          await host.editor.updateBlock(
            lines.yield.blockId,
            rewriteYieldLine(
              lines.yield.title,
              finalBaseYield,
              trimmedUnit,
              lines.yield.value?.yieldUnit,
            ),
          );
        }
      }

      async function applyMinutesField(
        key: string,
        value: number | null | undefined,
        line: ScannedMetadataLine<number> | undefined,
      ): Promise<void> {
        if (value === undefined) return;
        await rewriteOrClearLine(key, line, value === null, () => {
          const pair = line ? splitLabelValue(line.title) : null;
          return pair
            ? rewriteMinutesValue(pair.value, value as number, {
                ...context,
                locale: metadataLabelLocale(pair.label, context),
              })
            : String(value);
        });
        if (value !== null) {
          await host.editor.upsertBlockProperty(id, key, value);
        }
      }
      await applyMinutesField(
        PROPERTY_KEYS.prepMinutes,
        patch.prepMinutes,
        lines.prep,
      );
      await applyMinutesField(
        PROPERTY_KEYS.chillMinutes,
        patch.chillMinutes,
        lines.chill,
      );
      await applyMinutesField(
        PROPERTY_KEYS.cookMinutes,
        patch.cookMinutes,
        lines.cook,
      );

      if (patch.sourceUrl !== undefined) {
        const trimmedUrl = patch.sourceUrl?.trim() || null;
        await rewriteOrClearLine(
          PROPERTY_KEYS.sourceUrl,
          lines.source,
          trimmedUrl === null,
          () => trimmedUrl ?? "",
        );
        if (trimmedUrl !== null) {
          await host.editor.upsertBlockProperty(
            id,
            PROPERTY_KEYS.sourceUrl,
            trimmedUrl,
          );
        }
      }
    },

    async addSectionItem(
      recipeId: string,
      role: RecipeSectionRole,
      text: string,
    ): Promise<string> {
      cache.forgetTouching(recipeId);
      const trimmed = text.trim();
      if (!trimmed) throw new RangeError("Item text is required.");
      const section = await resolveSectionBlock(host, recipeId, role);
      return createdBlockUuid(
        await host.editor.insertBlock(section.uuid, trimmed, {
          sibling: false,
        }),
      );
    },

    async addStepChild(stepId: string, text: string): Promise<string> {
      cache.forgetTouching(stepId);
      const trimmed = text.trim();
      if (!trimmed) throw new RangeError("Item text is required.");
      return createdBlockUuid(
        await host.editor.insertBlock(stepId, trimmed, { sibling: false }),
      );
    },

    async updateSectionItem(itemId: string, text: string): Promise<void> {
      cache.forgetTouching(itemId);
      const trimmed = text.trim();
      if (!trimmed) throw new RangeError("Item text is required.");
      await host.editor.updateBlock(itemId, trimmed);
    },

    async removeSectionItem(itemId: string): Promise<void> {
      cache.forgetTouching(itemId);
      await host.editor.removeBlock(itemId);
    },

    async setIngredientScaleMode(
      id: string,
      scaleMode: IngredientScaleMode,
    ): Promise<void> {
      cache.forgetTouching(id);
      await host.editor.upsertBlockProperty(
        id,
        PROPERTY_KEYS.scaleMode,
        scaleMode,
      );
    },

    async reorderSectionItems(orderedIds: string[]): Promise<void> {
      cache.forgetTouching(orderedIds[0] ?? "");
      for (let i = 1; i < orderedIds.length; i++) {
        await host.editor.moveBlock(orderedIds[i], orderedIds[i - 1], {
          before: false,
        });
      }
    },

    async arrangeIngredients(
      recipeId: string,
      layout: IngredientLayoutEntry[],
    ): Promise<void> {
      cache.forgetTouching(recipeId);
      const section = await resolveSectionBlock(host, recipeId, "ingredients");
      await placeUnder(
        section.uuid,
        layout.map((entry) => entry.id),
      );
      for (const entry of layout) {
        if (entry.items) await placeUnder(entry.id, entry.items);
      }
    },

    // Page recipes stay pages: moving one would break links to that page.
    async canMoveToRecipeLibrary(id: string): Promise<boolean> {
      const entity = await recipeEntity(id);
      return (
        entity !== null &&
        !host.editor.isPageBlock(entity) &&
        !(await isInRecipeLibrary(host.editor, entity))
      );
    },

    async moveToRecipeLibrary(id: string): Promise<void> {
      cache.forgetTouching(id);
      if (!(await this.canMoveToRecipeLibrary(id))) {
        throw new Error(
          "Only a recipe block outside the Recipe Library can be moved there.",
        );
      }
      const archived = isTruthyMarkerValue(
        unwrapBlockPropertyValue(
          await host.editor.getBlockProperty(id, PROPERTY_KEYS.archivedMarker),
        ),
      );
      await moveRecipeToLibrarySection(
        host.editor,
        id,
        archived ? "archived" : "recipes",
      );
    },

    async archiveRecipe(id: string): Promise<void> {
      cache.forgetTouching(id);
      const [entity, archivedMarkerRaw, archivedAtRaw] = await Promise.all([
        recipeEntity(id),
        host.editor.getBlockProperty(id, PROPERTY_KEYS.archivedMarker),
        host.editor.getBlockProperty(id, PROPERTY_KEYS.archivedAt),
      ]);
      if (!entity) throw recipeNotFound(id);
      const alreadyArchived = isTruthyMarkerValue(
        unwrapBlockPropertyValue(archivedMarkerRaw),
      );
      await host.editor.upsertBlockProperty(
        id,
        PROPERTY_KEYS.archivedMarker,
        true,
      );
      const archivedAt = propertyNumber(archivedAtRaw);
      if (!alreadyArchived || archivedAt === undefined) {
        await host.editor.upsertBlockProperty(
          id,
          PROPERTY_KEYS.archivedAt,
          Math.floor(Date.now() / 1_000),
        );
      }
      await host.editor.removeBlockProperty(id, PROPERTY_KEYS.recipeMarker);
      if (
        !host.editor.isPageBlock(entity) &&
        (await isInRecipeLibrary(host.editor, entity))
      ) {
        await moveRecipeToLibrarySection(host.editor, id, "archived");
      }
    },

    async restoreRecipe(id: string): Promise<void> {
      cache.forgetTouching(id);
      const entity = await recipeEntity(id);
      if (!entity) throw recipeNotFound(id);
      if (
        !host.editor.isPageBlock(entity) &&
        (await isInRecipeLibrary(host.editor, entity))
      ) {
        await moveRecipeToLibrarySection(host.editor, id, "recipes");
      }
      await host.editor.upsertBlockProperty(
        id,
        PROPERTY_KEYS.recipeMarker,
        true,
      );
      await host.editor.removeBlockProperty(id, PROPERTY_KEYS.archivedMarker);
      await host.editor.removeBlockProperty(id, PROPERTY_KEYS.archivedAt);
    },

    // The only destructive path: refuses anything not archived, so an active
    // recipe can never be deleted without first passing through the archive.
    async deleteArchivedRecipe(id: string): Promise<void> {
      cache.forgetTouching(id);
      const [entity, archivedMarkerRaw] = await Promise.all([
        recipeEntity(id),
        host.editor.getBlockProperty(id, PROPERTY_KEYS.archivedMarker),
      ]);
      if (!entity) throw recipeNotFound(id);
      if (!isTruthyMarkerValue(unwrapBlockPropertyValue(archivedMarkerRaw))) {
        throw new Error(`Recipe is not archived: ${id}`);
      }
      if (!host.editor.isPageBlock(entity)) {
        await host.editor.removeBlock(id);
        return;
      }
      const name = pageName(entity) ?? pageName(await host.editor.getPage(id));
      if (!name) throw new Error(`Recipe page not found: ${id}`);
      await host.editor.deletePage(name);
    },
  };
}

export function currentLogseqRecipeHost(): LogseqRecipeHost {
  return {
    editor: logseq.Editor as unknown as LogseqRecipeHost["editor"],
    db: logseq.DB as unknown as LogseqRecipeHost["db"],
    app: logseq.App as unknown as LogseqRecipeHost["app"],
  };
}
