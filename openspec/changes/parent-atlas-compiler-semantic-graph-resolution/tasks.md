# Tasks: Parent Atlas Compiler-Semantic Graph Resolution

## T0 — Capture (2026-08-29)

Created from a live root-cause investigation this session, triggered by
`plan-graphify-run-completion-v1.mjs` reporting `UNRESOLVED_STRUCTURAL_EDGES_PRESENT`
(10,506 unresolved / 1,334 resolved edges, 111-file bounded cohort). Root cause confirmed by
reading `plan-current-structural-edge-artifact-v2.mjs` and sampling
`docs/reports/current-structural-edge-artifact-plan-v2.json`'s `unresolvedEdges` array directly
(not assumed) — see `proposal.md` Problem section for the exact evidence.

Nothing implemented yet. Matches this repo's discipline for newly-scoped large-surface work:
capture-and-plan first, execute gate-by-gate with each gate's result reported before the next.

## CSGR-0 — `byNativeId` scope hypothesis — CLOSED, falsified (2026-08-29)

- [x] Hypothesis: `plan-current-structural-edge-artifact-v2.mjs`'s per-file-scoped `byNativeId` map
      was silently dropping resolvable cross-file matches.
- [x] Checked directly against `docs/reports/current-structural-edge-artifact-plan-v2.json`'s
      `unresolvedEdges` array (10,506 entries) before writing any code:
      `unresolved.filter(e => e.resolved === true).length === 0`. Every unresolved edge already
      carries `resolved: false` from the sidecar itself — there is no case where a wider-scoped map
      could have resolved something the current code missed.
- [x] Corrected breakdown recorded (by type: REFERENCES 5,292 / CALLS 4,438 / EXPORTS 468 /
      IMPORTS 308; by resolution: unresolved_target 9,730 / syntax_only 776) — supersedes this
      change's own earlier, inaccurate "10,038 unresolved IMPORTS" claim, which came from a
      whole-file grep that matched both resolved and unresolved edges.
- [x] No code change made. `byNativeId`'s per-file scope is left as-is — it is consistent with what
      the sidecar (single-file-per-call) can ever produce, not a bug.
- **Do not re-open this without re-running the check above against current data first.**

## CSGR-1 — Build the two-layer resolver — DONE, proven live (2026-08-29)

Rebuilt per design review after the initial monolithic-module draft: split transport
(`lsp-jsonrpc-client.mjs`) from Atlas-facing resolution (`compiler-semantic-resolver-v1.mjs`)
rather than one combined module, added persistent one-server-per-language reuse instead of
spawn-per-call, and added a real result-status enum instead of a boolean.

- [x] Read both `prove-typescript-lsp-readonly.mjs` and `prove-svelte-language-server-readonly.mjs`
      in full before extracting anything.
- [x] Built `scripts/atlas/lib/lsp-jsonrpc-client.mjs` — `spawnLspServer()` (Content-Length framing,
      `request`/`notify`, generic `initialize`/`didOpen`/`didClose`/`shutdown` convenience wrappers),
      `positionAt()` (kept for the needle-search use case), `byteOffsetToPosition()` (new — UTF-8
      byte offset → UTF-16 LSP position).
- [x] Built `scripts/atlas/lib/compiler-semantic-resolver-v1.mjs` — `createCompilerSemanticResolver({
      workspaceRoot })` returns `{ resolveDefinition(), dispose(), getOpenServerLanguages() }`; one
      server spawned per language, reused across calls; `resolveDefinition()` takes exact source
      bytes + byte offset, returns a `CompilerSemanticResolutionV1` receipt with status ∈
      `{RESOLVED_IN_REPO, AMBIGUOUS, UNRESOLVED, TIMEOUT, SERVER_ERROR, STALE_SOURCE}`.
      `classifyModuleSpecifier()` exported separately for CSGR-2's `EXTERNAL_MODULE`
      pre-classification (no LSP call needed for `node:*`/package.json dependencies).
- [x] Unicode fixture proof BEFORE any real source file: `scripts/atlas/prove-byte-offset-to-lsp-position-readonly.mjs`
      — ASCII, BMP multibyte (`é`), and surrogate-pair (emoji) cases. Result: `PROVEN_FIXTURE`, 4/4
      pass, including the astral-character case (verified live, not assumed —
      `node scripts/atlas/prove-byte-offset-to-lsp-position-readonly.mjs`).
- [x] Rewrote both `prove-*-readonly.mjs` scripts to call `resolveDefinition()` through the new
      resolver (not just the transport layer, so the full contract — sourceRevision binding,
      byte-offset math, persistent-server reuse — gets exercised, not only JSON-RPC framing).
- [x] Re-ran both live:
      - `prove-typescript-lsp-readonly.mjs` → `PROVEN_READ_ONLY`, `resultStatus: RESOLVED_IN_REPO`,
        1 target.
      - `prove-svelte-language-server-readonly.mjs` → `PROVEN_LIVE_READ_ONLY`,
        `resultStatus: RESOLVED_IN_REPO`, 1 target — passed without needing the original script's
        hardcoded 5-second settle wait (the persistent-server + `initialize()` await sequence was
        sufficient). One earlier run of the intermediate (pre-two-layer) version hit
        `LSP_TIMEOUT:textDocument/hover` under system load; re-run passed, and the pre-extraction
        original was independently re-run in place and also passed — confirmed load-based flakiness,
        not a regression, before concluding anything.
- [x] Did not delete the original two scripts — rewritten in place as thin resolver callers, per
      this repo's archive-not-delete convention; they remain the regression probes for this layer.
- **Not done in this pass**: `resolveDefinition()`'s `STALE_SOURCE` classification currently only
  fires on a byte-offset-out-of-range error, not on an actual live-file-vs-`sourceRevision` hash
  mismatch check — that's a real gap to close before CSGR-2 processes bulk corpus data where the
  file could have changed since the structural-edge plan was generated. Track as a CSGR-2
  prerequisite, not silently assumed solved.

## CSGR-2 — Wire resolver into planner by position, all edge types (111-file cohort) — IN PROGRESS, real signal obtained (2026-08-29)

