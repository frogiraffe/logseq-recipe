# Contributing

## Setup

Node.js 20.19 or newer and pnpm 10.33.0.

```bash
pnpm install --frozen-lockfile
pnpm check            # typecheck, lint, tests, build
pnpm demo             # the real UI over sample data, at http://localhost:5173/demo/
pnpm dev              # dev server with hot reload; Load unpacked plugin on this folder
```

`pnpm demo` takes `?locale=tr`, `?ui=en`, `?theme=dark` and
`?convert=cookies` (Convert on a real-world paste).

## Principles

- **Deterministic and conservative parsing.** A rule that could misread
  valid text doesn't go in; ambiguous text stays as written or is put to
  the user in a preview. Every parser change comes with the regression
  lines that motivated it (`test/parsing/fixtures`).
- **The user's text is the source.** Nothing rewrites what the user wrote
  except an edit they save.
- **Explicit data flow.** Reads return plain objects; writes go through the
  repository as named block and property operations.
- **Idempotent, resumable writes.** Anything that touches many recipes can
  run twice, or stop anywhere, safely. See the rules in
  [Data model](data-model.md#schema-version).
- **Few dependencies.** Prefer the platform and a few lines of code over a
  new package.

## Tests

`pnpm test` runs everything that needs no Logseq. Bugs get a regression test
where one is practical.

### Live tests against a real Logseq

`test/live` runs the real repository, writers and conversion against a Logseq
DB graph. **Use a throwaway graph**: the tests create and delete a page, a few
recipes and some category pages.

The simplest way keeps your own Logseq and graphs untouched: start a
separate Logseq with its own home directory and a debugging port, create a
new DB graph in it, and load the plugin with **Plugins → Load unpacked
plugin** (after `pnpm build`).

```bash
HOME=/tmp/logseq-test logseq --user-data-dir=/tmp/logseq-test/data \
  --remote-debugging-port=9333
LOGSEQ_CDP_PORT=9333 NODE_OPTIONS=--experimental-websocket pnpm test:live
```

Every call then runs through the plugin SDK inside the loaded plugin, exactly
as the plugin makes it. (`NODE_OPTIONS` is only needed on Node 20.)

Alternatively, with Logseq's HTTP API server enabled, set
`LOGSEQ_API_TOKEN` (and `LOGSEQ_API_URL` if not the default). That route runs
outside the plugin, so the graph must already have the plugin's properties
(open the plugin once), and the category and tag checks are skipped.

## Changes

- Commit messages: `type: summary` (`feat`, `fix`, `docs`, `test`, `chore`),
  body explaining why.
- `CHANGELOG.md` lists user-visible changes only.
- `pnpm check` must pass. Before a release: `pnpm package`,
  `pnpm run package:verify`, and the live tests.
