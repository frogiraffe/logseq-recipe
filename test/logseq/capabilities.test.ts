import { afterEach, describe, expect, it } from "vitest";
import {
  type RuntimeCapabilities,
  requiredCapabilitiesSatisfied,
} from "../../src/logseq/capabilities";

const capabilities: RuntimeCapabilities = {
  dbGraph: true,
  hiddenProperty: true,
  numberProperty: true,
  textProperty: true,
  jsonProperty: false,
  dbChangeListener: true,
  stableMainUi: true,
  coverReference: "asset-path",
};

const originalLogseq = globalThis.logseq;

afterEach(() => {
  globalThis.logseq = originalLogseq;
});

describe("requiredCapabilitiesSatisfied", () => {
  it("requires DB properties, a change listener, and a stable main UI", () => {
    expect(requiredCapabilitiesSatisfied(capabilities)).toBe(true);
  });

  it("treats JSON support as optional because metadata has a string fallback", () => {
    expect(
      requiredCapabilitiesSatisfied({
        ...capabilities,
        jsonProperty: false,
      }),
    ).toBe(true);
  });

  it("does not require a cover-reference strategy - cover support degrades independently", () => {
    expect(
      requiredCapabilitiesSatisfied({
        ...capabilities,
        coverReference: "unsupported",
      }),
    ).toBe(true);
  });

  it("still fails when a genuinely required capability (e.g. the DB change listener) is missing", () => {
    expect(
      requiredCapabilitiesSatisfied({
        ...capabilities,
        dbChangeListener: false,
      }),
    ).toBe(false);
  });
});
