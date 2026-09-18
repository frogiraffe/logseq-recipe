#!/usr/bin/env bash
# Packages the built plugin into the exact ZIP that ships in a GitHub Release
# and to the Marketplace. `pnpm package` always runs `pnpm build` first, so
# this never packages a stale dist/ left over from an earlier source state.
# Running this script directly (bypassing `pnpm package`) still refuses to
# package without a fresh-looking dist/, rather than silently reusing one.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f dist/index.html ]; then
  echo "dist/index.html not found — run 'pnpm build' first" >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
ZIP_NAME="logseq-recipe-v${VERSION}.zip"
STAGE_DIR="release/stage"

rm -rf release "$ZIP_NAME"
mkdir -p "$STAGE_DIR"
cp -r dist "$STAGE_DIR/dist"
cp package.json LICENSE README.md logo.svg "$STAGE_DIR/"

(cd "$STAGE_DIR" && zip -rq "../../$ZIP_NAME" .)
rm -rf release

echo "Packaged $ZIP_NAME"
