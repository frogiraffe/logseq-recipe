import { createRoot, type Root } from "react-dom/client";
import { analyzeRecipeConversion } from "../application/convert-recipe";
import {
  flattenUnsplitSource,
  looksUnsplit,
  splitIndentedOutline,
} from "../application/split-outline";
import { defaultParseContext } from "../parsing/context";
import { DraftRecipeApp } from "../ui/app";
import { getUiMessages } from "../ui/i18n";
import type {
  DraftRecipeInitialView,
  DraftRecipeUiController,
} from "../ui/state";
import type { RuntimeCapabilities } from "./capabilities";
import { isAlreadyDraftRecipe, loadConversionRoot } from "./conversion-source";
import { createRuntimeUiContext } from "./ui-controller";

export { isAlreadyDraftRecipe, loadConversionRoot } from "./conversion-source";

const THEME_CSS_PROPERTIES = [
  "--ls-primary-text-color",
  "--ls-secondary-text-color",
  "--ls-primary-background-color",
  "--ls-secondary-background-color",
  "--ls-tertiary-background-color",
  "--ls-border-color",
  "--ls-link-text-color",
  "--ls-error-color",
  "--ls-font-family",
] as const;

let root: Root | null = null;
let uiRequest = 0;

function appElement(): HTMLElement {
  let element = document.getElementById("app");
  if (!element) {
    element = document.createElement("div");
    element.id = "app";
    document.body.append(element);
  }
  return element;
}

function resetRoot(): Root {
  root?.unmount();
  root = createRoot(appElement());
  return root;
}

function closeMountedUi(request: number): void {
  if (request !== uiRequest) return;
  logseq.hideMainUI();
  queueMicrotask(() => unmountDraftRecipeUi());
}

function controllerWithLifecycle(
  controller: DraftRecipeUiController,
  request: number,
): DraftRecipeUiController {
  return {
    ...controller,
    close: () => closeMountedUi(request),
  };
}

async function resolveHostThemeCssProperties(): Promise<
  Record<string, string>
> {
  const resolved = await logseq.UI.resolveThemeCssPropsVals([
    ...THEME_CSS_PROPERTIES,
  ]);
  if (!resolved) return {};

  const themeCssProperties: Record<string, string> = {};
  for (const property of THEME_CSS_PROPERTIES) {
    const value = resolved[property]?.trim();
    if (value) themeCssProperties[property] = value;
  }
  return themeCssProperties;
}

export async function syncMountedTheme(): Promise<void> {
  const shell = document.querySelector<HTMLElement>(".draft-recipe-app");
  if (!shell) return;

  const [configs, themeCssProperties] = await Promise.all([
    logseq.App.getUserConfigs(),
    resolveHostThemeCssProperties(),
  ]);
  shell.dataset.themeMode = configs.preferredThemeMode;
  for (const [property, value] of Object.entries(themeCssProperties)) {
    shell.style.setProperty(property, value);
  }
}

export async function createConversionInitialView(
  capabilities: RuntimeCapabilities,
  uuid?: string,
): Promise<DraftRecipeInitialView | null> {
  const context = await createRuntimeUiContext(capabilities);
  const source = await loadConversionRoot(uuid);
  if (!source) return null;

  if (await isAlreadyDraftRecipe(source.id)) {
    return { kind: "already-recipe", recipeId: source.id, title: source.title };
  }

  if (looksUnsplit(source.children)) {
    const outline = splitIndentedOutline(flattenUnsplitSource(source));
    if (outline) {
      return {
        kind: "convert-needs-split",
        uuid: source.id,
        outline,
        staleChildIds: source.children.map((child) => child.id),
      };
    }
  }

  const parseContext = defaultParseContext(context.defaultParserLocale);
  parseContext.sourceMeasurementSystem = context.defaultSourceMeasurementSystem;
  const draft = analyzeRecipeConversion(source, parseContext);
  return { kind: "convert", source, draft };
}

export async function openDraftRecipeUi(
  initialView: DraftRecipeInitialView,
  capabilities: RuntimeCapabilities,
): Promise<void> {
  const request = ++uiRequest;
  const runtime = await createRuntimeUiContext(capabilities);
  if (request !== uiRequest) return;
  const messages = getUiMessages(runtime.settings.uiLanguage);
  const [configs, themeCssProperties] = await Promise.all([
    logseq.App.getUserConfigs(),
    resolveHostThemeCssProperties(),
  ]);
  if (request !== uiRequest) return;
  const appRoot = resetRoot();

  appRoot.render(
    <DraftRecipeApp
      controller={controllerWithLifecycle(runtime.controller, request)}
      messages={messages}
      config={{
        initialView,
        globalMeasurementSystem: runtime.settings.defaultMeasurementSystem,
        defaultParserLocale: runtime.defaultParserLocale,
        defaultSourceMeasurementSystem: runtime.defaultSourceMeasurementSystem,
        themeMode: configs.preferredThemeMode,
        themeCssProperties,
      }}
    />,
  );

  logseq.setMainUIInlineStyle({
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    overflow: "auto",
    zIndex: 999,
  });
  logseq.showMainUI({ autoFocus: true });
}

export function unmountDraftRecipeUi(): void {
  uiRequest += 1;
  root?.unmount();
  root = null;
}
