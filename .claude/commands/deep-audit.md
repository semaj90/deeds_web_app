# Deep Audit — 20+ Gate Codebase Health Sweep

You are running a comprehensive codebase audit using the **47-gate audit system** documented in `CLAUDE.md` (G1–G55) plus the **17-gate backend infrastructure audit** (`BACKEND_INFRASTRUCTURE_AUDIT.md`). Your output is a prioritised remediation plan, not a wall of grep dumps.

## Constructor inputs (positional)

`/deep-audit [scope] [gates] [mode]`

| Slot | Default | Values | Meaning |
|------|---------|--------|---------|
| `scope` | `all` | `all` · `<dir-path>` · `<file-path>` · `route:<api-path>` · `cluster:<id>` · `som:<row>:<col>` | What to audit |
| `gates` | `code` | `code` (G1-G26) · `data` (G10-G12) · `infra` (G27-G47) · `tier-h` (G48-G55) · `all` | Which gate suite |
| `mode` | `report` | `report` · `fix` · `dry-fix` · `wire` (link to existing repair tools) | Output mode |

`$ARGUMENTS` is the raw arg string. Parse it; if blank, run `all code report`.

### Scope resolution

- `all` → audit the entire `sveltekit-frontend/src/` tree using `docs/graph/codebase-graph.json` as the file inventory.
- `<dir-path>` → only audit files under that path (e.g. `src/routes/api/ace`).
- `<file-path>` → audit a single file plus its 1-hop neighbors from the graph.
- `route:<path>` → resolve to the matching `+server.ts` (e.g. `route:/api/ace/agent` → `src/routes/api/ace/agent/+server.ts`).
- `cluster:<id>` → load files from `clusterIds:<id>` in the graph (GPU k-means cluster).
- `som:<r>:<c>` → load files at SOM grid position `(r, c)` from Qdrant `codebase_chunks_768` payload.

For SOM/cluster scopes, query Redis `code:index:gate-stats` and the graph JSON `files[].clusterId` / `files[].somBmuRow,Col` (when present).

## Pre-flight: load the index

Before running gates, **always load the cached index** (do NOT re-scan):

```bash
test -f sveltekit-frontend/docs/graph/codebase-graph.json || \
  (cd sveltekit-frontend && npm run index:codebase:fast)
```

The graph JSON has every per-file flag the gates need:
`hasAuth`, `hasZod`, `parsesBody`, `routeHandlers`, `ssrUnsafe`, `sv4Legacy`, `localhostRefs`, `hasPairedTest`, `drizzleRefs`, `dynImports`, `clusterId`, `somBmuRow`, `somBmuCol`.

If the JSON is older than 24h, prompt the user to regenerate (`npm run graphify:daily`) before continuing.

## Gate selection

Read **CLAUDE.md** for the complete gate definitions. Below is the dispatch table — invoke each gate by reading the JSON, NOT by re-grepping.

### Tier code (G1–G26) — code connectivity + Svelte 5 + tests
Read flags directly from `graph.files[]`:
- **G1** static imports → `f.imports`
- **G2** dynamic imports → `f.dynImports`
- **G3** barrel re-exports → `f.reExports`
- **G4** auth on API routes → `f.hasAuth === false && f.isRoute && f.routeHandlers.length`
- **G5** Zod on body-parsing → `f.hasZod === false && f.parsesBody`
- **G6** route handlers → `f.routeHandlers`
- **G7** Drizzle refs → `f.drizzleRefs`
- **G8** TODOs → `f.todos`
- **G14** Svelte 4 patterns → `f.sv4Legacy === true`
- **G15** SSR-unsafe → `f.ssrUnsafe === true`
- **G16** test pairing → `f.isRoute && !f.hasPairedTest`
- **G20** cyclic imports → `graph.gateStats.cyclicPairCount`
- **G21–G25** rune compliance → `f.sv4Props`, `f.sv4Reactive`, `f.sv4Events`, `f.sv4Dispatch`, `f.runeInTs`
- **G26** test-file shape → `find tests/routes -name '*.test.ts' | xargs grep -L '@vitest-environment node'`

### Tier data (G10–G12) — DB + vector
- **G10** schema refs → `f.drizzleRefs`
- **G11** localhost refs → `f.localhostRefs.length > 0`
- **G12** vector / Qdrant coupling → grep for `collection.*${name}`