**Built** `scripts/atlas/plan-current-structural-edge-resolution-v1.mjs`. Two real corrections made
along the way, recorded rather than smoothed over:

1. **First approach (node-join) was wrong.** Tried joining `unresolvedEdges[].fromEvidenceKey` to
   `nodes[].upstreamNodeId` to get a byte position. Checked live: joined only **10/200 (5%)** of a
   real sample — most referencing occurrences the sidecar tracks in edge evidence were never
   materialized as first-class `nodes[]` entries (declarations/functions/etc. are chunked; every
   individual reference site isn't). Verified by calling the 8095 sidecar directly on the same
   file and inspecting its raw response.
2. **The sidecar already returns a usable position directly on every edge** —
   `evidence_start_line`/`evidence_start_column` (confirmed live: 1-indexed, verified against real
   source — an edge citing `evidence_start_line: 23` for `scripts/atlas/append-dir-agents-llms.mjs`
   matched that file's actual line 23, `import fs from 'node:fs';`). `plan-current-structural-edge-artifact-v2.mjs`
   was discarding these fields entirely. Fixed: now preserves `evidenceStartLine`/`evidenceStartColumn`/
   `evidenceEndLine`/`evidenceEndColumn` (plus `sourceRevision`, also previously dropped) on every
   unresolved edge it writes. Re-ran the planner to regenerate
   `docs/reports/current-structural-edge-artifact-plan-v2.json` with the new fields.
3. Extended `compiler-semantic-resolver-v1.mjs`'s `resolveDefinition()` to accept a precomputed
   `position` (0-indexed LSP position) as an alternative to `byteOffset`, so this position-on-the-edge
   path doesn't need the byte-offset conversion machinery at all — converts the sidecar's 1-indexed
   line to LSP's 0-indexed line at the call site (`line: edge.evidenceStartLine - 1`).

**Live sample result** (`ATLAS_CSGR2_UNRESOLVED_TARGET_LIMIT=200`, workspace-biased — see gap below):

- `syntax_only` (776 total, classified in full, no LSP needed): `EXTERNAL_MODULE` 72,
  `REPO_RESOLVABLE` 46, `UNKNOWN_SPECIFIER` 658. **The 658 figure needs a caveat, not a fix in this
  pass**: many `syntax_only` edges are `REFERENCES`-typed and carry only a bare identifier or
  destructured binding list (`"fs"`, `"{ fileURLToPath }"`) as `toEvidenceKey` — there's no module
  specifier string *on that edge* to classify; the specifier lives on a sibling `IMPORTS`-typed edge
  for the same declaration. `UNKNOWN_SPECIFIER` is the honest answer for those, not a bug in
  `extractSpecifier()` — closing this gap needs a same-declaration join (via shared
  `fromEvidenceKey`/position), tracked as a follow-up, not attempted here.
- `unresolved_target` (9,730 total, sampled 200 in-workspace + 10 out-of-workspace): **148/200
  (74%) `RESOLVED_IN_REPO`**, 52 genuinely `UNRESOLVED`, 10 `OUTSIDE_RESOLVER_WORKSPACE_ROOT`
  (files under `scripts/atlas/` — outside the resolver's `sveltekit-frontend/` rootUri; a second
  resolver instance rooted at repo root would cover these, not built in this pass).
  `avgMsPerRequest: 5ms` (warm server/already-open files — a useful lower-bound estimate for
  CSGR-5, not a cold-run guarantee).
- **Sampling bias found and fixed mid-task**: `unresolvedTargetEdges` is grouped by source file in
  array order, and the first files alphabetically are all `scripts/atlas/*` — an unbiased
  `.slice(0, 200)` sampled **zero** in-workspace edges, twice in a row, before this was noticed and
  the sampling was changed to bias toward `sveltekit-frontend/` files.

**Remaining for this task** (not done):
- [ ] Join `syntax_only` `REFERENCES` edges back to their sibling `IMPORTS` edge to classify the
      658 `UNKNOWN_SPECIFIER` cases properly.
- [ ] Second resolver instance rooted at repo root, for `scripts/atlas/*`-style out-of-workspace
      source files.
- [ ] Investigate a sample of the 52 genuine `UNRESOLVED` cases — are they real gaps (e.g. dynamic
      property access) or another position/language-server nuance not yet understood?
- [x] Run against the full 9,730 `unresolved_target` set (not just a 200-edge sample) — done below.

## CSGR-2, full-corpus run (2026-08-29, later same day) — `ATLAS_CSGR2_UNRESOLVED_TARGET_LIMIT=0`

The 5ms/request warm-cache estimate above held at scale — full run took 6.7s for 8,244 real LSP
requests (**~1ms/request actual**, `sampleIsPartial: false`), not the ~49s estimate. Full,
non-sampled result — first time this corpus has a real breakdown instead of a flat
`unresolvedEdgeCount: 10506`:

| status | count | terminal? |
|---|---|---|
| `RESOLVED_IN_REPO` | 5,917 | yes |
| `EXTERNAL_MODULE` | 72 | yes |
| `UNRESOLVED` | 2,327 | **no — needs the investigation task above, still open** |
| `OUTSIDE_RESOLVER_WORKSPACE_ROOT` | 1,486 | no — tooling gap (second resolver root, still open) |
| `UNKNOWN_SPECIFIER` | 658 | no — tooling gap (sibling-IMPORTS join, still open) |
| `REPO_RESOLVABLE` | 46 | no — syntax-only, never actually LSP-confirmed |

**Terminal count right now: 5,989 / 10,506. Not-yet-terminally-classified: 4,517 / 10,506.**

### Terminology adopted (operator directive, 2026-08-29) — reframes this whole change's framing

"10,506 unresolved structural observations" is corrected to **"10,506 structural observations,
NOT YET TERMINALLY CLASSIFIED"**, because a successfully-completed Graphify run does not require
every edge to resolve to an internal symbol — a valid terminal outcome legitimately includes
external packages, Node builtins, unsupported languages, etc. The invariant that actually matters
is `unclassifiedCount == 0` (every observation reaches *some* deterministic terminal status),
**not** `resolvedInternal == totalObservations`. Conflating the two would incentivize inventing
graph edges for legitimate external imports — exactly what this correction prevents.

**Canonical terminal-status enum (frozen, operator-specified)**:
`RESOLVED_INTERNAL | RESOLVED_WORKSPACE_MODULE | EXTERNAL_PACKAGE | NODE_BUILTIN |
EXTERNAL_RESOURCE | UNSUPPORTED_LANGUAGE | SOURCE_MISSING | AMBIGUOUS | UNRESOLVED_ERROR`

**Reconciliation against what the script currently emits** (mapping, not yet implemented as a
code change — recorded so a future pass projects into this enum rather than reinventing it):

| current status | maps to | note |
|---|---|---|
| `RESOLVED_IN_REPO` | `RESOLVED_INTERNAL` | doesn't yet distinguish same-file/package (`RESOLVED_INTERNAL`) from a different workspace package (`RESOLVED_WORKSPACE_MODULE`) — both currently collapse to one bucket |
| `EXTERNAL_MODULE` | `EXTERNAL_PACKAGE` | doesn't yet split out Node builtins (`fs`, `path`, etc.) into `NODE_BUILTIN` — `classifyModuleSpecifier()` needs a builtin-module check added |
| `UNKNOWN_SPECIFIER` | *(none — not terminal)* | needs the sibling-IMPORTS join before it can resolve to any real terminal status |
| `OUTSIDE_RESOLVER_WORKSPACE_ROOT` | *(none — not terminal)* | needs the second resolver root before it can resolve to any real terminal status |
| `REPO_RESOLVABLE` | *(tentatively `RESOLVED_WORKSPACE_MODULE`, unconfirmed)* | syntax-only signal, never actually passed through the LSP resolver — should be fed through the resolver too, not treated as terminal on pattern-match alone |
| `UNRESOLVED` | `UNRESOLVED_ERROR` (tentative) or `AMBIGUOUS` | not yet split — the still-open "investigate the 52/2,327 UNRESOLVED cases" task should determine whether any of these are actually `AMBIGUOUS` (multiple candidate definitions) vs. genuine `UNRESOLVED_ERROR` |
| *(not yet produced)* | `EXTERNAL_RESOURCE` | no current code path classifies e.g. URL imports or asset references this way — gap, not started |
| *(not yet produced)* | `SOURCE_MISSING` | `SOURCE_FILE_NOT_FOUND` exists as an internal bucket but didn't fire in this run (0 occurrences) — rename target once the projection layer is built |

### Frozen gate contract (operator directive, 2026-08-29) — GRAPHIFY-COMPLETE-01

Recorded verbatim as the target shape for the next implementation pass (not built yet — this is
the frozen spec, CSGR-3/CSGR-4 territory):

```
GRAPHIFY-COMPLETE-01
  INPUT: workspaceRevision, sourceInventoryRevision, sourceInventoryChecksum,
         expectedSourceCount, expectedStructuralObservationCount,
         parserRevision, identityRevision, resolverRevision, completionPolicyRevision
  SOURCE COMPLETION: sourceCountExpected/Observed, checksums, missingSources=0,
         sourceRevisionMismatch=0, contentDigestMismatch=0
  NODE COMPLETION: nodeCount, checksums, duplicateNodeIdentity=0, invalidSourceBinding=0,
         revisionMismatch=0
  EDGE/OBSERVATION COMPLETION: observationCount, the 9-status terminal breakdown above,
         edgeChecksum, resolutionOutcomeChecksum, unclassifiedCount=0  ← the critical invariant
```

`GraphifyCompletionReceiptV1` (runId, workspaceRevision, sourceInventoryRevision, source/node/edge
counts + checksums, resolutionOutcomeChecksum, parser/identity/resolverRevision, started/completedAt,
`completionStatus: COMPLETE | COMPLETE_WITH_TERMINAL_EXTERNALS | BLOCKED`, receiptChecksum) is the
sole output of this gate. **Graph-revision admission (`GRAPH-REV-ADMIT-01` → `GraphSnapshotRevisionV1`
→ new `graphRevision`) is explicitly a separate, later gate — this pass does not combine the two.**
Until `GRAPHIFY-COMPLETE-01` reaches `unclassifiedCount == 0`, the following remain explicitly
blocked (operator directive, not to be silently worked around): new `graphRevision`, 128/768
promotion, candidate graph-feature refresh, PageRank consumer flip, cuGraph production promotion,
Qdrant graph-lineage promotion, ACE graph-signal promotion, ContextManifest promotion based on new
graph data. The already-proven `8098 → feature matrix → ACE → ContextManifest → Ornith → read-only
DAG` chain does not need to be rerun to generate activity — its next replay becomes useful only
once an admitted Graphify revision changes one of its actual upstream inputs.

**Current status labels (operator-specified framing, matches live evidence gathered this session)**:
`DOWNSTREAM_EXECUTION_CHAIN: PROVEN_BOUNDED` · `GRAPHIFY_SOURCE_BINDING: PROVEN_CURRENT_111` ·
`GRAPHIFY_COMPLETION_OWNER: BLOCKED` · `STRUCTURAL_RESOLUTION_CLOSURE: BLOCKED — 4,517/10,506 NOT
YET TERMINALLY CLASSIFIED (down from an unbroken 10,506 flat count as of this session's full-corpus
run)` · `GRAPH_REVISION_ADMISSION: BLOCKED` · `128/768 EXPANSION: BLOCKED`.

**Safe next work**: the three still-open tasks above (sibling-IMPORTS join for the 658
`UNKNOWN_SPECIFIER`, second resolver root for the 1,486 `OUTSIDE_RESOLVER_WORKSPACE_ROOT`,
investigate the 2,327 `UNRESOLVED`) are what actually shrinks `unclassifiedCount` toward zero — not
another retrieval/GPU tranche.

## CSGR-2, sibling-IMPORTS join — DONE (2026-08-29, same day) — two real bugs found, not one join problem

Implemented in `plan-current-structural-edge-resolution-v1.mjs`. Investigated the actual data
shape before writing code (per this change's own discipline) and found the original task
description above was wrong on the specifics, though right on the symptom:

- **Not** a `REFERENCES` ↔ `IMPORTS` cross-type join — `syntax_only` edges are only ever
  `IMPORTS` (308) or `EXPORTS` (468) typed; zero `REFERENCES`-typed syntax_only edges exist in
  this corpus. The earlier note guessing at "REFERENCES edges carrying a bare identifier" was an
  unverified assumption; the real shape is different.
- **Bug 1 (the larger one, 468 edges)**: every `EXPORTS`-typed edge was run through
  `extractSpecifier()` (looks for `from '...'`/`require(...)`) — live-checked: **0/468** have any
  such pattern, because an `EXPORTS` edge inherently declares a *local* symbol (`export function
  foo() {}`), not an external reference. There's no specifier to extract by construction. Applying
  the import-specifier classifier to a declaration edge was a category error. Fixed: `EXPORTS`
  edges get their own path — classified directly as `RESOLVED_INTERNAL` (matches the operator's
  frozen terminal enum), with a defensive `from '...'` check preserved in case a genuine re-export
  edge ever appears in a future corpus (none do in this one).
- **Bug 2 (the actual sibling-join, 154 edges)**: `IMPORTS`-typed edges come in same-declaration
  pairs sharing `fromEvidenceKey` — one edge's `toEvidenceKey` carries the full statement text
  (extractable), a sibling's carries just the bound identifier (`"fs"`, not extractable — the
  specifier isn't on that edge at all). Live-checked: exactly 154/308 IMPORTS-typed edges lack an
  extractable specifier, and 308 is even — consistent with "every import statement produces
  exactly 2 edges". Fixed: group `IMPORTS`-typed edges by `(fromEvidenceKey, sourceRef)`, propagate
  a resolved sibling's classification to the unresolvable one, tagged `siblingDerived: true`.

**Result, full corpus (776 syntax_only edges), before → after**:

| status | before | after |
|---|---|---|
| `EXTERNAL_MODULE` | 72 | 172 |
| `REPO_RESOLVABLE` | 46 | 75 |
| `RESOLVED_INTERNAL` *(new bucket)* | 0 | 468 |
| `UNKNOWN_SPECIFIER` | 658 | **61** |

129/154 sibling-derived IMPORTS resolved; the remaining 61 genuinely lack any resolvable sibling
in this dataset (likely dynamic `import(...)` calls or another pattern `extractSpecifier()`
doesn't cover — not investigated further this pass, a real but small remaining gap).

**Running total across both closure passes today**: terminal count moved from 5,989/10,506 to
**6,632/10,506** (172+75+468+5,917). Not-yet-terminally-classified moved from 4,517 to **3,874**
(61 `UNKNOWN_SPECIFIER` + 1,486 `OUTSIDE_RESOLVER_WORKSPACE_ROOT` + 2,327 `UNRESOLVED`).

**Still open, unchanged by this pass**: second resolver root for `OUTSIDE_RESOLVER_WORKSPACE_ROOT`
(1,486), investigate `UNRESOLVED` (2,327), and the small residual 61 `UNKNOWN_SPECIFIER` (not
pursued further — diminishing returns vs. the two larger open buckets).

## CSGR-2, second resolver root — DONE (2026-08-29, same day) — plus an OOM detour and a concurrent-writer discovery

Built the second LSP resolver root for `OUTSIDE_RESOLVER_WORKSPACE_ROOT` edges (`scripts/**`,
root `src/lib/**` — confirmed live to cover all 1,486 edges in that bucket). Two real
infrastructure bugs found and fixed before it worked, neither of which was a tsconfig/project
problem in the way first assumed:

1. **Binary path resolved from the wrong root.** `createCompilerSemanticResolver`'s
   `getServer()` resolved `node_modules/.bin/typescript-language-server.cmd` relative to
   `workspaceRoot` — fine when rooted at `sveltekit-frontend/` (which has its own
   `node_modules`), but repo root has no `node_modules/.bin` of its own. Live-tested: pointing
   `workspaceRoot` at repo root sent `initialize` to a nonexistent binary path; Windows'
   `useShellWrapper` spawns a shell around the missing command instead of failing fast, so the
   symptom was a 60s `LSP_TIMEOUT:initialize`, not a clear ENOENT. Fixed: added
   `serverBinaryRoot` (defaults to `workspaceRoot`, decoupled) plus an `existsSync()` check that
   fails loudly instead of silently hanging.
2. **No project scope for `scripts/**`.** Root `tsconfig.json` extends
   `sveltekit-frontend/tsconfig.json` without its own `include` — TS resolves an inherited
   `include` relative to the file that *defines* it, so the effective included set was still only
   `sveltekit-frontend/src/**/*`. Even after fixing (1), every resolution against a `scripts/atlas/*`
   file came back `UNRESOLVED` because the file was loose/out-of-project with no `@types/node`.
   Fixed: added `scripts/tsconfig.json` (new file, standalone, `allowJs`/`NodeNext`, no `$lib`
   aliasing needed — checked live, 0 matches).
3. **Server-instance dedup bug found while investigating a stalled full-corpus run**:
   `SERVER_CONFIG['typescript']` and `SERVER_CONFIG['javascript']` point at the identical
   `typescript-language-server` command/args, but `getServer()` cached by `language`, spawning
   two OS processes for one functional server per resolver instance. Confirmed live via
   `wmic process where "name='node.exe'"` during a hung run — 3 `typescript-language-server`
   child processes where at most 2 were needed. Fixed: cache by resolved `command` path instead;
   `languageId` now passed per-`didOpen()` call (from the caller's requested language) rather than
   baked into the cached server entry, since one shared process now serves both languages.
4. **OOM-hardening added alongside**: `spawnLspServer()` now injects
   `NODE_OPTIONS=--max-old-space-size=2048` (overridable) for every spawned LSP server — added
   after a live `Fatal process out of memory: Zone` crash during a full-corpus run. Separately,
   `.vscode/settings.json` got `typescript.tsserver.maxTsServerMemory: 8192` — note this only caps
   VS Code's *own* internal tsserver, not the CLI-spawned servers this resolver launches; both
   fixes were needed, they cover different processes.

**Concurrent-writer discovery mid-pass**: while (4) was being investigated, both this resolver
file and the CSGR-2 planner script were found to have changed on disk in ways not made by this
session (a `NODE_BUILTIN` classification path, `concurrency`/`dimensions`/`diagnosticSamples`
report fields) — a separate in-workspace Codex agent session had been working the same problem
concurrently and crashed mid-run (operator-confirmed; that crash's leftover ~3.9GB `node.exe`
process, later identified as VS Code's own tsserver via `wmic`, was a contributing but distinct
memory-pressure source from the actual OOM). Per explicit operator instruction, all work
(this session's + Codex's) was committed and pushed together to `origin/main`
(`50fe73f465`, `e8c187681e`) after a diff review found no secrets and no corrupted source files —
Codex's ~130 files were not individually reviewed line-by-line.

**Full-corpus result after all fixes** (`ATLAS_CSGR2_UNRESOLVED_TARGET_LIMIT=0`, completed cleanly
this time — no OOM, no stall):

| status | count |
|---|---|
| `RESOLVED_IN_REPO` | 5,334 |
| `NODE_BUILTIN` (unresolved_target) | 2,216 |
| `UNRESOLVED` | 2,176 |
| `TIMEOUT` | 4 |
| `RESOLVED_INTERNAL` (syntax_only) | 468 |
| `NODE_BUILTIN` (syntax_only) | 106 |
| `EXTERNAL_MODULE` | 81 |
| `REPO_RESOLVABLE` | 75 |
| `UNKNOWN_SPECIFIER` | 46 |

**Terminal (RESOLVED_IN_REPO + both NODE_BUILTIN + RESOLVED_INTERNAL + EXTERNAL_MODULE):
8,205/10,506 (78%)** — up from 6,632/10,506 (63%) at the start of this pass, driven almost
entirely by the `OUTSIDE_RESOLVER_WORKSPACE_ROOT` bucket (previously 1,486 entirely unclassified)
now resolving cleanly through the second resolver root. `NODE_BUILTIN` as a distinct terminal
status (not present in this session's earlier runs) matches the frozen 9-value enum exactly —
credit to the concurrent Codex work merged in.

**Still open**: `UNKNOWN_SPECIFIER` (46, down from 658 originally — diminishing-returns territory,
not pursued further), `TIMEOUT` (4, negligible), and the big one — **`UNRESOLVED` (2,176)** still
needs the characterization task from the first CSGR-2 patch: are these real gaps, or a resolver
nuance? This is now the single largest remaining not-yet-terminally-classified bucket and the
clear next step toward `unclassifiedCount == 0`.

**Not done this pass**: the terminology-alignment mapping from CSGR-2's actual output labels
(`RESOLVED_IN_REPO`, `EXTERNAL_MODULE`, `REPO_RESOLVABLE`) onto the frozen 9-value enum
(`RESOLVED_INTERNAL`/`RESOLVED_WORKSPACE_MODULE`/`EXTERNAL_PACKAGE`/etc.) recorded in the second
patch above is still just a mapping table, not implemented as a projection layer in the script.

## CSGR-2, UNRESOLVED investigation — CRITICAL finding, revises confidence in the 78% terminal figure (2026-08-29)

Set out to characterize the 2,176 `UNRESOLVED` cases per the still-open task from earlier in this
file. Found something bigger: **this is not primarily a per-edge resolution failure — it's an
upstream evidence-position precision problem affecting almost the entire `unresolved_target`
corpus, not just the `UNRESOLVED`-labeled subset.**

**Method**: sampled `diagnosticSamples` from the latest report, cross-referenced each against the
real source line at its exact `evidenceStartLine`/`evidenceStartColumn`. First case
(`toEvidenceKey: "path.join"`, `scripts/atlas/materialize-hidden-packet-pathmap-duckdb.mjs:30`,
col 6): the position lands on `REPORT_JSON` (`const REPORT_JSON = path.join(...)` — "const " is
exactly 6 characters), not on `path.join` at all. Checked 8 total samples: some landed correctly
on the actual call site, but 4 of the 8 — `rl.on`, `line.trim`, `rows.push`, `JSON.parse` — all
shared the **identical** position (`line 129, col 21`, landing on `(resolve, reject) =>`, the
start of a `new Promise((resolve, reject) => { ... })` executor) despite being 4 different,
unrelated calls inside that executor body.

**Quantified across the full corpus** (not just the sample):
```
totalEdges (unresolved_target):     9,730
totalDistinctPositions:             2,019
sharedPositions (>1 edge):          1,515
edgesInSharedPositions:             9,226  (94.8% of all unresolved_target edges)
edgesWithUniquePosition:              504  (5.2%)
```

**What this means**: for the 94.8% of edges sharing a position with siblings, the sidecar's
`evidence_start_line`/`evidence_start_column` marks the *enclosing scope's* start (a function
body, a block, an executor callback), not the individual call/reference's own leaf token. When a
shared-position `textDocument/definition` query resolves successfully, CSGR-2 stamps that SAME
result onto every sibling edge at that position — which may be correct for zero, one, or several
of them, not verified per-edge. This is not a CSGR-2 bug to fix in this script; it's a
characteristic of the upstream evidence source (the 8095 sidecar / `plan-current-structural-edge-artifact-v2.mjs`'s
input) that this script has been silently trusting as leaf-precise.

**Revises the "8,205/10,506 (78%) terminal" figure from the prior pass**: that count is real in
the sense that *something* resolved at each position, but per-edge correctness for the ~9,226
shared-position edges (out of 10,506 total corpus edges, syntax_only + unresolved_target combined)
is **not independently verified**. Only the 504 uniquely-positioned edges plus the fully-classified
`syntax_only` set (776, all individually positioned per-edge — not affected by this issue, since
`syntax_only` classification never queries a position at all) have real per-edge confidence.

**This is now the actual blocker, bigger than the original `UNRESOLVED` investigation task it grew
out of.** Two possible paths forward, neither attempted this pass:
1. **Fix the evidence source** — the AST sidecar/`plan-current-structural-edge-artifact-v2.mjs`
   needs to emit a genuine leaf-token position per edge (the specific call/reference site), not an
   enclosing-scope marker, for `CALLS`/`REFERENCES` edges. Out of scope for this OpenSpec change
   (would touch the sidecar's own extraction logic, not this repo's compiler-semantic-resolver
   layer) — flag for whoever owns that extractor.
2. **Add a confidence tier to CSGR-2's own output** — tag each edge's result as
   `POSITION_UNIQUE` vs `POSITION_SHARED_WITH_N_SIBLINGS`, so downstream consumers (the
   `GRAPHIFY-COMPLETE-01` gate, any future graph promotion) can distinguish verified-per-edge
   resolutions from "resolved at a shared marker, applies to N edges, individually unverified."
   **DONE this same pass** — see below.

### Position-confidence tagging — DONE (2026-08-29, same day)

Implemented option 2 above directly in `plan-current-structural-edge-resolution-v1.mjs`:
`positionConfidenceFor(edge)` precomputes a sibling-count map over the full `unresolvedTargetEdges`
set (not just the sampled subset) and tags every result `POSITION_UNIQUE` or
`POSITION_SHARED_WITH_N_SIBLINGS`. Report now also carries `positionConfidenceCounts`,
`uniquePositionResolvedCount`, `sharedPositionResolvedCount`.

**Full-corpus result, quantified precisely**:
- Of the 7,550 "resolved" results (`NODE_BUILTIN` 2,216 + `RESOLVED_IN_REPO` 5,334 in
  `unresolved_target`): **only 330 (4.4%) are individually verified** (`POSITION_UNIQUE`).
  **7,220 (95.6%) are copied from a shared position** — not independently confirmed per edge.
- Sibling fan-out ranges up to `POSITION_SHARED_WITH_94_SIBLINGS` (95 distinct edges collapsed
  onto one query) — a small number of enclosing scopes (large functions, big object literals)
  account for a disproportionate share of the corpus.
- This does not change any edge's reported status — it makes the confidence gap visible instead
  of silently claiming per-edge verification the current methodology doesn't actually have.

**Net effect on the `unclassifiedCount == 0` target**: the honest terminal-and-verified count is
much smaller than the raw 8,205/10,506 figure — 330 (unique unresolved_target resolutions) + 776
(syntax_only, unaffected by this issue) = **1,106/10,506 individually verified**. The remaining
~9,400 either need the upstream sidecar to emit leaf-precise positions (real fix), or an explicit,
documented policy decision that "resolved via a shared enclosing-scope position" is an acceptable
lower-confidence terminal status for this gate (a policy call, not a technical one — not made
here).

## CSGR-3 scoping — upstream root cause traced to the 8095 sidecar's `add_edge()`, fix path identified (2026-08-29, same day)

Traced `evidence_start_line`/`evidence_start_column` back through the actual producer, not
assumed. `plan-current-structural-edge-artifact-v2.mjs` is a pure pass-through — it POSTs to
`http://127.0.0.1:8095/ast/chunk` and forwards whatever the sidecar returns. The real producer is
`python/miniforge_nlp_sidecar_v2.py`.

**Exact mechanism** (`add_edge()`, lines ~589-628): for every string in a chunk's `chunk.calls`,
`chunk.imports`, `chunk.exports`, and per-chunk `dependencies` list, it constructs one
`AstEvidenceEdge` — and every one of those edges gets `evidence_start_line=chunk.start_line`,
`evidence_start_column=chunk.start_column` (the **chunk's own boundary**, not the specific
occurrence's position). This is not a bug in this file's logic — it's a direct consequence of the
data it has available: `chunk.calls`/`imports`/`exports`/`dependencies` are flat **name-string
lists** attached to the chunk by the upstream `treesitter-chunker` package
(confirmed via `pip show`: external MIT package, `github.com/ViperJuice/treesitter-chunker`,
v4.0.0, "Semantic code chunker using Tree-sitter for intelligent code analysis") — that package's
own data model has no per-occurrence position for an individual call/reference within a chunk. It
is a RAG-style semantic chunker, not a reference-resolution tool; this mismatch, not a defect in
either component, is the actual root cause.

**Fix path identified, not yet built** — two options, one clearly better:

- **Option A (recommended)**: `tree_sitter` and `tree-sitter-language-pack` are already direct
  dependencies in this same Python environment (visible in the same `pip show` output) — nothing
  new to install. Add a local occurrence-position pass: for each chunk, re-parse that chunk's own
  source span (`chunk.start_byte:chunk.end_byte`, both already available) with the raw
  `tree_sitter` bindings, walk the resulting AST to find the actual byte/line/column of each
  call-expression/reference/import-name occurrence matching the strings already present in
  `chunk.calls`/`imports`/`exports`/`dependencies`, and attach that per-occurrence position to
  each edge instead of the chunk-level one. Natural home: `atlas_structural_provenance.py`
  (already documented as "intentionally side-effect free" — the existing convention for this kind
  of pure logic in this service) or a new sibling module, called from `add_edge()`'s call sites.
  Self-contained — no external package changes, no new dependencies.
- **Option B (not recommended)**: fork/patch the external `treesitter-chunker` package itself to
  expose occurrence-level positions. Bigger surface, external-dependency risk, slower to land, and
  Option A achieves the same result without it.

**Real design questions Option A needs to answer before implementation** (not resolved here —
flagged so the next pass doesn't skip them):
- **Ambiguous name matching**: if a chunk's source contains the same call name multiple times
  (e.g. `path.join` called 5 times in one function, matching the earlier `materialize-hidden-packet-pathmap-duckdb.mjs`
  example), a name-string match against re-parsed AST nodes will find multiple candidate
  occurrences for one `chunk.calls` entry — need a policy for whether that becomes N separate
  edges (one per real occurrence — the architecturally correct answer, matches "one edge per
  reference" that this whole change already assumes) or stays one edge with an ambiguous/first-match
  position (a weaker interim step).
- **Re-parse cost**: doing a second tree-sitter parse per chunk (on top of whatever
  `treesitter-chunker` already did) adds real CPU cost to the `/ast/chunk` endpoint — needs a
  timing measurement before assuming this is free, especially for large/hot files re-processed
  often.
- **Whether this becomes N edges instead of 1** changes `plan-current-structural-edge-artifact-v2.mjs`'s
  and CSGR-2's own edge-count assumptions (`unresolvedEdgeCount`, `edgeSetChecksum`, etc.) — this
  would not be purely additive at the sidecar layer; every consumer of `/ast/chunk`'s edge shape
  needs to be identified before changing the cardinality (audit-before-build, per this repo's
  standing rule) — not done this pass.

**Recommendation**: do not implement Option A blind in the next session — first audit who else
calls `/ast/chunk` and consumes its `edges` array (beyond this OpenSpec change's own scripts), so
a cardinality change here doesn't silently break an unrelated consumer.

**First pass at that audit, done this session**: 41 files under `scripts/` reference `8095` or
`/ast/chunk`, but most are health/capability probes, not edge-shape consumers. Intersecting with
files that also reference `.edges` narrows the real candidate list to 5:
`plan-current-structural-edge-artifact-v1.mjs`, `plan-current-structural-edge-artifact-v2.mjs`
(this change's own input producer), `audit-treesitter-structural-observation-v1.mjs`,
`prove-ast-sidecar.mjs`, `build-emb1-semantic-card-corpus.mjs`. **Not independently verified which
of these actually depend on today's chunk-level-position/one-edge-per-name-string shape** vs.
would tolerate or benefit from a switch to per-occurrence positions/cardinality — that's real
implementation-prep work for whoever picks up Option A, not resolved here. The other ~36 files in
the broader 8095/`/ast/chunk` grep either don't touch `.edges` at all or reference an unrelated
`.edges` field from a different data source (e.g. Neo4j graph exports) — a generic `.edges` grep
is too noisy to trust without per-file confirmation, which this pass didn't have budget for.

## CSGR-3, Option A core — `find_occurrence_positions()` built and proven, NOT wired into the live sidecar (2026-08-29, same day)

Built the pure occurrence-finder from Option A above: `find_occurrence_positions(source_text,
language, names)` in `python/atlas_structural_provenance.py`, matching this module's existing
side-effect-free convention. Re-parses a chunk's own source slice with
`tree_sitter_language_pack.get_parser()` (already a direct dependency — nothing new installed),
walks the tree for `call_expression`/`call` nodes (matching dotted callee text like `"path.join"`
against the name list) and bare `identifier`/`property_identifier` nodes (for
imports/exports/references), and returns every real occurrence position per name — not just the
first, resolving the ambiguous-match question from the prior patch: **every real occurrence
becomes its own position**, the caller decides whether that means N edges or a representative one.

**Proven against the exact real cases that exhibited the live bug**, not synthetic fixtures — the
Promise-executor chunk (`rl.on`/`line.trim`/`rows.push`/`JSON.parse` previously all sharing one
position) and the `path.join`-called-3× case. Added as durable regression tests in
`python/test_atlas_structural_provenance.py` (4 new tests). Full suite: **7/7 pass**
(`python -m pytest test_atlas_structural_provenance.py -v`), including the 3 pre-existing tests
for this module — no regression.

**Deliberately stopped here — not wired into `miniforge_nlp_sidecar_v2.py`'s live `/ast/chunk`
endpoint.** Per the prior patch's own recommendation ("do not implement Option A blind"), the
open questions that actually gate a live-service change are still open: whether any of the 5
candidate consumers depend on today's cardinality, and the re-parse CPU cost on a hot endpoint —
neither measured. This function is a proven, independently-testable building block; wiring it in
is a separate, deliberate next step once those two questions are answered, not a natural
continuation to take casually.

**Do not report `unclassifiedCount == 0` or promote this corpus as `COMPLETE` based on the current
terminal counts** — the completion gate's own invariant (every observation gets a *deterministic,
individually-verified* terminal status) is not actually satisfied for 94.8% of `unresolved_target`
edges yet, even though they carry a non-`UNRESOLVED` status string today.

**Replay-bound hardening (2026-08-29):** the read-only resolver plan now uses bounded worker
concurrency (`ATLAS_CSGR2_CONCURRENCY`, default 4, maximum 8) and a bounded per-request timeout
(`ATLAS_CSGR2_TIMEOUT_MS`, default 5,000ms). A 210-observation replay completed with 148
`RESOLVED_IN_REPO`, 58 `UNRESOLVED`, and 4 `TIMEOUT`; no outside-root results or edges were
admitted. Timeout outcomes remain nonterminal until separately investigated.

The replay receipt now also preserves bounded diagnostic samples and a status/language/edge-type
dimension histogram, so `UNRESOLVED` and `TIMEOUT` can be separated into null-result, server,
position, and language-specific follow-up classes without retrying the entire corpus blindly.

**Targeted timeout replay (2026-08-29):** added
`scripts/atlas/prove-structural-edge-target-replay-v1.mjs`. The concrete `path.join` timeout in
`sveltekit-frontend/scripts/atlas/codebase-ingester-unified.mjs` resolves as `RESOLVED_IN_REPO`
when replayed alone with the exact source bytes, recorded source revision, workspace revision,
and a 15,000ms bound. This is diagnostic evidence that separates bounded LSP contention from
semantic absence; it does not admit an edge, create a graph revision, or perform any durable write.
Receipt: `docs/reports/structural-edge-target-replay-v1.json`.

**Longer bounded replay (2026-08-29):** a 60-observation read-only slice at concurrency 2 and a
15,000ms per-request bound produced 16 `RESOLVED_IN_REPO` results and 44 `NODE_BUILTIN` terminal
classifications, with zero sampled `TIMEOUT` results. This supports treating the earlier timeout
cluster as contention-sensitive diagnostic behavior, not proof of missing symbols. The full
9,730-observation unresolved-target population remains open and no graph-edge admission is
authorized. Receipt: `docs/reports/current-structural-edge-resolution-v1.json`.

**Builtin-reference hardening (2026-08-29):** before LSP, the read-only plan now recognizes a
reference as `NODE_BUILTIN` only when the same source explicitly imports or requires the matching
Node builtin. A 20-observation diagnostic slice classified 17 such references without LSP, leaving
1 timeout and 2 repository resolutions. Non-imported names continue through LSP and remain
non-admissible when unresolved.

**Follow-up classification update (2026-08-29):** `classifyModuleSpecifier()` now uses Node's
builtin module set and emits `NODE_BUILTIN`, and recognizes URL/data/file imports as
`EXTERNAL_RESOURCE`. The live syntax-only census now reports `NODE_BUILTIN: 106`,
`EXTERNAL_MODULE: 81`, `RESOLVED_INTERNAL: 468`, `REPO_RESOLVABLE: 75`, and
`UNKNOWN_SPECIFIER: 46`. This improves terminal classification but does not resolve the
remaining sibling/tooling gaps or authorize graph edges.

## CSGR-2 (original scope description, superseded above by the real build)

- [ ] Resolve edge-type-agnostically: the LSP `textDocument/definition` request only needs a byte
      position from the edge's source evidence, not a `CALLS`/`REFERENCES`/`IMPORTS` label.
      Prioritize by volume — `REFERENCES` (5,292) and `CALLS` (4,438) are ~92% of the unresolved
      set; do not spend the first implementation pass on `IMPORTS` (308) alone.
- [ ] For `syntax_only`-resolution edges specifically (776, mostly import statements): call
      CSGR-1's `classifyModuleSpecifier()` from `compiler-semantic-resolver-v1.mjs` before
      attempting any LSP call — a `node:*`/package.json-dependency specifier is
      `EXTERNAL_MODULE`, a correct terminal state, not a gap.
- [ ] For `unresolved_target`-resolution edges (9,730): use one `createCompilerSemanticResolver()`
      instance for the whole 111-file run (not one per edge, not one per file) and call
      `resolveDefinition()` at the edge's source byte offset to check for a same-repo declaration
      site. Confirm via `getOpenServerLanguages()` / a request counter that only 1-2 server
      processes exist for the whole run, not hundreds.
- [ ] First close CSGR-1's open `STALE_SOURCE` gap (real hash-vs-live-file check, not just
      byte-offset-range validation) before trusting bulk results at this volume.
- [ ] Emit `resolveDefinition()`'s real status values directly (`RESOLVED_IN_REPO`,
      `EXTERNAL_MODULE`, `AMBIGUOUS`, `UNRESOLVED`, `TIMEOUT`, `SERVER_ERROR`, `STALE_SOURCE`) —
      do not collapse them into a coarser three-bucket summary at this layer; summarize only in
      the final report if needed.
- [ ] Re-run on the same 111-file cohort the CSGR-0 count was measured against. Record all status
      counts.
- [ ] Do not scale to the full corpus in this task — see CSGR-5. Before even considering it,
      measure per-`resolveDefinition()`-call latency from this bounded run (CSGR-5 depends on this
      number, not a guess).

## CSGR-3 — Derive `CompilerSemanticGraphRevisionV1`

- [x] Build the full `CompilerSemanticGraphRevisionInputV1` per proposal.md's strengthened
      contract — not just the resolution tuples, but `projectConfiguration` (tsconfig/svelte-config/
      package.json/lockfile/project-reference checksums) and `runtime` (typescript/
      typescript-language-server/svelte-language-server/resolverRevision versions). A revision that
      only hashes `(sourceRef, sourceRevision, symbolPosition, resolvedTarget*)` is insufficient —
      a `tsconfig.json` `paths`/`moduleResolution` change can alter what the same source bytes
      resolve to, and the revision must reflect that.
- [x] Sort `resolutions[]` deterministically before hashing (matches this repo's existing pattern in
      `plan-current-structural-edge-artifact-v2.mjs`'s `canonicalNodes`/`canonicalEdges` sort-then-hash
      approach).
- [x] Confirm this revision is independent of `astGraphRevision` — changing only the treesitter
      parse (not LSP resolution output or project config) must not change
      `CompilerSemanticGraphRevisionV1`, and vice versa. Write a focused test proving this
      independence with fixture inputs that differ in exactly one dimension each.
- [x] Write a focused test proving the inverse: identical source bytes + a changed
      `tsconfigChecksum` DOES change `CompilerSemanticGraphRevisionV1`, even if no resolution tuple
      changed. This is the specific failure mode the strengthened contract exists to prevent —
      test it directly, don't just assert the contract shape exists.

The pure contract is implemented in `packages/parent-atlas/src/core/compiler-semantic-graph-revision-v1.ts`
with three focused tests. This closes the derivation/independence contract only; binding it to a
completed authoritative Graphify run and live resolution rows remains a separate admission gate.

## CSGR-4 — Feed into the completion-plan blocker check

- [x] Update `scripts/atlas/plan-graphify-run-completion-v1.mjs`'s structural check to consume the
      resolver receipt when it is complete, count only nonterminal outcomes as blockers, and keep
      bounded/partial receipts fail-closed. External modules and Node builtins do not count as
      unresolved structural outcomes.
- [x] Re-run the completion plan. The current partial receipt correctly leaves the plan blocked by
      `CANONICAL_GRAPHIFY_RUN_NOT_COMPLETED` and `STRUCTURAL_RESOLUTION_RECEIPT_INCOMPLETE`; no
      graph revision or edge admission is allowed. See
      `docs/reports/graphify-run-completion-plan-v1.json`.

## CSGR-5 — Full-corpus scaling (follow-up, not started)

- [ ] Explicitly out of scope for this proposal's first pass. Track separately once CSGR-0–4 are
      proven on the bounded cohort. Do not attempt to run CSGR-2's resolver against the full
      24,465-source corpus without first estimating LSP request volume/latency at that scale — a
      per-edge `textDocument/definition` call over stdio JSON-RPC has real per-call overhead that
      hasn't been measured yet.

## Cross-references

- `docs/parent-atlas-workstation-todo.md` — "Safe execution order," "compiler-semantic/LSP lane"
  status line (`PROVEN_FIXTURE_AND_LIVE_READ_ONLY`), "Independent graph revision domains" section.
- `scripts/atlas/plan-graphify-run-completion-v1.mjs` — the blocker this proposal clears.
- `scripts/atlas/plan-current-structural-edge-artifact-v2.mjs` — CSGR-0/CSGR-2's edit target.
- `openspec/changes/parent-atlas-graph-runtime-enhancement/` — downstream consumer of
  `CompositeGraphProjectionV1`, not directly blocking or blocked by this proposal.
