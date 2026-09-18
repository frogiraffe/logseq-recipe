import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import logseqDevPluginImport from "vite-plugin-logseq";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

function shortCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"])
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const logseqDevPlugin =
  typeof logseqDevPluginImport === "function"
    ? logseqDevPluginImport
    : (
        logseqDevPluginImport as unknown as {
          default: typeof logseqDevPluginImport;
        }
      ).default;

export default defineConfig(({ mode }) => ({
  plugins: mode === "test" ? [react()] : [react(), logseqDevPlugin()],
  define: {
    __LOCKSTACK_RECIPE_VERSION__: JSON.stringify(pkg.version),
    __LOCKSTACK_RECIPE_COMMIT__: JSON.stringify(shortCommit()),
  },
  build: {
    emptyOutDir: true,
    target: "es2022",
  },
  test: {
    environment: "happy-dom",
    globals: true,
  },
}));