### Tier infra (G27–G47) — pytorch-graph, glyph/cartridge, ACE
Run the Bash gates from CLAUDE.md verbatim. These need filesystem checks (e.g., does `som-topology/+server.ts` exist), not just graph reads.

### Tier H (G48–G55) — search analytics + ACE feedback
Same — run the bash gates from CLAUDE.md.

## Output format (mode=report)

Print a **single concise table** plus an action list. Do NOT dump the full file lists unless the user asks; cap each gate's bullet to top 5 with `(+N more)` suffix.

```
## Deep Audit — scope: src/lib/server/ace, gates: code

| Gate | Status | Failures |
|------|--------|----------|
| G1   | ✓      | n/a |
| G4   | ⚠️     | 1: `ace-internal/+server.ts` missing locals.user |
| G5   | ✓      | 0 |
| G15  | ✓      | 0 (server-only, exempt) |
| G16  | ⚠️     | 7 routes lack paired tests (run `audit:test-stubs`) |
| G20  | ✓      | 0 |

### Top remediation (priority order)
1. **G4 fix** — add auth to `ace-internal/+server.ts` (1 line, low risk)
2. **G16 fill** — generate test stubs: `npm run audit:test-stubs --filter ace`
3. _(no other gates fail)_

### Recap
- Files audited: 47
- Gates run: 23 (Tier code)
- Hard fails: 0  ·  Warnings: 8  ·  Pass: 15
- Estimated fix time: 15 min
```

## Output format (mode=fix or dry-fix)

For each fail, propose the **smallest possible fix** as a unified diff. In `fix` mode, apply via the Edit tool. In `dry-fix`, only print the diff.

Match the canonical patterns:
- **G4 fix**: prepend `if (!locals.user) return json({...empty defaults..., error: 'Unauthorized'}, {status:401});`
- **G5 fix**: import `z`, define schema, replace bare `request.json()` with `safeParse`
- **G11 fix**: replace `'http://localhost:N'` with `ENV.SERVICE_URL ?? 'http://localhost:N'`
- **G15 fix**: wrap in `if (typeof window !== 'undefined')` or move into `$effect`/`onMount`
- **G16 fix**: run `npm run audit:test-stubs` (don't write tests by hand)

## Output format (mode=wire)

Don't fix — just emit a **next-action checklist** referencing existing repair tools:

```
G4 (1 fail)  → fix manually (single route)
G16 (7 fail) → npm run audit:test-stubs --filter ace
G15 (0)      → no action
```

## Constructor mapping (data sources)

```
[scope]    →  filter graph.files[] by rel-prefix or clusterId/somBmu
[gates]    →  select which g*() function to run from CLAUDE.md gate suite
[mode]     →  report | fix | dry-fix | wire
graph      →  sveltekit-frontend/docs/graph/codebase-graph.json
KAG        →  Redis wiki:note:dir:* (per-directory context, AGENTS.md source)
gateStats  →  Redis code:index:gate-stats (last full audit summary)
agents.md  →  walk up from any failure file to find nearest AGENTS.md, append its
              "Patterns / Warnings" sections to the remediation context
```

## Critical: don't re-scan, read the cache

The **whole point** of this skill is to use the GPU codebase index as the authoritative source. If you find yourself running `grep -r` for things that are already in `f.imports` / `f.routeHandlers` / `f.localhostRefs`, **stop and read the JSON instead**. The index is regenerated by `npm run index:codebase:fast` (cold ~14s, warm ~11s with Redis cache hit).

## Examples

```
/deep-audit                                      # all + code + report
/deep-audit src/lib/server/ace code report      # scoped, code gates, table
/deep-audit src/routes/api code fix             # apply auth fixes to API routes
/deep-audit cluster:7 all wire                  # gate failures in cluster 7, list tools
/deep-audit som:3:5 code report                 # files at SOM grid (3,5)
/deep-audit route:/api/ace/agent all report     # one specific route, all gates
```

## When to re-run

- After `git pull` (graph may be stale)
- Before opening a PR (clean audit = green CI)
- After running `agents:write` (per-directory AGENTS.md may have updated warnings)
- Daily as part of `graphify:daily`
