import { unwrapBlockPropertyValue } from "./block-reader";
import { phase0ProbeKey } from "./property-keys";

export type CoverReferenceCapability =
  | "asset-node"
  | "asset-path"
  | "unsupported";

export interface RuntimeCapabilities {
  dbGraph: boolean;
  hiddenProperty: boolean;
  numberProperty: boolean;
  textProperty: boolean;
  jsonProperty: boolean;
  dbChangeListener: boolean;
  stableMainUi: boolean;
  coverReference: CoverReferenceCapability;
}

export interface Phase0ProbeReport {
  appVersion: string;
  capabilities: RuntimeCapabilities;
  pluginNamespacedPropertyIdent: boolean;
  propertyIdent?: string;
  cleanupSucceeded: boolean;
  notes: string[];
  errors: string[];
}

type PropertyType = "checkbox" | "number" | "default" | "json";

interface PropertyProbeResult {
  ok: boolean;
  ident?: string;
}

function hasFunction(target: unknown, name: string): boolean {
  if (!target || typeof target !== "object") return false;
  return typeof (target as Record<string, unknown>)[name] === "function";
}

// The runtime's only real dependency is the graph-wide `onChanged` feed
// (see LogseqRecipeHost.db.onChanged / watchRecipe) - `onBlockChanged` is
// never called outside this file's own deeper diagnostic probe below, so it
// must not gate whether the plugin is allowed to run at all.
function hasRequiredDbListeners(target: unknown): boolean {
  return hasFunction(target, "onChanged");
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function probeProperty(
  blockUuid: string,
  key: string,
  type: PropertyType,
  value: unknown,
  createdPropertyKeys: Set<string>,
  writtenBlockPropertyKeys: Set<string>,
): Promise<PropertyProbeResult> {
  await logseq.Editor.upsertProperty(key, {
    type,
    cardinality: "one",
    hide: true,
    public: false,
  });
  createdPropertyKeys.add(key);

  const property = await logseq.Editor.getProperty(key);
  if (!property) return { ok: false };

  await logseq.Editor.upsertBlockProperty(blockUuid, key, value, {
    reset: true,
  });
  writtenBlockPropertyKeys.add(key);
  const readBack = await logseq.Editor.getBlockProperty(blockUuid, key);

  return {
    ok: valuesEqual(unwrapBlockPropertyValue(readBack), value),
    ident: property.ident,
  };
}

async function probeDbChangeListener(blockUuid: string): Promise<boolean> {
  if (!hasRequiredDbListeners(logseq.DB)) return false;

  let dispose: (() => void) | undefined;
  const changed = new Promise<boolean>((resolve) => {
    // Test the exact mechanism the runtime depends on (the graph-wide
    // onChanged feed), not onBlockChanged, which nothing here uses.
    const hook = logseq.DB.onChanged(() => resolve(true));
    if (typeof hook === "function") dispose = hook;
  });

  try {
    await logseq.Editor.updateBlock(
      blockUuid,
      "Logseq Recipe Phase 0 probe updated",
    );
    return await Promise.race([
      changed,
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => resolve(false), 1_500);
      }),
    ]);
  } finally {
    dispose?.();
  }
}

function detectCoverReferenceCapability(): CoverReferenceCapability {
  const assets = logseq.Assets as unknown;
  if (
    hasFunction(assets, "listFilesOfCurrentGraph") &&
    hasFunction(assets, "makeUrl")
  ) {
    return "asset-path";
  }
  return "unsupported";
}

async function probeMainUi(): Promise<boolean> {
  const root = logseq as unknown as Record<string, unknown>;
  if (
    typeof root.showMainUI !== "function" ||
    typeof root.hideMainUI !== "function"
  ) {
    return false;
  }

  try {
    logseq.showMainUI({ autoFocus: false });
    logseq.hideMainUI();
    return true;
  } catch {
    return false;
  }
}

