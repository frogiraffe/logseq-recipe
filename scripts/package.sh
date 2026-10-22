#!/usr/bin/env bash
# Packages the built plugin into the exact ZIP that ships in a GitHub Release
# and to the Marketplace. `pnpm package` always runs `pnpm build` first, so
# this never packages a stale dist/ left over from an earlier source state;
# scripts/verify-package.sh rejects a dev-server or older dist/ packaged by
# running this script directly.
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
# Only tracked files: never a draft or .DS_Store lying in docs/ or examples/.
git ls-files -z docs examples | tar --null -T - -cf - | tar -xf - -C "$STAGE_DIR"
cp package.json LICENSE README.md CHANGELOG.md logo.svg "$STAGE_DIR/"

(cd "$STAGE_DIR" && zip -rq "../../$ZIP_NAME" .)
rm -rf release

echo "Packaged $ZIP_NAME"
