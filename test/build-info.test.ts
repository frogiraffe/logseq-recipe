import { describe, expect, it } from "vitest";
import { DRAFT_RECIPE_COMMIT, DRAFT_RECIPE_VERSION } from "../src/build-info";

describe("build-info", () => {
  it("exposes a non-empty version and commit identifier for stale-build diagnosis", () => {
    expect(DRAFT_RECIPE_VERSION.length).toBeGreaterThan(0);
    expect(DRAFT_RECIPE_COMMIT.length).toBeGreaterThan(0);
  });
});