// Cover images are an optional feature (see setRecipeCover /
// RecipeSettingsPanel's cover degradation): a graph without asset APIs must
// still be able to create, convert, scale, edit, and cook recipes. Only the
// capabilities every recipe operation actually needs are required here.
export function requiredCapabilitiesSatisfied(
  capabilities: RuntimeCapabilities,
): boolean {
  return (
    capabilities.dbGraph &&
    capabilities.hiddenProperty &&
    capabilities.numberProperty &&
    capabilities.textProperty &&
    capabilities.dbChangeListener &&
    capabilities.stableMainUi
  );
}

export function phase0ProbePassed(report: Phase0ProbeReport): boolean {
  return (
    requiredCapabilitiesSatisfied(report.capabilities) &&
    report.pluginNamespacedPropertyIdent &&
    report.cleanupSucceeded &&
    report.errors.length === 0
  );
}

export async function probeRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  const editor = logseq.Editor as unknown;
  const db = logseq.DB as unknown;

  const propertyApi =
    hasFunction(editor, "upsertProperty") &&
    hasFunction(editor, "getProperty") &&
    hasFunction(editor, "removeProperty") &&
    hasFunction(editor, "upsertBlockProperty") &&
    hasFunction(editor, "getBlockProperty") &&
    hasFunction(editor, "removeBlockProperty");

  return {
    dbGraph: Boolean(await logseq.App.checkCurrentIsDbGraph()),
    hiddenProperty: propertyApi,
    numberProperty: propertyApi,
    textProperty: propertyApi,
    jsonProperty: false,
    dbChangeListener: hasRequiredDbListeners(db),
    stableMainUi: await probeMainUi(),
    coverReference: detectCoverReferenceCapability(),
  };
}

