import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeCapabilities } from "../../src/logseq/capabilities";

const runtimeContext = vi.hoisted(() => vi.fn());
vi.mock("../../src/logseq/ui-controller", () => ({
  createRuntimeUiContext: runtimeContext,
}));

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
  runtimeContext.mockReset();
  document.body.replaceChildren();
});

describe("runtime UI session", () => {
  it("does not mount an opening UI after a graph change unmounts it", async () => {
    let resolveContext!: (value: unknown) => void;
    runtimeContext.mockReturnValue(
      new Promise((resolve) => {
        resolveContext = resolve;
      }),
    );
    const showMainUI = vi.fn();
    globalThis.logseq = {
      App: {
        getUserConfigs: vi.fn().mockResolvedValue({
          preferredThemeMode: "light",
        }),
      },
      UI: { resolveThemeCssPropsVals: vi.fn().mockResolvedValue({}) },
      showMainUI,
      hideMainUI: vi.fn(),
      setMainUIInlineStyle: vi.fn(),
    } as unknown as typeof logseq;

    const { openDraftRecipeUi, unmountDraftRecipeUi } = await import(
      "../../src/logseq/runtime-ui"
    );
    const opening = openDraftRecipeUi({ kind: "recipes" }, capabilities);
    unmountDraftRecipeUi();
    resolveContext({
      settings: {
        uiLanguage: "en",
        defaultMeasurementSystem: "metric",
      },
      controller: {},
      defaultParserLocale: "en",
      defaultSourceMeasurementSystem: "metric",
    });

    await expect(opening).resolves.toBeUndefined();
    expect(showMainUI).not.toHaveBeenCalled();
    expect(document.getElementById("app")).toBeNull();
  });
});
