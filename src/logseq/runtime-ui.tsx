import { createRoot, type Root } from "react-dom/client";
import { planRecipeConversion } from "../application/convert-recipe";
import { defaultParseContext } from "../parsing/context";
import { DraftRecipeApp } from "../ui/app";
import { getUiMessages, type UiMessages } from "../ui/i18n";
import type {
  DraftRecipeInitialView,
  DraftRecipeUiController,
} from "../ui/state";
import {
  notifyTimerDone,
  playTimerCue,
  watchTimerAlarms,
} from "../ui/timer-alarms";
import type { RuntimeCapabilities } from "./capabilities";
import { isAlreadyDraftRecipe, loadConversionRoot } from "./conversion-source";
import { readSettings } from "./settings";
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

// Cooking timers must ring after the plugin UI closes, so their alarms live
// here, beside the plugin runtime, not inside the unmountable React tree.
let alarms: { graphKey: string; stop(): void } | null = null;
let alarmMessages: UiMessages | null = null;

function ensureTimerAlarms(graphKey: string, messages: UiMessages): void {
  alarmMessages = messages;
  if (alarms?.graphKey === graphKey) return;
  alarms?.stop();
  alarms = {
    graphKey,
    stop: watchTimerAlarms(graphKey, (timer) => {
      const text = alarmMessages?.timerDone ?? "Time's up";
      const body = [timer.recipeTitle, timer.label].filter(Boolean).join(" · ");
      playTimerCue();
      notifyTimerDone(text, body);
      void logseq.UI.showMsg(`⏰ ${text} — ${body}`, "warning", {
        timeout: 60_000,
      });
    }),
  };
}

/** A graph switch must never ring the previous graph's timers. */
export function stopTimerAlarms(): void {
  alarms?.stop();
  alarms = null;
}

// Missing or failing graph info only disables Cooking Mode resume.
async function currentGraphKey(): Promise<string | undefined> {
  const graph = await Promise.resolve()
    .then(() => logseq.App.getCurrentGraph())
    .catch(() => null);
  return graph ? graph.path || graph.url || graph.name : undefined;
}

/**
 * Arms the current graph's timer alarms without opening any UI, at plugin
 * load and after a graph switch: a cook kept across a Logseq restart must
 * ring on time even if the plugin is never opened again.
 */
export async function startTimerAlarms(): Promise<void> {
  const graphKey = await currentGraphKey();
  if (graphKey) {
    ensureTimerAlarms(graphKey, getUiMessages(readSettings().uiLanguage));
  }
}

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
  const close = () => closeMountedUi(request);
  return {
    ...controller,
    close,
    openInLogseq: (id) => {
      controller.openInLogseq(id);
      close();
    },
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

  const parseContext = defaultParseContext(context.defaultParserLocale);
  parseContext.sourceMeasurementSystem = context.defaultSourceMeasurementSystem;
  const plan = planRecipeConversion(source, parseContext);
  if (plan.kind === "split") {
    return {
      kind: "convert-needs-split",
      uuid: source.id,
      outline: plan.outline,
      staleChildIds: source.children.map((child) => child.id),
    };
  }
  return { kind: "convert", source, draft: plan.draft };
}

export async function openDraftRecipeUi(
  initialView: DraftRecipeInitialView,
  capabilities: RuntimeCapabilities,
): Promise<void> {
  const request = ++uiRequest;
  const runtime = await createRuntimeUiContext(capabilities);
  if (request !== uiRequest) return;
  const messages = getUiMessages(runtime.settings.uiLanguage);
  const [configs, themeCssProperties, graphKey] = await Promise.all([
    logseq.App.getUserConfigs(),
    resolveHostThemeCssProperties(),
    currentGraphKey(),
  ]);
  if (request !== uiRequest) return;
  if (graphKey) ensureTimerAlarms(graphKey, messages);
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
        ...(graphKey ? { graphKey } : {}),
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
