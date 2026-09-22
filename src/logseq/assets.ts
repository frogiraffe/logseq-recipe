import type { CoverRef } from "../domain/recipe";
import type { CoverReferenceCapability } from "./capabilities";
import { PROPERTY_KEYS } from "./property-keys";

export interface CoverResolverHost {
  assets: {
    makeUrl(path: string): Promise<string>;
  };
  editor: {
    getBlock(id: string): Promise<unknown>;
  };
}

export interface AssetListHost {
  listFilesOfCurrentGraph(
    exts?: string | string[],
  ): Promise<Array<{ path: string; size: number }> | null>;
}

export interface CoverWriterHost {
  upsertBlockProperty(
    id: string,
    key: string,
    value: unknown,
  ): Promise<unknown>;
  removeBlockProperty?(id: string, key: string): Promise<unknown>;
}

function publicAssetPath(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const block = value as Record<string, unknown>;
  for (const key of ["title", "fullTitle", "name"] as const) {
    const candidate = block[key];
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  return null;
}

export async function listImageAssets(host: AssetListHost): Promise<string[]> {
  const files =
    (await host.listFilesOfCurrentGraph(["png", "jpg", "jpeg", "webp"])) ?? [];
  return files
    .map((file) => file.path)
    .filter((path) => typeof path === "string" && path.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
}

export async function resolveCoverUrl(
  host: CoverResolverHost,
  cover: CoverRef | undefined,
): Promise<string | null> {
  if (!cover) return null;

  try {
    if (cover.kind === "asset-path") {
      return await host.assets.makeUrl(cover.value);
    }

    const node = await host.editor.getBlock(cover.value);
    const path = publicAssetPath(node);
    if (!path) return null;
    return await host.assets.makeUrl(path);
  } catch {
    return null;
  }
}

export async function setRecipeCover(
  host: CoverWriterHost,
  recipeId: string,
  cover: CoverRef,
  capabilities: { coverReference: CoverReferenceCapability },
): Promise<void> {
  if (capabilities.coverReference === "unsupported") {
    throw new Error(
      "Native cover references are not supported by this Logseq build.",
    );
  }
  if (
    capabilities.coverReference === "asset-node" &&
    cover.kind !== "asset-node"
  ) {
    throw new Error(
      "This Logseq build requires an asset-node cover reference.",
    );
  }
  if (
    capabilities.coverReference === "asset-path" &&
    cover.kind !== "asset-path"
  ) {
    throw new Error(
      "This Logseq build requires an asset-path cover reference.",
    );
  }

  await host.upsertBlockProperty(recipeId, PROPERTY_KEYS.coverRef, cover.value);
}

export async function clearRecipeCover(
  host: CoverWriterHost,
  recipeId: string,
): Promise<void> {
  if (host.removeBlockProperty) {
    await host.removeBlockProperty(recipeId, PROPERTY_KEYS.coverRef);
  }
}

export function currentCoverResolverHost(): CoverResolverHost {
  return {
    assets: logseq.Assets as unknown as CoverResolverHost["assets"],
    editor: logseq.Editor as unknown as CoverResolverHost["editor"],
  };
}

export function currentAssetListHost(): AssetListHost {
  return logseq.Assets as unknown as AssetListHost;
}
