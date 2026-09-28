import "@logseq/libs";
import "./ui/styles.css";
import "./ui/feature-styles.css";
import "./ui/theme-fallback.css";
import { DRAFT_RECIPE_COMMIT, DRAFT_RECIPE_VERSION } from "./build-info";
import {
  probeRuntimeCapabilities,
  type RuntimeCapabilities,
  requiredCapabilitiesSatisfied,
} from "./logseq/capabilities";
import { ListenerBag } from "./logseq/events";
import { clearRecipeReadCaches } from "./logseq/logseq-recipe-repository";
import {
  createConversionInitialView,
  currentUiMessages,
  openDraftRecipeUi,
  startTimerAlarms,
  stopTimerAlarms,
  syncMountedTheme,
  unmountDraftRecipeUi,
} from "./logseq/runtime-ui";
import { registerSettings } from "./logseq/settings";
import { errorMessage } from "./ui/error-message";
import type { DraftRecipeInitialView } from "./ui/state";

const listeners = new ListenerBag();
let runtimeCapabilitiesPromise: Promise<RuntimeCapabilities> | null = null;

function runtimeCapabilities(): Promise<RuntimeCapabilities> {
  runtimeCapabilitiesPromise ??= probeRuntimeCapabilities();
  return runtimeCapabilitiesPromise;
}

async function requireSupportedRuntime(): Promise<RuntimeCapabilities | null> {
  const capabilities = await runtimeCapabilities();
  if (!capabilities.dbGraph) {
    logseq.UI.showMsg((await currentUiMessages()).notDbGraph, "warning");
    return null;
  }
  if (!requiredCapabilitiesSatisfied(capabilities)) {
    logseq.UI.showMsg(
      (await currentUiMessages()).unsupportedLogseqBuild,
      "warning",
    );
    return null;
  }
  return capabilities;
}

function ownCommand(
  id: string,
  options: Parameters<typeof logseq.Commands.register>[1],
  action: Parameters<typeof logseq.Commands.register>[2],
): void {
  const unregister = logseq.Commands.register(id, options, action);
  if (typeof unregister === "function") listeners.add(unregister);
}

async function openView(view: DraftRecipeInitialView): Promise<void> {
  const capabilities = await requireSupportedRuntime();
  if (capabilities) await openDraftRecipeUi(view, capabilities);
}

async function openConvertRecipe(uuid?: string): Promise<void> {
  const capabilities = await requireSupportedRuntime();
  if (!capabilities) return;

  let initialView: Awaited<ReturnType<typeof createConversionInitialView>>;
  try {
    initialView = await createConversionInitialView(capabilities, uuid);
  } catch (cause) {
    const messages = await currentUiMessages();
    logseq.UI.showMsg(
      `Logseq Recipe: ${errorMessage(cause, messages)}`,
      "error",
    );
    return;
  }
  if (!initialView) {
    logseq.UI.showMsg((await currentUiMessages()).nothingToConvert, "warning");
    return;
  }
  await openDraftRecipeUi(initialView, capabilities);
}

async function main(): Promise<void> {
  registerSettings();
  void startTimerAlarms();

  ownCommand(
    "draft-recipe-recipes",
    { title: "Logseq Recipe: Recipes", placement: "palette" },
    () => openView({ kind: "recipes" }),
  );
  ownCommand(
    "draft-recipe-create",
    { title: "Logseq Recipe: Create Recipe", placement: "palette" },
    () => openView({ kind: "create" }),
  );
  ownCommand(
    "draft-recipe-import-text",
    { title: "Logseq Recipe: Import Recipe from Text", placement: "palette" },
    () => openView({ kind: "import-text" }),
  );
  ownCommand(
    "draft-recipe-convert-current",
    { title: "Logseq Recipe: Convert to Recipe", placement: "palette" },
    () => openConvertRecipe(),
  );
  ownCommand(
    "draft-recipe-convert-block",
    {
      title: "Logseq Recipe: Convert to Recipe",
      placement: "block-context-menu",
    },
    ({ uuid }: { uuid: string }) => openConvertRecipe(uuid),
  );
  listeners.add(
    logseq.App.onThemeModeChanged(() => {
      void syncMountedTheme();
    }),
  );

  listeners.add(
    logseq.App.onCurrentGraphChanged(() => {
      runtimeCapabilitiesPromise = null;
      stopTimerAlarms();
      void startTimerAlarms();
      clearRecipeReadCaches();
      unmountDraftRecipeUi();
      logseq.hideMainUI();
    }),
  );

  logseq.beforeunload(async () => {
    listeners.dispose();
    unmountDraftRecipeUi();
    logseq.hideMainUI();
  });

  console.info(
    `Logseq Recipe ${DRAFT_RECIPE_VERSION} — ${DRAFT_RECIPE_COMMIT} loaded and ready`,
  );
}

logseq.ready(main).catch(console.error);
