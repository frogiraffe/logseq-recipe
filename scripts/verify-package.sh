#!/usr/bin/env bash
# Verifies a packaged plugin ZIP (from scripts/package.sh) is a well-formed,
# installable Logseq plugin: unpacks it and checks required files/entry point.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
ZIP_NAME="${1:-logseq-recipe-v${VERSION}.zip}"

if [ ! -f "$ZIP_NAME" ]; then
  echo "package verification FAILED: $ZIP_NAME not found" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

unzip -q "$ZIP_NAME" -d "$TMP_DIR"

fail() {
  echo "package verification FAILED: $1" >&2
  exit 1
}

[ -f "$TMP_DIR/package.json" ] || fail "package.json missing"
[ -f "$TMP_DIR/LICENSE" ] || fail "LICENSE missing"
[ -f "$TMP_DIR/README.md" ] || fail "README.md missing"
[ -f "$TMP_DIR/dist/index.html" ] || fail "dist/index.html missing"

node -e "JSON.parse(require('fs').readFileSync('$TMP_DIR/package.json', 'utf8'))" ||
  fail "package.json does not parse as JSON"

MAIN_REL="$(node -p "require('$TMP_DIR/package.json').main")"
[ -f "$TMP_DIR/$MAIN_REL" ] || fail "main entry point ($MAIN_REL) missing"

ICON_REL="$(node -p "require('$TMP_DIR/package.json').logseq.icon.replace(/^\.\\//, '')")"
[ -f "$TMP_DIR/$ICON_REL" ] || fail "icon ($ICON_REL) missing"

# Identity consistency: package.json, logseq.id, repository URL, version, and
# the artifact's own filename must all agree on the same plugin identity -
# a stray "logseq-draft-recipe" left anywhere here would otherwise ship
# silently.
PKG_NAME="$(node -p "require('$TMP_DIR/package.json').name")"
[ "$PKG_NAME" = "logseq-recipe" ] || fail "package.json name is '$PKG_NAME', expected 'logseq-recipe'"

LOGSEQ_ID="$(node -p "require('$TMP_DIR/package.json').logseq.id")"
[ "$LOGSEQ_ID" = "logseq-recipe" ] || fail "logseq.id is '$LOGSEQ_ID', expected 'logseq-recipe'"

REPO_URL="$(node -p "require('$TMP_DIR/package.json').repository.url")"
case "$REPO_URL" in
  *frogiraffe/logseq-recipe*) ;;
  *) fail "repository.url is '$REPO_URL', expected the frogiraffe/logseq-recipe repo" ;;
esac

PKG_VERSION="$(node -p "require('$TMP_DIR/package.json').version")"
[ "$PKG_VERSION" = "$VERSION" ] ||
  fail "packaged version ($PKG_VERSION) does not match the expected version ($VERSION)"

EXPECTED_NAME="logseq-recipe-v${PKG_VERSION}.zip"
[ "$(basename "$ZIP_NAME")" = "$EXPECTED_NAME" ] ||
  fail "artifact is named '$(basename "$ZIP_NAME")', expected '$EXPECTED_NAME'"

echo "package verification OK: $ZIP_NAME"
echo "contents:"
(cd "$TMP_DIR" && find . -type f | sort)
