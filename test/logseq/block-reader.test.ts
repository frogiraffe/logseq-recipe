import { describe, expect, it } from "vitest";
import {
  toRecipeBlockSnapshot,
  unwrapBlockPropertyValue,
} from "../../src/logseq/block-reader";

describe("toRecipeBlockSnapshot", () => {
  it("uses PageEntity.name when title is absent", () => {
    expect(
      toRecipeBlockSnapshot({
        id: 1,
        uuid: "page-1",
        name: "Cookie",
        children: [],
      }),
    ).toMatchObject({
      id: 1,
      uuid: "page-1",
      title: "Cookie",
      children: [],
    });
  });
});

describe("unwrapBlockPropertyValue", () => {
  it("accepts both known DB property wrapper shapes", () => {
    expect(unwrapBlockPropertyValue({ value: 42 })).toBe(42);
    expect(unwrapBlockPropertyValue({ ":logseq.property/value": 42 })).toBe(42);
  });

  it("leaves primitive values unchanged", () => {
    expect(unwrapBlockPropertyValue("draft-recipe")).toBe("draft-recipe");
  });
});
