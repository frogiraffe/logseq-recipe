import "@logseq/libs";
import "./ui/styles.css";
import "./ui/feature-styles.css";
import "./ui/theme-fallback.css";
import {
  LOCKSTACK_RECIPE_COMMIT,
  LOCKSTACK_RECIPE_VERSION,
} from "./build-info";
import {
  probeRuntimeCapabilities,
  type RuntimeCapabilities,
  requiredCapabilitiesSatisfied,
} from "./logseq/capabilities";
import { ListenerBag } from "./logseq/events";
import {
  createConversionInitialView,
  openDraftRecipeUi,
  syncMountedTheme,
  unmountDraftRecipeUi,
} from "./logseq/runtime-ui";
import { registerSettings } from "./logseq/settings";

const listeners = new ListenerBag();
let runtimeCapabilitiesPromise: Promise<RuntimeCapabilities> | null = null;

function runtimeCapabilities(): Promise<RuntimeCapabilities> {
  runtimeCapabilitiesPromise ??= probeRuntimeCapabilities();
  return runtimeCapabilitiesPromise;
}

async function requireSupportedRuntime(): Promise<RuntimeCapabilities | null> {
  const capabilities = await runtimeCapabilities();
  if (!capabilities.dbGraph) {
    logseq.UI.showMsg(
      "Lockstack Recipe currently targets Logseq DB graphs only.",
      "warning",
    );
    return null;
  }
  if (!requiredCapabilitiesSatisfied(capabilities)) {
    logseq.UI.showMsg(
      "Lockstack Recipe: this Logseq build is missing a required stable capability.",
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

async function openRecipes(): Promise<void> {
  const capabilities = await requireSupportedRuntime();
  if (!capabilities) return;
  await openDraftRecipeUi({ kind: "recipes" }, capabilities);
}

async function openCreateRecipe(): Promise<void> {
  const capabilities = await requireSupportedRuntime();
  if (!capabilities) return;
  await openDraftRecipeUi({ kind: "create" }, capabilities);
}

async function openConvertRecipe(uuid?: string): Promise<void> {
  const capabilities = await requireSupportedRuntime();
  if (!capabilities) return;

  const initialView = await createConversionInitialView(capabilities, uuid);
  if (!initialView) {
    logseq.UI.showMsg(
      "Lockstack Recipe: select a recipe root block/page with child sections first.",
      "warning",
    );
    return;
  }
  await openDraftRecipeUi(initialView, capabilities);
}

async function main(): Promise<void> {
  registerSettings();

  ownCommand(
    "draft-recipe-recipes",
    { title: "Lockstack Recipe: Recipes", placement: "palette" },
    openRecipes,
  );
  ownCommand(
    "draft-recipe-create",
    { title: "Lockstack Recipe: Create Recipe", placement: "palette" },
    openCreateRecipe,
  );
  ownCommand(
    "draft-recipe-convert-current",
    { title: "Lockstack Recipe: Convert to Recipe", placement: "palette" },
    () => openConvertRecipe(),
  );
  ownCommand(
    "draft-recipe-convert-block",
    {
      title: "Lockstack Recipe: Convert to Recipe",
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
    `Lockstack Recipe ${LOCKSTACK_RECIPE_VERSION} — ${LOCKSTACK_RECIPE_COMMIT} loaded and ready`,
  );
}

logseq.ready(main).catch(console.error);