export async function runPhase0CapabilityProbe(): Promise<Phase0ProbeReport> {
  const info = (await logseq.App.getInfo()) as { version?: string };
  const appVersion = info.version ?? "unknown";
  const notes: string[] = [];
  const errors: string[] = [];
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageName = `Logseq Recipe Phase 0 Probe ${runId}`;
  const keys = {
    hidden: phase0ProbeKey("hidden", runId),
    number: phase0ProbeKey("number", runId),
    text: phase0ProbeKey("text", runId),
    json: phase0ProbeKey("json", runId),
  };
  const createdPropertyKeys = new Set<string>();
  const writtenBlockPropertyKeys = new Set<string>();

  let pageCreated = false;
  let blockUuid: string | undefined;
  let cleanupSucceeded = true;
  let hiddenProperty = false;
  let numberProperty = false;
  let textProperty = false;
  let jsonProperty = false;
  let pluginNamespacedPropertyIdent = false;
  let propertyIdent: string | undefined;
  let dbChangeListener = false;

  const dbGraph = Boolean(await logseq.App.checkCurrentIsDbGraph());
  const stableMainUi = await probeMainUi();
  const coverReference = detectCoverReferenceCapability();

  if (!dbGraph) {
    return {
      appVersion,
      capabilities: {
        dbGraph,
        hiddenProperty,
        numberProperty,
        textProperty,
        jsonProperty,
        dbChangeListener,
        stableMainUi,
        coverReference,
      },
      pluginNamespacedPropertyIdent,
      cleanupSucceeded,
      notes: ["Current graph is not a Logseq DB graph."],
      errors,
    };
  }

  try {
    const page = await logseq.Editor.createPage(
      pageName,
      {},
      { redirect: false },
    );
    pageCreated = Boolean(page);
    if (!page) throw new Error("Could not create the temporary probe page.");

    const block = await logseq.Editor.appendBlockInPage(
      pageName,
      "Logseq Recipe Phase 0 probe",
    );
    if (!block?.uuid) {
      throw new Error("Could not create the temporary probe block.");
    }
    blockUuid = block.uuid;

    const hidden = await probeProperty(
      blockUuid,
      keys.hidden,
      "checkbox",
      true,
      createdPropertyKeys,
      writtenBlockPropertyKeys,
    );
    hiddenProperty = hidden.ok;
    propertyIdent = hidden.ident;
    pluginNamespacedPropertyIdent = Boolean(
      hidden.ident?.startsWith(":plugin.property.") &&
        hidden.ident.includes("/"),
    );

    const number = await probeProperty(
      blockUuid,
      keys.number,
      "number",
      42,
      createdPropertyKeys,
      writtenBlockPropertyKeys,
    );
    numberProperty = number.ok;

    const text = await probeProperty(
      blockUuid,
      keys.text,
      "default",
      "draft-recipe",
      createdPropertyKeys,
      writtenBlockPropertyKeys,
    );
    textProperty = text.ok;

    try {
      const json = await probeProperty(
        blockUuid,
        keys.json,
        "json",
        {
          probe: "draft-recipe",
          version: 1,
        },
        createdPropertyKeys,
        writtenBlockPropertyKeys,
      );
      jsonProperty = json.ok;
    } catch (error) {
      jsonProperty = false;
      notes.push(`JSON property fallback required: ${errorMessage(error)}`);
    }

    dbChangeListener = await probeDbChangeListener(blockUuid);

    if (coverReference === "asset-path") {
      const images =
        (await logseq.Assets.listFilesOfCurrentGraph([
          "png",
          "jpg",
          "jpeg",
          "webp",
        ])) ?? [];
      notes.push(
        images.length > 0
          ? `Native asset-path APIs available; ${images.length} image asset(s) found. Reload/reopen persistence still requires the manual compatibility check.`
          : "Native asset-path APIs are available, but no image asset exists in this graph to perform the reload/reopen follow-up.",
      );
    }
  } catch (error) {
    errors.push(errorMessage(error));
  } finally {
    if (blockUuid) {
      for (const key of writtenBlockPropertyKeys) {
        try {
          await logseq.Editor.removeBlockProperty(blockUuid, key);
        } catch (error) {
          cleanupSucceeded = false;
          errors.push(`Cleanup block property ${key}: ${errorMessage(error)}`);
        }
      }
    }

    for (const key of createdPropertyKeys) {
      try {
        await logseq.Editor.removeProperty(key);
      } catch (error) {
        cleanupSucceeded = false;
        errors.push(`Cleanup property ${key}: ${errorMessage(error)}`);
      }
    }

    if (pageCreated) {
      try {
        await logseq.Editor.deletePage(pageName);
      } catch (error) {
        cleanupSucceeded = false;
        errors.push(`Cleanup page: ${errorMessage(error)}`);
      }
    }
  }

  return {
    appVersion,
    capabilities: {
      dbGraph,
      hiddenProperty,
      numberProperty,
      textProperty,
      jsonProperty,
      dbChangeListener,
      stableMainUi,
      coverReference,
    },
    pluginNamespacedPropertyIdent,
    propertyIdent,
    cleanupSucceeded,
    notes,
    errors,
  };
}

export function formatPhase0ProbeReport(report: Phase0ProbeReport): string {
  const c = report.capabilities;
  const rows = [
    ["DB graph", c.dbGraph],
    ["Hidden property read/write", c.hiddenProperty],
    ["Number property", c.numberProperty],
    ["Text/default property", c.textProperty],
    ["JSON property (optional)", c.jsonProperty],
    ["DB change listeners", c.dbChangeListener],
    ["Stable main UI", c.stableMainUi],
    ["Plugin-namespaced property ident", report.pluginNamespacedPropertyIdent],
    ["Cleanup", report.cleanupSucceeded],
  ] as const;

  const status = phase0ProbePassed(report)
    ? "Automated capability probe passed"
    : "Automated capability probe failed";

  const details = rows
    .map(([label, ok]) => `${ok ? "✓" : "✗"} ${label}`)
    .join("\n");

  const notes =
    report.notes.length > 0 ? `\nNotes:\n- ${report.notes.join("\n- ")}` : "";
  const errors =
    report.errors.length > 0
      ? `\nErrors:\n- ${report.errors.join("\n- ")}`
      : "";

  return `${status}\nLogseq ${report.appVersion}\nCover reference: ${c.coverReference}\n${details}${notes}${errors}`;
}
