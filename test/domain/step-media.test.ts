import { describe, expect, it } from "vitest";
import {
  assetMarkup,
  hasUnsafeMediaMarkup,
  parseStepChild,
  safeAssetPath,
} from "../../src/domain/step-media";

describe("safeAssetPath", () => {
  it("accepts graph-relative assets only", () => {
    expect(safeAssetPath("../assets/photo.png")).toBe("assets/photo.png");
    expect(safeAssetPath("assets/sub/clip.MP3")).toBe("assets/sub/clip.MP3");
    expect(safeAssetPath("./assets/a%20b.webp")).toBe("assets/a b.webp");
  });

  it.each([
    "https://example.com/assets/x.png",
    "file:///home/me/assets/x.png",
    "data:image/png;base64,AAAA",
    "/assets/x.png",
    "C:/assets/x.png",
    "../../assets/x.png",
    "assets/../secret.png",
    "assets/x.png?raw",
    "assets\\x.png",
    "assets/x.svg",
    "assets/",
    "pages/x.png",
    "%E0%A4%A",
  ])("rejects %s", (path) => {
    expect(safeAssetPath(path)).toBeNull();
  });
});

describe("parseStepChild", () => {
  it("classifies whole-block asset markup as media and the rest as notes", () => {
    expect(parseStepChild("c1", "![dough](../assets/dough.jpg)")).toEqual({
      id: "c1",
      kind: "image",
      text: "![dough](../assets/dough.jpg)",
      path: "assets/dough.jpg",
      alt: "dough",
    });
    expect(parseStepChild("c2", "![tip](../assets/tip.m4a)").kind).toBe(
      "audio",
    );
    expect(parseStepChild("c3", "Don't overmix.").kind).toBe("note");
    expect(parseStepChild("c4", "![x](https://example.com/x.png)").kind).toBe(
      "note",
    );
    expect(
      parseStepChild("c5", "See ![x](../assets/x.png) for shape").kind,
    ).toBe("note");
  });

  it("flags unsafe references and builds markup from listed paths", () => {
    expect(hasUnsafeMediaMarkup("![x](../assets/x.png)")).toBe(false);
    expect(hasUnsafeMediaMarkup("![x](/etc/x.png)")).toBe(true);
    expect(assetMarkup("assets/pie.webp")).toBe("![pie](../assets/pie.webp)");
    expect(assetMarkup("/home/me/graph/assets/pie.webp")).toBe(
      "![pie](../assets/pie.webp)",
    );
    expect(assetMarkup("pages/pie.webp")).toBeNull();
  });
});
