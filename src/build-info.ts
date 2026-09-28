// Injected at build time via vite.config.ts's `define`, so a stale unpacked
// plugin build is easy to tell apart from the current source in the console.
declare const __DRAFT_RECIPE_VERSION__: string;
declare const __DRAFT_RECIPE_COMMIT__: string;

export const DRAFT_RECIPE_VERSION = __DRAFT_RECIPE_VERSION__;
export const DRAFT_RECIPE_COMMIT = __DRAFT_RECIPE_COMMIT__;
