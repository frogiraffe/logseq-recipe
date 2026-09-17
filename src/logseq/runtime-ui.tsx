import { createRoot, type Root } from "react-dom/client";
import {
  analyzeRecipeConversion,
  type ConversionSourceNode,
} from "../application/convert-recipe";
import { defaultParseContext } from "../parsing/context";
import { DraftRecipeApp } from "../ui/app";
import { getUiMessages } from "../ui/i18n";
import type {
  DraftRecipeInitialView,
  DraftRecipeUiController,
} from "../ui/state";
import {
  type RecipeBlockSnapshot,
  toRecipeBlockSnapshot,
  unwrapBlockPropertyValue,
} from "./block-reader";
import type { RuntimeCapabilities } from "./capabilities";
import { isTruthyMarkerValue } from "./logseq-recipe-repository";
import { PROPERTY_KEYS } from "./property-keys";
import { createRuntimeUiContext } from "./ui-controller";

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

function closeMountedUi(): void {
  logseq.hideMainUI();
  queueMicrotask(() => unmountDraftRecipeUi());
}

function controllerWithLifecycle(
  controller: DraftRecipeUiController,
): DraftRecipeUiController {
  return {
    ...controller,
    close: closeMountedUi,
  };
}

function toConversionSource(block: RecipeBlockSnapshot): ConversionSourceNode {
  return {
    id: block.uuid,
    title: block.title,
    children: block.children.map(toConversionSource),
  };
}

function pageWithChildren(page: unknown, children: unknown): unknown {
  if (!page || typeof page !== "object") return null;
  return {
    ...(page as Record<string, unknown>),
    children: Array.isArray(children) ? children : [],
  };
}

export async function loadConversionRoot(
  uuid?: string,
): Promise<ConversionSourceNode | null> {
  let entity: unknown = null;

  if (uuid) {
    entity = await logseq.Editor.getBlock(uuid, { includeChildren: true });
    if (!entity) {
      const page = await logseq.Editor.getPage(uuid);
      if (page) {
        const children = await logseq.Editor.getPageBlocksTree(uuid);
        entity = pageWithChildren(page, children);
      }
    }
  } else {
    // Command-palette invocation (no explicit block target): always convert
    // the current page as a whole, regardless of where the editing cursor
    // happens to be. Targeting the focused child block here would silently
    // convert the wrong subtree - that is what the block context menu (which
    // always passes an explicit uuid) is for.
    const currentPage = await logseq.Editor.getCurrentPage();
    if (currentPage?.uuid) {
      const page = await logseq.Editor.getPage(currentPage.uuid);
      const children = await logseq.Editor.getPageBlocksTree(currentPage.uuid);
      entity = pageWithChildren(page ?? currentPage, children);
    }
  }

  const snapshot = toRecipeBlockSnapshot(entity);
  return snapshot ? toConversionSource(snapshot) : null;
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

export async function isAlreadyDraftRecipe(rootId: string): Promise<boolean> {
  const markerValue = unwrapBlockPropertyValue(
    await logseq.Editor.getBlockProperty(rootId, PROPERTY_KEYS.recipeMarker),
  );
  return isTruthyMarkerValue(markerValue);
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

  const parseContext = defaultParseContext(context.defaultParserLocale);
  parseContext.sourceMeasurementSystem = context.defaultSourceMeasurementSystem;
  const draft = analyzeRecipeConversion(source, parseContext);
  return { kind: "convert", draft };
}

export async function openDraftRecipeUi(
  initialView: DraftRecipeInitialView,
  capabilities: RuntimeCapabilities,
): Promise<void> {
  const runtime = await createRuntimeUiContext(capabilities);
  const messages = getUiMessages(runtime.settings.uiLanguage);
  const [configs, themeCssProperties] = await Promise.all([
    logseq.App.getUserConfigs(),
    resolveHostThemeCssProperties(),
  ]);
  const appRoot = resetRoot();

  appRoot.render(
    <DraftRecipeApp
      controller={controllerWithLifecycle(runtime.controller)}
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
  root?.unmount();
  root = null;
}
