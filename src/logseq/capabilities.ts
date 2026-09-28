export type CoverReferenceCapability =
  | "asset-node"
  | "asset-path"
  | "unsupported";

export interface RuntimeCapabilities {
  dbGraph: boolean;
  hiddenProperty: boolean;
  numberProperty: boolean;
  textProperty: boolean;
  dbChangeListener: boolean;
  stableMainUi: boolean;
  coverReference: CoverReferenceCapability;
}

function hasFunction(target: unknown, name: string): boolean {
  if (!target || typeof target !== "object") return false;
  return typeof (target as Record<string, unknown>)[name] === "function";
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
    // Only the graph-wide `onChanged` feed is used (see watchRecipe), so
    // `onBlockChanged` must not gate whether the plugin runs.
    dbChangeListener: hasFunction(db, "onChanged"),
    stableMainUi: await probeMainUi(),
    coverReference: detectCoverReferenceCapability(),
  };
}
