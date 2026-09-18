# Logseq Recipe Compatibility

Status: **automated Phase 0 passed on one real Logseq nightly build; full runtime qualification is still pending**.

Logseq Recipe v0.1 targets Logseq DB graphs only. The stable SDK surface is implemented behind a reversible Phase 0 probe. This repository does not yet declare a minimum supported Logseq version because cover persistence and the remaining real-app create/convert/live-edit scenarios have not completed on a qualified build.

## Required capability gate

A build is eligible for support only when all of the following are observed in the real app:

- DB graph detection succeeds.
- Hidden plugin-owned property creation/write/read succeeds.
- Number property creation/write/read succeeds.
- Default/text property creation/write/read succeeds.
- Plugin-created property idents are automatically namespaced by Logseq.
- A scoped DB block-change listener fires and its disposer works.
- Stable `showMainUI` / `hideMainUI` APIs work without `logseq.Experiments`.
- At least one stable native cover-reference strategy survives plugin reload and graph reopen.
- Probe-created page/property data is cleaned up successfully.

## JSON-property policy

The Phase 0 probe measures native JSON-property behavior because it is useful compatibility information, but **Logseq Recipe v0.1 does not depend on it**.

Core v0.1 runtime deliberately stores the low-frequency `recipe_meta` payload through the validated string-JSON codec even when a Logseq build appears to support native JSON properties. This keeps metadata persistence consistent across qualified builds and avoids making an evolving DB property representation part of the v0.1 compatibility contract.

A future schema version may opt into native JSON only after released-build evidence justifies doing so and a migration path is defined.

## Cover policy

v0.1 prefers the public graph-asset path surface exposed through:

- `Assets.listFilesOfCurrentGraph`
- `Assets.makeUrl`

The plugin stores a reference only. It never automatically deletes the underlying graph asset when a recipe cover changes or is cleared.

Cover qualification is incomplete until the reference has survived:

1. normal recipe close/reopen;
2. plugin reload;
3. graph close/reopen;
4. a missing/deleted asset without crashing the recipe UI.

## How to qualify a build

1. Open a disposable or backed-up DB graph.
2. Ensure the graph contains at least one PNG/JPG/JPEG/WebP asset if cover testing is desired.
3. Load the plugin; it silently gates its own commands behind `probeRuntimeCapabilities` (`src/logseq/capabilities.ts`) and warns via `logseq.UI.showMsg` if a required capability is missing. The dev-only Phase 0 command-palette probe was removed from the release build; run `pnpm test` (`test/logseq/capabilities.test.ts`) or a manual REPL check against the probe functions if you need the itemized report.
4. Note the exact Logseq version and whether Logseq Recipe's commands opened without a capability warning.
5. Select/use the candidate cover asset, reload the plugin, and confirm the reference still resolves.
6. Close/reopen the graph and confirm the same cover reference still resolves.
7. Run the create/convert/live-edit scenarios from `LOCAL-TESTING.md`.
8. Record the observed result below as a completed row.

## Observed builds

### Logseq 2.0.1-alpha-nightly.20260826

Observed in a real DB graph on 2026-09-12.

Automated Phase 0 result: **passed**.

Observed capabilities:

- DB graph: pass
- hidden property read/write: pass
- number property: pass
- default/text property: pass
- native JSON property probe: pass
- DB change listeners: pass
- stable main UI: pass
- plugin-namespaced property ident: pass
- cleanup: pass
- cover reference strategy: `asset-path`

The graph used for this run did not contain an image asset, so cover close/reopen, plugin reload, graph reopen, and missing-asset behavior are **not yet qualified**. Create/convert/live-edit runtime scenarios are also still pending. Therefore this row is evidence for the automated capability gate only, not a completed compatibility qualification.

Until at least one released DB build passes the complete qualification gate, this repository does not claim a minimum supported Logseq version or a verified runtime compatibility range.

## Current SDK assumptions

The implementation is compiled against `@logseq/libs` 0.3.4 and keeps required functionality on stable APIs:

- DB graph detection
- Editor property APIs
- Datascript recipe discovery
- DB change hooks
- stable main UI
- stable Commands API
- public Assets API

`logseq.Experiments` is not a core dependency. Experimental rendering may be explored later only as an optional enhancement with a stable fallback.
