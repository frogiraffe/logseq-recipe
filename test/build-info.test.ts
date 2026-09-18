import { describe, expect, it } from "vitest";
import {
  LOCKSTACK_RECIPE_COMMIT,
  LOCKSTACK_RECIPE_VERSION,
} from "../src/build-info";

describe("build-info", () => {
  it("exposes a non-empty version and commit identifier for stale-build diagnosis", () => {
    expect(LOCKSTACK_RECIPE_VERSION.length).toBeGreaterThan(0);
    expect(LOCKSTACK_RECIPE_COMMIT.length).toBeGreaterThan(0);
  });
});
