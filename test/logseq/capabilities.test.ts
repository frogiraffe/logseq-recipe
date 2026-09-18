import { afterEach, describe, expect, it } from "vitest";
import {
  type Phase0ProbeReport,
  phase0ProbePassed,
  type RuntimeCapabilities,
  requiredCapabilitiesSatisfied,
  runPhase0CapabilityProbe,
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

function report(overrides: Partial<Phase0ProbeReport> = {}): Phase0ProbeReport {
  return {
    appVersion: "test",
    capabilities,
    pluginNamespacedPropertyIdent: true,
    cleanupSucceeded: true,
    notes: [],
    errors: [],
    ...overrides,
  };
}

const originalLogseq = globalThis.logseq;

afterEach(() => {
  globalThis.logseq = originalLogseq;
});

describe("requiredCapabilitiesSatisfied", () => {
  it("requires DB properties, listeners, main UI and a cover-reference strategy", () => {
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

  it("fails when no stable cover-reference strategy exists", () => {
    expect(
      requiredCapabilitiesSatisfied({
        ...capabilities,
        coverReference: "unsupported",
      }),
    ).toBe(false);
  });
});

describe("phase0ProbePassed", () => {
  it("requires the plugin-owned property namespace check", () => {
    expect(
      phase0ProbePassed(
        report({
          pluginNamespacedPropertyIdent: false,
        }),
      ),
    ).toBe(false);
  });

  it("requires successful cleanup and no probe errors", () => {
    expect(phase0ProbePassed(report({ cleanupSucceeded: false }))).toBe(false);
    expect(phase0ProbePassed(report({ errors: ["cleanup failed"] }))).toBe(
      false,
    );
    expect(phase0ProbePassed(report())).toBe(true);
  });
});

describe("runPhase0CapabilityProbe", () => {
  it("treats a null asset listing as an empty graph asset list", async () => {
    const blockProperties = new Map<string, unknown>();
    let blockChanged: (() => void) | undefined;

    globalThis.logseq = {
      App: {
        getInfo: async () => ({ version: "test" }),
        checkCurrentIsDbGraph: async () => true,
      },
      Editor: {
        createPage: async () => ({ uuid: "page" }),
        appendBlockInPage: async () => ({ uuid: "block" }),
        upsertProperty: async () => undefined,
        getProperty: async () => ({
          ident: ":plugin.property.lockstack-recipe/phase-0-probe",
        }),
        removeProperty: async () => undefined,
        upsertBlockProperty: async (
          _uuid: string,
          key: string,
          value: unknown,
        ) => {
          blockProperties.set(key, value);
        },
        getBlockProperty: async (_uuid: string, key: string) =>
          blockProperties.get(key),
        removeBlockProperty: async (_uuid: string, key: string) => {
          blockProperties.delete(key);
        },
        updateBlock: async () => {
          blockChanged?.();
        },
        deletePage: async () => undefined,
      },
      DB: {
        onBlockChanged: (_uuid: string, callback: () => void) => {
          blockChanged = callback;
          return () => {
            blockChanged = undefined;
          };
        },
        onChanged: () => () => undefined,
      },
      Assets: {
        listFilesOfCurrentGraph: async () => null,
        makeUrl: () => "asset://test",
      },
      showMainUI: () => undefined,
      hideMainUI: () => undefined,
    } as unknown as typeof logseq;

    const result = await runPhase0CapabilityProbe();

    expect(result.errors).toEqual([]);
    expect(result.notes).toContain(
      "Native asset-path APIs are available, but no image asset exists in this graph to perform the reload/reopen follow-up.",
    );
  });
});
