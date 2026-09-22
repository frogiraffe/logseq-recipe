import { describe, expect, it, vi } from "vitest";
import type { CoverRef } from "../../src/domain/recipe";
import {
  listImageAssets,
  resolveCoverUrl,
  setRecipeCover,
} from "../../src/logseq/assets";

describe("native recipe covers", () => {
  it("treats a null graph asset list as empty", async () => {
    const result = await listImageAssets({
      listFilesOfCurrentGraph: async () => null,
    });

    expect(result).toEqual([]);
  });

  it("resolves an asset-path cover through the public Assets API", async () => {
    const makeUrl = vi.fn(async (path: string) => `asset://${path}`);
    const result = await resolveCoverUrl(
      {
        assets: { makeUrl },
        editor: { getBlock: async () => null },
      },
      { kind: "asset-path", value: "assets/cookie.jpg" },
    );
    expect(result).toBe("asset://assets/cookie.jpg");
    expect(makeUrl).toHaveBeenCalledWith("assets/cookie.jpg");
  });

  it("resolves an asset-node through its public block title when available", async () => {
    const result = await resolveCoverUrl(
      {
        assets: { makeUrl: async (path: string) => `asset://${path}` },
        editor: {
          getBlock: async () => ({
            uuid: "asset-1",
            title: "assets/photo.png",
          }),
        },
      },
      { kind: "asset-node", value: "asset-1" },
    );
    expect(result).toBe("asset://assets/photo.png");
  });

  it("returns null when a referenced asset cannot be resolved", async () => {
    const result = await resolveCoverUrl(
      {
        assets: {
          makeUrl: async () => {
            throw new Error("missing");
          },
        },
        editor: { getBlock: async () => null },
      },
      { kind: "asset-path", value: "assets/missing.jpg" },
    );
    expect(result).toBeNull();
  });

  it("changes only the recipe reference and never deletes the previous asset", async () => {
    const writes: unknown[] = [];
    const next: CoverRef = { kind: "asset-path", value: "assets/new.jpg" };
    await setRecipeCover(
      {
        upsertBlockProperty: async (...args: unknown[]) => {
          writes.push(args);
        },
      },
      "recipe-1",
      next,
      { coverReference: "asset-path" },
    );
    expect(writes).toEqual([["recipe-1", "cover_ref", "assets/new.jpg"]]);
  });
});
