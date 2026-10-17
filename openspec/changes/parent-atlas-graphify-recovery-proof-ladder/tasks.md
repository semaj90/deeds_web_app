# Tasks — Graphify Recovery Proof Ladder (18-phase source spec, reformatted for readability)

Source: operator dictation, captured verbatim-in-substance this session, reformatted from a
punctuation-stripped transcript into phase headers/lists. Nothing in the *requirements* was
changed — only whitespace/structure. Phase 1 is done (see `proposal.md`); everything else below
is the unstarted plan.

## Objective

Recover the stale Graphify pipeline without a blind all-green full run. Repo root:
`C:\Users\james\Videos\deeds-web-app`. Primary app: `sveltekit-frontend`.

Implement and prove, in order: Graphify coordinator lock → feature-envelope dry run → feature-
envelope concurrency proof → feature-envelope bounded apply → latent-backfill memory diagnostic
→ bounded resumable latent backfill → downstream Graphify stages → artifact publication →
Parent Atlas Studio lane-gate update.

Must distinguish (never collapse into one status): service reachable / code callable / stage
executed / rows written / output replayed deterministically / downstream artifact published /
end-to-end proof completed.

**Status vocabulary (use only these)**: `PASS` · `PROVEN` · `PARTIAL_PROVEN` · `NOT_PROVEN` ·
`CONTRADICTED` · `BLOCKED` · `FAIL` · `RUNNING` · `STALE` · `SKIPPED_WITH_REASON`.

## Starting evidence (captured baseline, not live current truth)

historical baseline `GRAPHIFY_DAILY: FAIL` · `GRAPH_ARTIFACT_CURRENT: FALSE` · `FEATURE_MAP_CURRENT: FALSE` ·
`CONCURRENT_ATLAS_PACKETS_WRITERS: PROVEN` · `DUPLICATE_FEATURE_ENVELOPE_INVOCATION: NOT_PROVEN`
· `FEATURE_ENVELOPE_LOCK_PATCH: IMPLEMENTED_NOT_PROVEN` ·
`LATENT_BACKFILL_MEMORY_SAFE: FAIL_OR_NOT_PROVEN` · `LATENT_BACKFILL_RESUMABLE: NOT_PROVEN` ·
`RAPIDS_ENVIRONMENT: BLOCKED` · `CUVS_PARITY: NOT_RUN` · historical `GRAPH_SNAPSHOT: BLOCKED` ·
`PAGERANK: BLOCKED` · `KMEANS: BLOCKED` · `SOM_20X20: BLOCKED`.

**Do NOT this slice**: install RAPIDS/cuVS/Miniforge/CUDA/GPU deps; modify PageRank/KMeans/SOM/
Neo4j GDS/Qdrant production collections/graph identity contracts.

## Safety & concurrency rules

- Before editing: `git status`, `git diff --name-only`
- For every already-modified file in the worktree: record SHA-256 + mtime, recheck immediately
  before writing, skip/abort that edit if it changed concurrently — never overwrite unrelated
  work
- Never run `graphify:daily` in the background; a detached launcher returning exit 0 is not
  completion
- Never kill unknown Node/Python/Postgres/Docker/Kafka/GPU processes
- Never change DB constraints to make Graphify pass

## Phase 1 — Inventory the real execution chain — DONE this session

Find real scripts/commands for: graphify daily, daily graphify coordinator, materialize feature
envelopes, latent vector backfill, feature map generation, graph artifact publication, Karpathy
map generation, KAG notes generation, D9 orphan audit, Tier H analytics.

Target shape (not fully populated — Phase 1 in `proposal.md` covers the daily-chain order;
per-stage `reads`/`writes`/`externalServices`/`supportsDryRun`/`supportsResume`/
`supportsLimit`/`supportsCheckpoint` fields were not individually filled in for every stage):

```ts
interface GraphifyStageInventory {
  stageId: string; command: string; sourceFile: string; order: number;
  reads: string[]; writes: string[]; externalServices: string[];
  supportsDryRun: boolean; supportsResume: boolean; supportsLimit: boolean;
  supportsCheckpoint: boolean; currentStatus: ProofStatus;
}
```

Do not edit until the real stage order and write surfaces are known — this held; no write-stage
code was touched this pass.

## Phase 2 — Executable proof-ladder entry point — PASS

`scripts/validate-parent-atlas-integration-proof.mjs` already exists (901 lines) with a
compatible `gateHandlers`/dependency-graph/JSON+MD-report architecture, but implements a
*different* gate set (env/identity/okf/classification/semantic/ann/clustering/graph/ace/mcp).
Extending it with the gates below is the likely right move — not yet confirmed with the
operator, now wired in this workspace, but not yet runtime-proven end to end.

Required CLI shape: `node scripts/validate-parent-atlas-integration-proof.mjs gate <name>` for
`graphify_lock` / `feature_envelope` / `latent_diagnostic` / `latent_bounded` / `graph_artifact`
/ `studio`, plus `... json` for full output.

Rules: gates execute independently; dependencies block dependents automatically; never mutate
unless the gate explicitly requests apply; unavailable live services → `NOT_PROVEN`/`BLOCKED`,
never a crash; never collapse `PARTIAL_PROVEN` into `PASS`.

Suggested dependency chain: `GRAPHIFY_LOCK → FEATURE_ENVELOPE_DRY_RUN →
FEATURE_ENVELOPE_CONCURRENCY → FEATURE_ENVELOPE_APPLY → LATENT_BACKFILL_DIAGNOSTIC →
LATENT_BACKFILL_BOUNDED → GRAPHIFY_DOWNSTREAM → GRAPH_ARTIFACT_PUBLICATION → D9_ORPHAN_AUDIT →
TIER_H_ANALYTICS`.

## Phase 3 — Harden the Graphify coordinator lock — PASS

Inspect whether the outer `graphify:daily` coordinator already owns a global lock. If not, add a
global PostgreSQL advisory lock around all write stages (`pg_try_advisory_lock(hashtext('parent
atlas'), hashtext('graphify daily'))`) using one dedicated checked-out client, held across the
whole run, released in `finally`. Second concurrent run must exit with code 75 (temporary lock
contention, not stage corruption) before writing anything. Set `application_name` per stage:
`atlas-graphify-daily`, `atlas-materialize-feature-envelopes`, `atlas-latent-backfill`. No
unexplained magic integer lock IDs — use `hashtext()` on real strings.

**Correction (2026-08-03)**: verified this pass — `run-graphify-daily-startup.mjs`'s lock is a
**PID-based filesystem lock** (`.graphify-daily-start.lock`, JSON `{pid, startedAt, script}`,
liveness checked via `process.kill(pid, 0)`), **not** the PostgreSQL advisory lock this phase
originally specced. It's real and working (exit 75 on contention, releases on
exit/SIGINT/SIGTERM), but: (a) it only protects `run-graphify-daily-startup.mjs` itself, not
direct standalone invocation of `graphify:daily:chain` or its substeps bypassing the wrapper
(the spec's own "direct standalone stage invocation may retain a stage-specific lock" carve-out
covers this gap, but it's not actually mitigated at the DB level as the PG-advisory-lock design
would provide); (b) it's single-machine only — no cross-process/cross-container coordination,
no `application_name` tagging for `pg_stat_activity` diagnosis. The PG advisory lock remains
unbuilt. Extracted the lock logic (`acquireStartupLock`/`releaseStartupLock`/`isProcessAlive`)
into `scripts/startup/lib/graphify-startup-lock.mjs` (parameterized by lock-file path) so it's
independently testable — `run-graphify-daily-startup.mjs` now imports from it, behavior
unchanged (syntax-checked clean).

## Phase 4 — Prove the feature-envelope lock — PARTIAL_PROVEN (for the coordinator PID lock only)

Tests: `FE_LOCK_G1_FIRST_RUN_ACQUIRES` · `FE_LOCK_G2_SECOND_RUN_REJECTED` ·
`FE_LOCK_G3_SECOND_RUN_WRITES_ZERO_ROWS` · `FE_LOCK_G4_LOCK_RELEASED_ON_SUCCESS` ·
`FE_LOCK_G5_LOCK_RELEASED_ON_FAILURE` · `FE_LOCK_G6_DRY_RUN_DOES_NOT_REQUIRE_WRITE_LOCK`.
Deterministic fixture/isolated rows only, not console-message-only assertions. Capture: PID×2,
`application_name`, lock key, rows-before/after, exit codes×2.

**Real, live concurrency proof run this pass** — `scripts/startup/lib/graphify-startup-lock.spec.mjs`,
against an isolated temp lock file (never the real `.graphify-daily-start.lock`, never invoking
the real chain). Two genuinely distinct OS processes raced against a shared lock file (holder
PID 90736, contender PID 47684, in the recorded run):

- `FE_LOCK_G1_FIRST_RUN_ACQUIRES`: **PASS**
- `FE_LOCK_G2_SECOND_RUN_REJECTED`: **PASS** — contender's `acquireStartupLock()` returned
  `false` while the holder still held the lock
- `FE_LOCK_G3_SECOND_RUN_WRITES_ZERO_ROWS`: **PASS** — lock file content byte-identical before
  and after the rejected contender's attempt
- `FE_LOCK_G4_LOCK_RELEASED_ON_SUCCESS`: **PASS** — lock file gone immediately after the holder
  process exited
- `FE_LOCK_G5_LOCK_RELEASED_ON_FAILURE`: `SKIPPED_WITH_REASON` — the release handler
  (`process.on('exit', ...)`) is unconditional, not a distinct success-vs-failure branch, so this
  gate as originally specced (a separate failure path) doesn't map cleanly onto this
  implementation; not silently claimed as PASS
- `FE_LOCK_G6_DRY_RUN_DOES_NOT_REQUIRE_WRITE_LOCK`: `SKIPPED_WITH_REASON` — this coordinator
  wrapper has no dry-run mode of its own (the underlying chain substeps have theirs)

Scoped as `PARTIAL_PROVEN` rather than `PROVEN`: this proves the coordinator-level PID lock, not
the originally-specced PG advisory lock, and doesn't cover the direct-standalone-invocation gap
noted above.

## Phase 5 — Diagnose competing writers honestly — WIRED, RAN_LIVE_ONCE

Built `scripts/atlas/diagnose-graphify-writers.mjs` — strictly read-only (two `SELECT`s, no
mutation guard needed since no mutating statement exists in the file). Implements exactly the
two queries from the spec: `pg_stat_activity` filtered on `atlas_packets`/`graphify`, and a
`pg_blocking_pids()` blocker/blocked join. Retryable-code detection (`40P01`/`40001`/`55P03`)
tags any query error. Interpretation logic explicitly does **not** claim duplicate invocation
unless ≥2 distinct PIDs carry a graphify-tagged `application_name` — a single matching row (even
the diagnostic's own query self-matching on the literal string `atlas_packets` in its WHERE
clause, as seen below) is correctly classified as no concurrent activity.

Ran live once against the real Postgres instance (port 5434, `legal_ai_db`) via the same
discrete host/port/user/password env-var pattern already used by
`materialize-addressable-packets.mjs` (no new credential handling introduced): 1 activity row
(the diagnostic's own query, self-matched), 0 blocking relationships, interpretation
`NO_CONCURRENT_GRAPHIFY_ACTIVITY_AT_QUERY_TIME`. Real, live, but a single point-in-time
snapshot — no daily-chain run was happening at query time, so this hasn't yet observed the
contention scenario it's designed to diagnose. Re-run during (or immediately after triggering)
an actual `graphify:daily` run for a more meaningful sample — not done this pass, deliberately,
per the standing rule against casually triggering the real chain.

## Phase 6 — Make feature-envelope writes deterministic — DONE, VERIFIED LIVE

**Corrected target** (see `proposal.md`'s Phase 1 correction): the real writer is
`sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts` (daily-chain step 4 →
phase8-fanout substep 5), not `materialize-addressable-packets.mjs` as this section previously
said — that script writes to an NDJSON file, not `atlas_packets` directly.

Assessed against Phase 6's required behavior, reading the actual current file (not assumed):

| Requirement | Status before this pass | Fixed this pass |
|---|---|---|
| Stable row order | ✅ already had `ORDER BY packet_id` (keyset-paginated) | — |
| Envelopes computed outside write transaction | ✅ already true (computed in JS from fetched rows) | — |
| One bounded batch per transaction | ⚠️ batched (`batchSize=500`) but issued **500 individual round-trip `UPDATE`s inside one open transaction** — the exact anti-pattern this phase explicitly calls out to avoid | ✅ replaced with a single `UNNEST($1::text[], $2::jsonb[])`-based batch `UPDATE ... FROM` per chunk — one round-trip per batch, not 500 |
| Retry only known-retryable Postgres errors | ✅ already had `RETRYABLE_PG_ERROR_CODES`/`RETRYABLE_PG_ERROR_PATTERNS` + `isRetryablePgError()` | — |
| Record input/output digests | ❌ receipt had counts and packet-id range but no digest fields | ✅ added `input_digest`/`output_digest` (sha256 over the packet_id-ordered fetched rows / computed envelopes) to the receipt |

Also flagged, **not changed**: `pool.query()` is used directly for `BEGIN`/`UPDATE`/`COMMIT`
rather than a checked-out `client` from `pool.connect()`. This only works correctly because the
pool is configured `max: 1` (a single connection, so every query in the process necessarily runs
on it) — documented in-code as a fragility risk if `max` is ever raised, not fixed this pass
(would need a real client-checkout refactor, out of scope for this bounded fix).

**Live verification, real writes, real database** (not just typecheck/dry-run):
- `npx tsc --noEmit` clean for this file
- Dry-run (`--limit=200`, no `--apply`) → ran correctly, produced real `input_digest`/
  `output_digest` values, `remaining: 11459` consistent with this session's earlier baseline
- **Real `--apply --limit=5` run** → `updated: 5`, verification query showed
  `{ total: 61659, with_envelope: 61659 }`. Spot-checked one of the 5 updated rows
  (`packet:cc69efabff82`) directly via a separate query — `feature_envelope` JSONB matches the
  expected shape exactly (`dense: 0.8, ast: 0.5, graph: 0.75, ontology: 0.7, ...,
  feature_schema_version: "atlas.feature_envelope.v1"`), confirming the new UNNEST batch UPDATE
  writes correct data, not just "runs without throwing."
`FEATURE_ENVELOPE_DETERMINISTIC_WRITE: FIXED_AND_VERIFIED_LIVE`.

## Phase 7 — Feature-envelope proof report — NOT STARTED

Outputs: `docs/reports/parent-atlas-feature-envelope-proof.{json,md}`.

```ts
interface FeatureEnvelopeProof {
  runId: string; mode: 'dry-run' | 'apply'; workspaceRevision: string;
  featureRegistryRevision: string; sourcePacketCount: number; eligiblePacketCount: number;
  processedPacketCount: number; updatedPacketCount: number; unchangedPacketCount: number;
  invalidPacketCount: number; batchSize: number; batchCount: number;
  inputDigest: string; outputDigest: string; replayDigest: string; replayMatches: boolean;
  lock: { globalAcquired: boolean; stageAcquired: boolean; competingRunRejected: boolean };
  status: ProofStatus; errors: Array<{ code: string; message: string; retryable: boolean }>;
}
```

Gates: `FM_G1_SINGLE_WRITER_LOCK` · `FM_G2_SOURCE_PACKET_COUNT_CAPTURED` ·
`FM_G3_DETERMINISTIC_PACKET_ORDER` · `FM_G4_FEATURE_SCHEMA_VALID` ·
`FM_G5_FEATURE_REVISION_RECORDED_OR_EXPLICITLY_ABSENT` · `FM_G6_EXPECTED_ROWS_MATERIALIZED` ·
`FM_G7_INVALID_ENVELOPES_ZERO` · `FM_G8_REPLAY_DIGEST_MATCH` · `FM_G9_DOWNSTREAM_STAGE_CONSUMED`
· `FM_G10_GRAPH_ARTIFACT_UPDATED`. A successful exit code does not imply all gates pass.

## Phase 8 — Latent-backfill diagnostic — PARTIAL_PROVEN

Do **not** run the full backfill first. Inspect `backfill-latent-vectors.mjs` for: default
limit/batch size, Qdrant scroll behavior (does it accumulate the full collection before
batching?), resume-token/checkpoint support, last-processed-key persistence, memory growth per
batch, idempotency. Suspected failure pattern (verify in source, don't assume): limit defaults
to Infinity, scroll accumulates the full collection, batching only starts after accumulation
completes. Note: this session's earlier memory-diagnostic runs (1K/5K forced writes) found no
leak at that scale, but a real OOM was hit around ~98K writes in full-chain conditions — cause
still unconfirmed (isolated-script memory profiling vs. full-system contention). Outputs:
`docs/reports/parent-atlas-latent-backfill-diagnostic.{json,md}`.

Gates: `LATENT_G1_SCRIPT_FOUND` · `LATENT_G2_DEFAULT_LIMIT_BOUNDED` ·
`LATENT_G3_BATCH_SIZE_BOUNDED` · `LATENT_G4_SCROLL_STREAMED` · `LATENT_G5_RESUME_SUPPORTED` ·
`LATENT_G6_CHECKPOINT_SUPPORTED` · `LATENT_G7_MEMORY_BOUNDED` · `LATENT_G8_IDEMPOTENT_REPLAY`.
Initial statuses may honestly be `FAIL`/`NOT_PROVEN`/`BLOCKED`.

## Phase 9 — Bounded streaming latent backfill — PARTIAL_PROVEN

Only after Phase 8's diagnostic identifies the real code path: bounded page fetch → process page
→ persist page → checkpoint → release page memory → fetch next. Never load the full collection
into an array. CLI: `--limit`, `--batch-size`, `--resume-after`, `--checkpoint-path`,
`--max-pages`, `--dry-run`/`--apply`. Choose defaults from inspecting real corpus size/memory
behavior, not blindly.

```ts
interface LatentBackfillCheckpoint {
  runId: string; workspaceRevision: string; collection: string; representationId: string;
  representationRevision: string; nextOffset: string | number; lastPointId: string;
  processedCount: number; persistedCount: number; datasetDigest: string; updatedAt: string;
}
```

Reject a checkpoint if workspace revision, collection, or representation revision changed, or
dataset digest changed incompatibly.

## Phase 10 — Latent-backfill tests — NOT STARTED

`LATENT_BOUNDED_DEFAULT_LIMIT` · `LATENT_PAGE_RELEASED_BEFORE_NEXT_FETCH` ·
`LATENT_MAX_RESIDENT_POINTS_BOUNDED` · `LATENT_CHECKPOINT_WRITTEN` ·
`LATENT_RESUME_CONTINUES_AFTER_CHECKPOINT` · `LATENT_RESUME_REJECTS_WRONG_REVISION` ·
`LATENT_REPLAY_IDEMPOTENT` · `LATENT_PARTIAL_FAILURE_RETRY` · `LATENT_DRY_RUN_WRITES_ZERO` ·
`LATENT_APPLY_WRITES_EXPECTED_COUNT`. Prefer a fake Qdrant-scroll adapter to prove memory
behavior without live infra; a test should fail if the implementation collects all pages before
processing.

## Phase 11 — Foreground Graphify proof run — NOT STARTED

Only after: global lock proven, feature-envelope concurrency proven, feature-envelope replay
proven, latent diagnostic complete, latent bounded/resume tests proven. Run the real pipeline
once, foreground only. Capture PID, start/end time, exit code, per-stage start/end + row counts,
checkpoint state, peak memory (if available), artifact paths. Do not continue past a failed
required stage; do not let later stages publish a new graph artifact after an earlier required
stage fails.

## Phase 12 — Atomic artifact publication — NOT STARTED

Never overwrite `codebase-graph.json` progressively. Write to `codebase-graph.json.tmp`,
validate (file exists, JSON parses, required top-level keys present, run ID matches, workspace
revision matches, stage manifest marks required stages complete, content digest computed), then
atomically rename. On failure: retain last-known-good graph, retain the failed tmp artifact
separately, mark the graph lane `STALE`, do not update KAG/D9 status to current.

```ts
interface GraphArtifactManifest {
  runId: string; workspaceRevision: string; generatedAt: string; artifactPath: string;
  artifactDigest: string; artifactSize: number;
  requiredStages: Array<{ stageId: string; status: ProofStatus; outputDigest: string }>;
  jsonValid: boolean; published: boolean;
}
```

## Phase 13 — Verify downstream artifacts — NOT STARTED

After publication, separately verify (never infer from Graphify's exit code):
`codebase-graph.json` mtime updated + JSON parses, Karpathy map updated, KAG notes updated, D9
report updated, Tier H report updated or explicitly blocked. Gates:
`GRAPH_ARTIFACT_PUBLICATION` · `KARPATHY_MAP_PUBLICATION` · `KAG_NOTES_PUBLICATION` ·
`D9_ORPHAN_AUDIT` · `TIER_H_ANALYTICS`.

## Phase 14 — Parent Atlas Studio lane integration — NOT STARTED

Read-only Studio lane definitions for: `GRAPHIFY_COORDINATOR`, `FEATURE_ENVELOPE_MATERIALIZATION`,
`LATENT_BACKFILL`, `GRAPH_ARTIFACT_PUBLICATION`, `KAG_NOTES`, `D9_ORPHAN_AUDIT`,
`TIER_H_ANALYTICS`. Each lane shows: lane ID, owner script/service, current gate status, latest
run ID, workspace revision, input/output digest, processed/updated counts, checkpoint,
blockers/warnings, latest proof path, started/completed at. No new orchestration engine — Studio
reads proof reports and canonical run records. Svelte 5 runes only (no `export let`/`on:click`/
`createEventDispatcher`).

## Phase 15 — tRPC read API — NOT STARTED

Read-only procedures, following existing protected-admin conventions: `parentAtlasStudio.
graphifyOverview` / `.graphifyLanes` / `.graphifyRun` / `.featureEnvelopeProof` /
`.latentBackfillProof` / `.graphArtifactManifest`. No "start Graphify" or mutation controls this
slice, unless a secure existing job-control abstraction already exists — and if it does, don't
expand its authority.

## Phase 16 — OpenTelemetry — NOT STARTED

Spans: `graphify.run` / `.stage` / `.lock_acquire` / `feature_envelope.read` / `.compute` /
`.write_batch` / `latent_backfill.scroll_page` / `.compute_batch` / `.persist_batch` /
`graph_artifact.validate` / `.publish`. Attributes: `graphify.run_id`, `graphify.stage_id`,
workspace revision, batch index/size, rows processed/updated, checkpoint offset, artifact
digest, proof status. Never record raw source code, raw feature envelopes, raw vectors, or DB
credentials/connection strings.

## Phase 17 — Proof-ladder tests — NOT STARTED

Unit: `PROOF_STATUS_PARTIAL_NOT_PROMOTED` · `PROOF_DEPENDENCY_FAIL_BLOCKS_CHILD` ·
`PROOF_DEPENDENCY_BLOCKED_BLOCKS_CHILD` · `PROOF_REPORT_JSON_SERIALIZES` ·
`PROOF_REPORT_MARKDOWN_SERIALIZES` · `PROOF_UNAVAILABLE_SERVICE_NOT_CRASH`.
Graphify: `GRAPHIFY_GLOBAL_LOCK` · `GRAPHIFY_SECOND_RUN_REJECTED` ·
`GRAPHIFY_NO_ARTIFACT_ON_STAGE_FAILURE` · `GRAPHIFY_ATOMIC_PUBLICATION` ·
`GRAPHIFY_LAST_GOOD_ARTIFACT_PRESERVED` · `GRAPHIFY_MANIFEST_REVISION_MATCH`.
Studio: `STUDIO_GRAPHIFY_STALE_WARNING` · `STUDIO_GRAPHIFY_BLOCKER_DISPLAY` ·
`STUDIO_GRAPHIFY_CURRENT_GATE` · `STUDIO_GRAPHIFY_PROOF_LINK` · `STUDIO_GRAPHIFY_NO_FALSE_PROVEN`.
Run focused tests first; don't claim full-repo health unless the full suite actually ran —
report existing baseline failures separately.

## Phase 18 — Deliverables — PARTIAL (this directory only)

- `scripts/validate-parent-atlas-integration-proof.mjs` — exists and is extended with the new
  gates (Phase 2, PASS)
- `docs/reports/parent-atlas-integration-proof.{json,md}` — written by the proof-ladder runner
- `docs/reports/parent-atlas-feature-envelope-proof.{json,md}` — not written
- `docs/reports/parent-atlas-latent-backfill-diagnostic.{json,md}` — not written
- `docs/reports/parent-atlas-graph-artifact-manifest.json` — not written
- `docs/reports/parent-atlas-graphify-recovery.md` — not written
- OpenSpec task file: `OPENSPEC_OWNER: BLOCKED_OWNER_AMBIGUITY` — this proposal lives in its own
  new directory instead, per the source spec's own instruction not to append to either
  conflicting `parent-atlas-graph-retrieval-proof/tasks.md`.

## Scoped codebase-graph.json refresh — stall diagnosed and fixed (2026-08-09)

Separate from the 18-phase Graphify pipeline above: `scripts/index-codebase-fast.mjs` — the
"20-Gate Deep Audit" fast AST indexer that produces `docs/graph/codebase-graph.json` — is the
prerequisite freshness gate for `parent-atlas-graph-analysis-contract` Patch H (betweenness),
not part of Graphify itself, but tracked here since this file owns "stage profiling,
deterministic publication, and graph provenance" for this artifact per the addendum ownership
note in `parent-atlas-semantic-768-canonical-contract`.

**Root cause (CONFIRMED, not just "strong candidate")**: the G13 dead-export cross-file pass
(lines ~665-670 pre-fix) was `for (const f of files) { for (const name of Object.keys(
exportImportCounts)) { if (srcKey.includes(name)) ... } }` — O(files × distinct_export_names)
with a `.includes()` substring scan per pair, and **zero progress output** inside the loop. For
a full/scoped run with tens of thousands of files/exports this could run for a very long time
at ~98% CPU with no output — exactly what was observed (frozen file-count checkpoint, process
alive, no crash). Confirmed by direct code reading, not inferred from timing alone.

**Also found while confirming**: the check was checking the wrong thing besides being slow — it
tested whether an export name appeared as a *substring of concatenated import module paths*
(e.g. `'user'` matching inside `'./lib/user-service'`), not whether the symbol was actually
imported anywhere. And its output (`exportImportCounts`) was **never read again anywhere in the
file** (confirmed via full-file grep) — the entire pass computed a value that fed nothing
downstream (not the manifest, not `gateStats`, not `dirRows`, not the graph JSON). So the fix
below has zero behavioral effect on the tool's actual outputs; it only removes a pointless,
extremely slow computation.

**Fixed**: replaced with a real imported-symbol extraction (`RE_NAMED_IMPORT_BLOCK` /
`RE_DEFAULT_IMPORT_NAME`, new `importedSymbols` field per file, threaded through the Redis
cache-serialization round-trip, `META_CACHE_VERSION` bumped v23→v24 to invalidate stale cached
metadata lacking the field) and a single global `Set` built once — O(files × imports_per_file)
— with `.has()` lookups replacing the substring scan. Known accepted limitation: namespace
imports (`import * as X`) aren't resolved to individual symbol names, which can only produce
false "unused" flags, never hide a real dead export (same direction of imprecision the old
substring check also had) — consistent with G13 being a heuristic audit signal, not a
guarantee, per this script's own header comment.

**Separately fixed, unrelated to the stall**: `EXCLUDE_DIRS` didn't cover three large non-source
top-level directories that were being fully walked on every run: `docker/` (48.5K files, build
context), `sites/` (18.9K files, untracked mirror), `neschrom97/cards/` (8.2K files, NES/CHR97
packet/card data). Added all three to `EXCLUDE_DIRS`; also removed `docker` from
`EXTRA_INDEX_DIRS` (it was force-walked there even though also present in `EXCLUDE_DIRS`, which
only suppresses recursive-child exclusion, not a directly-named top-level walk target — the two
lists were contradicting each other for `docker`). This was found and fixed *before* the G13
root cause was confirmed, and made the earlier symptom look like cumulative volume rather than
an actual algorithmic hang — worth recording so a future reader doesn't re-derive the same
false lead.

**CORRECTION (2026-08-09, same day, later)**: the G13 fix above was necessary but **not
sufficient** — it was not the actual cause of the multi-minute stalls observed across several
runs. Root cause found via targeted slow-file instrumentation (per-file `extractMeta()` timing,
warn if >1000ms): a 313KB minified third-party JS bundle vendored inside a Python virtualenv's
`site-packages` (`tools/agentic-research/.venv/.../patchright/driver/package/lib/vite/recorder/
assets/codeMirrorModule-*.js` — a Playwright/Patchright browser-recorder UI asset) took **18.1
seconds** for this script's ~20 regexes to process. `.venv`/`site-packages` directories were
never in `EXCLUDE_DIRS` (only `node_modules` was excluded by name) — likely several such
vendored bundles exist across the repo's multiple venvs (root `.venv`, `.venv-cu130`,
`.venv-gemma4`, plus nested ones), which fully explains the repeated stalls at the same
file-count checkpoint independent of the G13 loop shape. Added `.venv`, `venv`,
`.venv-cu130`, `.venv-gemma4`, `site-packages` to `EXCLUDE_DIRS`.

**Also discovered and fixed while confirming the above**: my own G13 rewrite had a bug —
default imports were tracked by adding the literal string `'default'` to the imported-symbols
set instead of the actual bound local name, which would never match any real export name (no
export is literally named `"default"`). Caught by cross-referencing an independently-produced
fix for the same bug (a user-supplied bundle proposing the identical `Set`-based approach);
fixed to use the captured local name.

**Live-verified, both fixes together** (`--src src`, probe mode, not yet a canonical run):
9,697 files in 84.0 seconds total, cross-file passes G13/G19/G16 all <0.2s combined (down from
multi-minute/indefinite). `SCOPED_REFRESH_STALL_CAUSE: CONFIRMED_VENV_SITE_PACKAGES_REGEX_COST`
(supersedes the earlier `CONFIRMED_POST_SCAN_QUADRATIC_G13_PASS` — that diagnosis was real but
incomplete, not wrong).

**Publication safety also implemented this pass** (addendum items H4-H11), ahead of the
originally-planned order, because a concrete incident during this session's own diagnostic
work proved the danger is real and not hypothetical: an orphaned probe process (started via a
Git-Bash `timeout`-wrapped command that did **not** actually kill the underlying Node process
on this machine, confirmed independently three separate times this session) silently completed
in the background and overwrote the canonical `docs/graph/codebase-graph.json` with a **13-file
result**, mid-session, without any error or notification. Implemented:
- `--publish-canonical` flag, only honored when scope is genuinely full-repo (no `--src`, no
  `--no-extra-index-dirs`) — a scoped/probe run cannot write the canonical file even if the
  flag is passed.
- Default (no flag) output goes to `docs/reports/graph-probes/codebase-graph.<runId>.json` —
  canonical file is never opened for writing on a probe run.
- Single-writer lock (`docs/graph/.codebase-graph.lock`, PID + runId + scope + command),
  exclusive-create (`wx` flag), stale-lock recovery via `process.kill(pid, 0)` liveness check.
- Canonical publish path: write to `docs/graph/.build/codebase-graph.<runId>.tmp.json` →
  round-trip parse + fileCount-match validation → write a receipt →
  `fs.renameSync()` to the real path (atomic on the same filesystem). A throw or `process.exit`
  anywhere before the rename leaves the previous canonical artifact completely untouched.
- SHA-256 topology hash (of sorted file rel-paths) recorded in `provenance` on every run.

**Live-verified**: ran a scoped probe with the new flags — canonical file's mtime confirmed
byte-for-byte unchanged (`stat` before/after), output correctly landed in
`docs/reports/graph-probes/`, no lock file created (lock is only acquired on
`--publish-canonical` runs). Proves H5 (scoped probe cannot publish canonical) live, not just
by code inspection.

**Status, corrected against the addendum's H1–H14 ladder**:
- H1 (quadratic loop removed): **PROVEN** — <0.2s G13 on ~10K files.
- H2 (semantic import bindings, not path substrings): **PROVEN** — real named/default import
  extraction, `Set.has()` lookups.
- H3 (scan stage progress visible): **PARTIAL** — added `[SCAN_FILES] N files... last: <path>`
  live progress + slow-file (>1s) warnings with byte size; did NOT build the full
  `CodebaseGraphStageReceipt` structured-JSON format from the addendum's B1.
- H4 (run ID unique): **PROVEN** — `RUN_ID` embeds ISO timestamp + PID.
- H5 (scoped probe cannot publish canonical): **PROVEN LIVE** (see above).
- H6 (single canonical writer lock): **IMPLEMENTED, not yet exercised under real contention**
  (no second concurrent canonical run was attempted against it).
- H7 (temp artifact validated before publish): **IMPLEMENTED, not yet exercised on a real
  canonical run** — the validation branch has only run inside probe mode's code path
  structurally shared with canonical mode, never via an actual `--publish-canonical` invocation.
- H8 (topology hash recorded): **IMPLEMENTED, not yet exercised on a canonical run.**
- H9 (atomic publish only after pass): **IMPLEMENTED, not yet exercised on a canonical run.**
- H10/H11 (interrupted/orphan run preserves previous graph): **NOT exercised** — no failure
  was deliberately induced against the new canonical path yet.
- H12 (clean src-scoped refresh pass): **PROVEN LIVE** — 84.0s, 9,697 files, 0 errors.
- H13 (clean full canonical refresh pass): **NOT RUN.** Every run this session used `--src src`
  (scoped/probe). No `--publish-canonical` invocation has happened.
- H14 (graph revision proven): **NOT RUN** — depends on H13.

**Known outstanding risk, not yet remediated**: the canonical `docs/graph/codebase-graph.json`
on disk right now is still the bad **13-file artifact** from the orphaned-probe incident
described above (confirmed via direct `fileCount` read of the live file). The new publication
safety prevents *future* accidental overwrites but does not retroactively repair the already-
corrupted canonical file — that requires an actual H13 canonical run, not yet performed.

**2026-09-09 publication preflight correction:** the current checkout no longer contains a
readable `docs/graph/codebase-graph.json`; the read-only preflight reports
`PUBLICATION_PREFLIGHT_BLOCKED` with 4/6 safety checks present. The preflight confirms the
run-scoped temporary path and atomic rename machinery, but canonical promotion remains
blocked by missing sealed-snapshot binding, missing candidate receipt, and the absent
canonical artifact. Report: `docs/reports/graphify-atomic-publication-preflight-v1.json`.
This does not authorize a canonical Graphify run or direct artifact repair.

**Not done** (per the addendum's B1/B3/B4, explicitly out of scope for this pass): the full
`CodebaseGraphStageReceipt` structured JSON format (only inline console timing was added), no
correction of any stale `npm run graphify:daily` documentation claims.

## Neo4j → Qdrant fan-out lane (queued behind control-plane proofs)

This is the next completion lane after the two control-plane proofs settle:

1. fix / verify the Valkey OpenCode rules seed path
2. prove OpenCode 1.18.18 turn-N / turn-N+1 replay on `:8090`
3. then prove the graph → Qdrant fan-out path below

The repo already has partial owners for this lane. Do not add a second fan-out subsystem or a
second canonical Qdrant writer. The task here is to prove the existing path, record a durable
receipt, and tighten the acceptance gates.

### Existing owners already present in repo

- `sveltekit-frontend/src/lib/server/atlas/projections/qdrant-packet-projection.ts`
- `sveltekit-frontend/src/lib/server/graph/graph-projection-manifest.ts`
- `sveltekit-frontend/src/lib/server/graph/pg-neo4j-sync.ts`
- `scripts/atlas/project-neo4j-graphrag.mjs`
- `scripts/atlas/project-feature-matrix-neo4j.mjs`
- `scripts/atlas/sync-atlas-feature-map-from-qdrant.mjs`
- `scripts/atlas/neo4j-cluster-fanout.mjs`
- `scripts/atlas/validate-qdrant-bridge.mjs`
- `scripts/atlas/validate-qdrant-bridge-v2.mjs`

### To-do list

- [x] Verify the existing Qdrant projection contract's identity fields and confirm identity is
      not derived from Neo4j or Qdrant internal IDs.
      **Proven 2026-09-24 (static contract review + 8 focused tests):**
      `sveltekit-frontend/src/lib/server/atlas/qdrant-collection-contracts.ts` owns
      `packet_key`, `source_ref`, and the `graph_revision` payload index. `community_id` and
      `page_rank` are optional payload properties only; `feature_id` and `projection_revision`
      are not part of this Qdrant contract. The old task's field list incorrectly combined
      payload identity with optional projection analytics, so it is narrowed rather than adding
      unneeded indexes. The contract keeps packet/source identity and graph revision separate
      from Qdrant point IDs and Neo4j internal IDs. Tests:
      `sveltekit-frontend/src/lib/server/atlas/qdrant-collection-contracts.spec.ts` (8/8).
- [x] Confirm the existing projection-manifest owners are layered by responsibility; reuse
      them rather than introducing another manifest.
      **Proven 2026-09-24 (static import/contract census + 16 focused tests):**
      `sveltekit-frontend/src/lib/server/graph/graph-projection-manifest.ts` owns GDS relationship
      projection configuration, revision freshness, and relationship count. The sibling
      `graph-projection-manifest-v1.ts` owns snapshot membership/ordinal checksums and node/edge
      counts. `sveltekit-frontend/src/lib/server/atlas/graph/graph-projection-manifest.ts` remains
      the ALT/precompute executor manifest. The fan-out receipt is a distinct run artifact, not
      another manifest. The incompatible runtime receipt interface now has a distinct schema/type
      identity; the strict Zod receipt owner is
      `sveltekit-frontend/src/lib/server/atlas/graph/graph-projection-receipt-v1.ts`.
      Focused manifest/receipt tests passed 16/16.
- [x] Inventory the live fan-out scripts above and classify each as `created`, `wired`, or
      `proof-only`; do not add a new fan-out service if the existing scripts already cover the
      path.
      **Done 2026-09-21 (static evidence only — no script was run):**

      | Script | Lines | Dry/apply flags | Readback refs | npm alias | Other importers | Class |
      |---|---|---|---|---|---|---|
      | `project-neo4j-graphrag.mjs` | 168 | 1 | 0 | none | none | `created` (orphan) |
      | `project-feature-matrix-neo4j.mjs` | 199 | 2 | 3 | none | 2 scripts mention it | `created` |
      | `sync-atlas-feature-map-from-qdrant.mjs` | 281 | 3 | 1 | `atlas:qdrant:feature-map-sync` | 2 (`packet-materializer-lib`, `reingest-parent-atlas`) | `wired` |
      | `neo4j-cluster-fanout.mjs` | 225 | 2 | 4 | `atlas:neo4j:cluster-fanout` | none | `wired` |
      | `validate-qdrant-bridge.mjs` | 115 | 0 | 0 | `atlas:index:registry:init` | none | `proof-only` (alias name says init) |
      | `validate-qdrant-bridge-v2.mjs` | 129 | 0 | 0 | `atlas:index:qdrant:build` | none | `proof-only` (alias name says build) |

      No new fan-out service is needed. Naming mismatch: two `validate-*` scripts are aliased as init/build
      commands with no dry-run gate — review before anyone runs those aliases. Tasks below (dry-run, apply,
      idempotence) remain open and write to Neo4j/Qdrant, so they need explicit approval.
- [ ] Add or reuse a `GraphProjectionReceipt`-shaped report for the fan-out run, including
      `graphRevision`, `projectionRevision`, `sourceRef`, `packetKey`, `featureId`,
      `communityId`, `pageRank`, and row counts.
- [ ] Prove the run in dry-run mode first, with a bounded sample, and capture a report artifact
      instead of mutating canonical truth.
- [ ] Prove a bounded apply run against the same sample and verify readback / edge counts /
      sample rows.
- [ ] Prove idempotence: same graph revision + same input set must yield the same projected
      rows and no duplicate canonical records.
- [ ] Expand the fan-out only after the bounded proof passes; keep the path event/revision-driven
      rather than reindexing on every query.
- [x] Keep Postgres canonical; treat Neo4j and Qdrant as rebuildable projections/mirrors for
      this lane.
      **Confirmed 2026-09-24 (owner layering/design review):** the new design keeps packet,
      source, and revision truth in PostgreSQL; Qdrant and Neo4j remain disposable projections.
      No projection execution or datastore write was performed in this contract tranche.

### Acceptance gates

- `NEO4J_QDRANT_FANOUT_DRY_RUN_PROVEN`
- `NEO4J_QDRANT_FANOUT_APPLY_PROVEN`
- `NEO4J_QDRANT_FANOUT_READBACK_PROVEN`
- `GRAPH_PROJECTION_RECEIPT_PROVEN`
- `NEO4J_QDRANT_FANOUT_IDEMPOTENT`
- `OPENCODE_REPLAY_TURN2_PROVEN`
- `VALKEY_OPENCODE_RULES_SEED_PROVEN`

## Daily local discovery helpers (2026-10-15; companion CLI)

- [x] `GRAPHIFY-DISCOVERY-01` Add `scripts/atlas/graphify-daily-discovery-v1.mjs` and its CLI helper module. Reuse the existing runtime-ownership registry, focused architecture TOCs, `repo-scan-roots.mjs`, and an explicitly selected OpenSpec ledger/receipt. Inventory uses NUL-delimited Git records; routine discovery has no service/database/GPU/cache access. `--sizes` and bounded streamed graph hashing are explicit options. Optional local receipts use exclusive creation so prior artifacts are preserved.
- [x] `GRAPHIFY-DISCOVERY-02` Register `graphify:daily:inspect`, `graphify:daily:search`, and `graphify:daily:helpers:test` in the existing frontend package. Search uses literal shell-free `rg` arguments, filename-prioritized batches, a 250-source-file budget, bounded excerpts and subprocess limits; failures retain an explicit error status. Nine focused Node tests cover inventory, Unicode paths, dependency/build exclusions, size limits, declarations versus authority, ignored graphs, missing executables, untracked opt-in and path/selection guards.
- [x] `GRAPHIFY-DISCOVERY-03` Exercise inspection and bounded source search through the actual npm aliases. Inspection receipt: `docs/reports/graphify-daily-discovery-inspect-20261016T023157929Z.json` (about 2.4 s with small graph hashes). Search receipt: `docs/reports/graphify-daily-discovery-search-20261016T023817737Z.json` (8 bounded `SearchRuntime` hits, about 2.6 s). Existing timeout receipts remain preserved. Documentation: `docs/architecture/graphify-daily-discovery-helpers-v1.md`; navigation linked from the Atlas TOC.
  Validation receipt: `docs/reports/graphify-daily-discovery-validation-20261016T024005203Z.json`; full 9/9 test output: `docs/reports/graphify-daily-discovery-tests-20261016T024005203Z.txt`. Strict OpenSpec validation, JavaScript syntax, package JSON/alias checks and scoped whitespace passed. An actual duplicate-output invocation returned `EEXIST`/exit 1 and independently preserved the prior report's SHA-256.
- [ ] Maintenance refresh, current graph provenance, source qualification, SearchRuntime-to-ContextManifest proof and production mutation admission retain their existing gates. Discovery completion and graph mtime/hash observations do not close them. No daily maintenance command was run by this tranche.

## Ranking-gate audit (2026-10-16, read-only; `DIAGNOSTIC_PASS`, no gate fixed)

Source: `graphify-langgraph-pipeline.mjs --stage kanban_task` dry run (gate definitions at `rankSignals`, lines ~784-804) plus read-only SQL against `atlas_packets` (61,718 packets with `packet_key`). No writes were performed. Two crash bugs in that script were fixed the same day (`count.toLocaleString()` on a null task count, now `n/a`; stage exits 0).

| Gate | Result | Audit finding |
|---|---|---|
| `bm25_coverage_85pct` | 0% (0/61,718) | Measures `payload->>'bm25_text'`, which no process has ever written (0 rows, also 0 rows with any `bm25*` payload key). `bm25_indexed_at` is a different marker (1,357 rows set); `graphify_bm25_index_runs` has 0 rows. The gate is a proxy for a payload field, not for the live BM25 index (`idx_codebase_chunk_bm25_search`, pg_search). A passing gate would require a canonical `UPDATE atlas_packets.payload`, not just an index. |
| `concept_coverage_60pct` | 94.6% pass | No finding. |
| `community_conf_95pct` | 94.6% (58,366/61,718) | 3,352 packets have null `community_confidence`: 3,294 are one cohort (all `ace:packet:<hash>` keys, all `community_id = 0`, all created 2026-07-20, registered by `register-orphaned-chunks.mjs`); 58 have no `community_id`. CORRECTION (same day): the `ace:packet:` form is the CANONICAL side of `atlas_packet_identity_aliases` (alias `packet:<hash>` -> canonical `ace:packet:<hash>`, kind `PREFIX_DIVERGENCE_ACE_PACKET`, 3,294 rows, all targets exist), not a legacy duplicate; no `packet:<hash>` twin rows exist to inherit a confidence from. Since 78% of other packets also have `community_id = 0` but carry a confidence, the cohort reads as registered-but-never-community-scored. The gate counts `community_confidence IS NOT NULL`, not the `>= 0.65` figure the script also computes. |
| `qdrant_unique_packet_coverage_50pct` | `NOT_MEASURED` | Hard-coded `pass:false` in the script until a deduplicated canonical join exists (329k+ Qdrant points vs 61,718 packets; known duplicate mappings). It cannot pass by design; it is a placeholder, not a measurement. |

- [ ] GATE-BM25-DEF-01 Decide whether the BM25 gate should measure `bm25_indexed_at`, the pg_search index, or the `payload.bm25_text` backfill. Do not run the node-6 backfill with `--apply` before the decision (it writes canonical `atlas_packets.payload`, 500 rows per run).
- [ ] GATE-COMMUNITY-LEGACY-01 (reworded) Determine whether the 3,294 orphan-registered `ace:packet:` packets (all `community_id = 0`, null confidence) belong in community detection at all. If yes, score them through the owning community/Louvain pipeline (cuGraph/NetworkX parity path) so confidence is computed, not defaulted; if no, exclude the cohort from the gate denominator with a recorded reason. Do not rewrite keys, do not invent confidences, and do not treat `community_id = 0` as a real assignment for them without that evidence.
- [x] GATE-QDRANT-JOIN-01 (code part DONE 2026-10-16, read-only; the finding below stays OPEN) Replace the hard-coded `pass:false` with a measured canonical-identity join (`packet_key` + `source_ref`), or relabel the row `NOT_MEASURED` in the output instead of an X.
  - Read-only measurements 2026-10-16 (no writes; Qdrant `retrieve` without vectors): Postgres records `qdrant_point_id` for 23,270 of 61,718 packets (37.7%): 23,267 -> `codebase_chunks_768`, 2 with null collection, 1 pointing at the retired `codebase_chunks_384` (row labelled dim 768); 8 duplicate IDs (23,262 distinct). ID formats: 19,532 UUID, 3,738 integer. Every one of 274,465 chunks has a distinct `qdrant_id`, yet `codebase_chunks_768` holds 328,348 points (53,883 more than chunks; `_768_v2` holds 52,816).
  - Existence: of 23,261 distinct recorded IDs for `codebase_chunks_768`, 21,430 exist (92.1%), 1,831 do not. Existence is an upper bound, not identity.
  - Identity sample (BIASED: first 1,200 packets by `packet_key`, which are all `ace:packet:` cohort rows; 1,121 found): `source_ref` matched on 1,121/1,121, but Qdrant payload `packet_key` matched Postgres on only 818 and DIFFERED on 303 (e.g. PG `ace:packet:001be68ca4b0` -> point whose payload says `packet:84c2c5927e3e`, same file). A source_ref-only join would therefore over-count coverage; the join must use `packet_key` + `source_ref`. Not measured: the 38k+ packets with no recorded point, non-cohort packets, and `_768_v2`.
  - Implemented: `measureQdrantIdentityCoverage()` in `scripts/atlas/graphify-langgraph-pipeline.mjs` (`rank_signals`): a packet is covered only if its recorded point exists in `codebase_chunks_768` and the payload `packet_key` AND `source_ref` equal Postgres exactly; ids mapped to several packets are excluded as ambiguous; any Qdrant failure gives `NOT_MEASURED`, never a pass. Dry run (read-only) now reports `8.3% identity-verified (5,148/61,718; recorded 23,269, missing 1,831, key/ref mismatch 16,274, ambiguous ids 16)`, so the gate still fails, now on a measurement.
  - Full-population split (supersedes the biased sample above; 23,253 unique ids checked, 21,422 found): payload `packet_key` equal to Postgres on 5,297 (5,148 exact `source_ref`, 144 `source_ref` equal only by path-prefix suffix, 5 different file); payload `packet_key` DIFFERENT on 16,125, of which 15,135 share the exact `source_ref`. Examples show the payload `packet_key` field holding a UUID (point-id-like value) instead of the atlas key. So about three quarters of existing points carry a different identity in `packet_key`; the suffix tolerance only moves the figure from 8.3% to ~8.6%. Open question for the owner: is the payload `packet_key` a chunk/point identifier in `codebase_chunks_768` (expected for chunk-grain points) or a mis-written field? Do not repair or backfill payloads until that is decided; Qdrant is a mirror and the canonical join must go through Postgres.
- [ ] GATE-ORCH-RACE-01 The `dev:gpu` orchestrator's "readiness timeout after 60 polls" is a startup race (polls begin before Vite is up; Vite took minutes). Locate the poll loop and wait for `/api/health` before counting polls. Separately, the Postgres probe bug that made `coreStructural` permanently `WARN` was fixed in `routes/api/graphify/status/+server.ts` (TCP connect instead of HTTP).

HLL helper inventory (read-only, no change): `sveltekit-frontend/src/lib/server/atlas/telemetry/atlas-hll-telemetry.ts` (+ spec; `AtlasHllTelemetryClient`, `buildHllRegisterKeys`, `HllRedisAdapter`) is the existing owner; `scripts/atlas/warm-bitfrost-agent-cache.mjs` and `warm-feature-identity-cache.mjs` call `PFADD` directly through their own `redis-cli` adapters. HLL output is breadth telemetry only (never identity or evidence). Alignment of the two scripts to the shared client is tracked in `parent-atlas-adaptive-backprop-hll-monitoring` (8 done / 53 open).

### `source_ref` definition (2026-10-16, read-only audit; producer chain only partly traced)

- Meaning in the live table (`atlas_packets`, 61,718 rows): a repo-root-relative POSIX file path, unique per packet (61,718 distinct). Equals `file_path` on 58,305 rows (94.5%). `canonical_source_ref` is the lower-cased, `sveltekit-frontend/`-stripped form (equals `source_ref` on only 26,865 rows). `directory_path` is NOT the file's folder: null on 53,640 rows and usually a project root (`sveltekit-frontend`); only 3,588 rows equal the real dirname, which contradicts the `directory_path -> source_ref` chain written in CLAUDE.md.
- `graphify:materialize` (`scripts/atlas/materialize-addressable-packets.mjs`, 1,561 lines) does NOT scan directories. It reads candidate objects from existing `atlas_packets` / `atlas_packet_registry` / `atlas_summary_layers` / `atlas_semantic_diffs` rows plus evidence files (`.tmp/*.ndjson`, `docs/reports/*.json`, `memory/packets/*.jsonl`, `neschrom97/packets/cards.ndjson`) and takes `source_ref` from `candidate.source_ref ?? canonical_source_ref ?? file_path` as given by the artifact; its `normalizeKey` (backslashes to `/`, strip `./`, `../`, leading `sveltekit-frontend/` and `deeds-web-app/`, collapse `//`, lower-case) produces the canonical form. One synthetic producer builds `source_ref = file_path = <production_ready_code_paths entry>` from `repo-consolidation-feature-map.json`.
- Not yet traced: which writer first inserts the `atlas_packets` row for a directory-scanned file. `atlas_packets` writers found: `acp/packet-materializer-pipeline.ts`, `scripts/atlas/admit-packets-current-live-identity-v1.mjs`, `scripts/phase-d-ingest-*.mjs`, `topology/canonical-id-hierarchy.ts`, `retrieval/promote-results-outbox.ts`, `unknown/promotion-executor.ts`. The 3,352-row orphan cohort has `source_ref` only (no `file_path`, `directory_path`, `canonical_source_ref`, or community confidence).
- Duplicate owners to reconcile before any change (same name, different rules): `normalizeSourceRef` in `identity/compute-packet-key.ts` (lower-cases), `scripts/atlas/lib/adaptive-schema.mjs`, `scripts/atlas/lib/lineage-field-aliases.mjs`, `packages/atlas/lib/packet-identity-bridge.mjs`, and the two `ast-source-ref-*.mjs` helpers; plus `normalizeKey` in the materializer.
- [ ] SRCREF-DEF-01 Pick ONE canonical definition of `source_ref` (path form, case, repo-root vs frontend-relative namespace) and have the other normalizers delegate to it; until then never join packets across stores on a normalized/lower-cased form alone (Qdrant payload `source_ref` already differs from Postgres by path prefix on 144 sampled points).
- [ ] SRCREF-TRACE-01 (PARTIAL 2026-10-16, static read-only trace; `graphify:daily` was NOT run) Trace the first-insert writer for directory-scanned packets (run `graphify:daily` under a recording harness or follow `index-codebase-fast` -> `codebase_chunk_index.relative_path` -> `atlas_packets`) and record the exact derivation.

  - Trace so far: `graphify:daily:chain` = admission gate -> dedup-validation -> `graphify:materialize:apply` -> cold-processing -> phase8 fan-out -> Qdrant tag mirror -> Qdrant feature-map sync -> ACE packet step; `run-graphify-daily-startup.mjs` also runs `scripts/atlas/index-full-repo-for-search.mjs`. That scanner is the directory walker: it builds `source_ref = normalizeRepoPath(path.relative(REPO_ROOT, absPath))` (backslashes to `/`, strip leading `./` and `/`; no lower-casing, no `sveltekit-frontend/` stripping), upserts `codebase_chunk_index` (`relative_path`, `source_ref`) and writes the Qdrant payload with `path = file_path = source_ref = relative_path`. It does NOT insert `atlas_packets`; the materializer (see above) and the other writers listed do. So `source_ref` originates as the repo-root-relative path from the directory scan and is carried through unchanged; only `canonical_source_ref` is lower-cased/stripped.
  - Answers the open payload question (from GATE-QDRANT-JOIN-01): on an unbiased random sample (3,000 packets by `md5(packet_key)`, 2,777 found in `codebase_chunks_768`), payload `packet_key` equals the Postgres `packet_key` on 696 (25.1%); of the 2,081 mismatches, 1,967 (94.5%) carry the point's OWN id in `packet_key` (a chunk/point identifier, not the atlas packet key) and 114 carry a different packet-form key; none are null. The current scanner writes `packet_key: null` and explicitly refuses to persist a `metadata.packet_key` equal to `qdrant_id` (lines ~514-516), which indicates an older writer set `packet_key := qdrant_id`; that writer is not yet identified. Treat payload `packet_key` as untrusted for identity and join through Postgres.
  - Still open: the first-insert writer for `atlas_packets` rows of scanned files; the older writer that put point ids into payload `packet_key`.

### `packet_key` as canonical identity in PostgreSQL 18 (2026-10-16, read-only)

- Enforced by the database (PostgreSQL 18.4): `atlas_packets_packet_key_key UNIQUE (packet_key)`; 0 nulls, 61,718 distinct over 61,718 rows. The primary key is a separate text surrogate `packet_id` (`packet_id = packet_key` on 58,305 rows, different on 3,413).
- Key forms are NOT uniform: 58,362 `packet:<12 hex>`, 3,294 `ace:packet:<12 hex>` (canonical side of `atlas_packet_identity_aliases`), 62 bare 16-hex keys for `proto:*` service-registry rows. `identity/compute-packet-key.ts` defines a different `pkt:v1:...` scheme; no live row uses it (dormant, not an owner today).
- Grain: 61,718 packets vs 274,465 chunks vs 328,348 `codebase_chunks_768` points, while `atlas_packets.qdrant_point_id` holds ONE point per packet. A packet (file-level) therefore cannot map one-to-one to its chunk-level points; a point's own id is a chunk identifier and must not be stored in a payload field named `packet_key`.
- Older payload writer NOT identified. Eliminated by inspection: `backfill-qdrant-payload-complete.mjs`, `backfill-qdrant-payloads-from-postgres.mjs`, `backfill-qdrant-payload-upsert.mjs` and `backfill-qdrant-som-payload.mjs` all take `packet_key` from `atlas_packets`; `langgraph-gemma4-synthesis.mjs` (`packet_key: id`) only builds simulated provenance rows; no Python script assigns it. Remaining candidates: git history of the payload fields (`qdrant_point_id`, `representation_id`) and Rust/TS projection writers not searched.
- [ ] PKEY-FORM-01 Decide whether the three key forms are accepted spellings of one identity (alias table already says so for `ace:packet:`) and record the single hash definition and owner; keep `computePacketKey` out of production until then.

### SRCREF-TRACE-01 — read-only recording-harness scope, producer evidence and normalizer parity (2026-10-16)

Design corrections adopted from review: `source_ref` identifies a source LOCATION and `packet_key` identifies a packet; do not require uniqueness on `source_ref` (the database has none: only `packet_id` PK and `packet_key` UNIQUE). Live data is 1:1 today (61,718 distinct over 61,718 rows) only because every packet is file-level. Do not lower-case paths without an owner-proven case-folding rule per namespace; never strip `../` textually (reject, or resolve inside an authorized root, symlinks included). Historical rows are never rewritten. `graphify:daily` was NOT run and no database/projection write was made in this entry.

First-insert evidence (read-only SQL on `atlas_packets`):

| Cohort | Rows | Created | Provenance columns |
|---|---|---|---|
| bulk load | 58,303 (+1) | 2026-06-28 08:36:38 to 08:40:44 UTC (one ~4 minute batch) | no `source_kind`; `identity_lane`/`recovery_lane` = canonical; `metadata` keys `hash`, `path`, `mtime`, `file_url`, `backfilled_at`, `identity`, `workspace` (58,249 rows); `payload` keys `lexical_features`, `domain_*`, `ontology_tags`, `topology_materialized` on all |
| orphan registration | 3,294 | 2026-07-20 | `source_kind=codebase_chunk`, `identity_lane=qdrant_chunk`; `register-orphaned-chunks.mjs` (per alias table) |
| RPC registry | 61 (+62 bare keys) | 2026-07-04 | `source_kind=rpc_method`, `source_ref=proto:*` |
| later chunk rows | 58 | 2026-09-01..05 | `source_kind=codebase_chunk` |
| cluster summary | 1 | 2026-08-13 | `ace.cluster.packet.v1` |

So 94.5% of packets were first inserted by ONE bulk load on 2026-06-28, not by the daily pipeline. `sha256` is set on 4,715 rows and `byte_start/byte_end` on 0; `source_path` equals `source_ref` on only 4,652 rows (null on 56,992), so the table records no source revision or span for almost every packet. Writer of the 2026-06-28 batch: NOT IDENTIFIED. Searches for `backfilled_at`/`file_url` found only later consumers (`backfill-atlas-packet-qdrant-links.mjs`, `backfill-qdrant-identity-payload.mts`, `backfill-packets-embeddings-pool.mjs`, `materialize-addressable-packets.mjs`, `audit-qdrant-producer-cohort-census-v1.mjs`); git pickaxe gave candidates only (commits `f6403ee6e0` 2026-06-23 — inspected, no packet writer in its file list — and `6ecc615f89`/`a21e598413` 2026-06-12/13, not inspected). Existing census to reuse before building anything: `scripts/atlas/audit-qdrant-producer-cohort-census-v1.mjs`. Duplicate owners noticed: two copies of `canonical-source-ref.mjs` (`scripts/lib/` and `scripts/atlas/lib/`) and two copies of `materialize-addressable-packets.mjs` (`scripts/atlas/` and `sveltekit-frontend/scripts/atlas/`).

Normalizer parity (measured, FAIL): a session-scratchpad probe ran nine implementations on twelve adversarial inputs (`scripts/lib/canonical-source-ref.mjs`, `scripts/atlas/lib/canonical-source-ref.mjs`, `lineage-field-aliases.mjs`, `adaptive-schema.mjs`, `packages/atlas/lib/packet-identity-bridge.mjs`, `ast-source-ref-key.mjs`, `ast-source-ref-policy.mjs`, `identity/compute-packet-key.ts`, and the materializer's `normalizeKey`, copied verbatim because it is not exported). Findings:
- Same input, up to four different outputs: `src\lib\Foo.ts` becomes `sveltekit-frontend/src/lib/Foo.ts` (two implementations ADD a namespace prefix), `src/lib/foo.ts` (four lower-case it) or `src/lib/Foo.ts` (three preserve case).
- Case-only differences (`SRC/Lib/Foo.ts` vs `src/lib/foo.ts`) are silently merged by four implementations and kept distinct by five.
- `../outside/secret.ts` becomes the in-repo-looking `outside/secret.ts` in three implementations (traversal laundered); none rejects it. `a/../b/x.ts` is untouched by all nine.
- `https://example.com/a.ts` is corrupted to `https:/example.com/a.ts` by four; none rejects it. Windows absolute `C:\Users\james\x.ts` yields four different outputs, one of them the relative-looking `Users/james/x.ts`; `/abs/path/x.ts` loses its leading slash in three. None rejects an external path.

Consequence: identity joins across stores can fail or falsely succeed depending on which normalizer touched the value. The probe is not in the repo (session scratchpad only).

Recording harness (scoped, NOT built): fixture-backed and side-effect free. Stub the `pg` module with a recording fake `Pool` (ESM loader / `--import` hook, so writers that build `new pg.Pool` at module scope run unchanged), feed one fixture input per candidate writer, and capture every proposed INSERT/UPDATE envelope plus each `source_ref` transformation step. Per candidate record: input path, namespace, revision (or `MISSING`), transformations, resulting `source_ref`/`canonical_source_ref`, and whether one source yields several `packet_key` values. Candidates: the 2026-06-28 bulk writer (unidentified), `register-orphaned-chunks.mjs`, `materialize-addressable-packets.mjs` (both copies), `admit-packets-current-live-identity-v1.mjs`, `acp/packet-materializer-pipeline.ts`, `phase-d-ingest-*.mjs`.

Acceptance receipt (targets, NOT achieved; current state in brackets): `first_insert_writer: IDENTIFIED` [NOT IDENTIFIED]; `writer_source_revision: VERIFIED` [not checked]; `source_namespace: EXPLICIT` [no column; implicit in prefix]; `canonical_normalizer_owner: IDENTIFIED` [nine competing implementations]; `normalizer_parity: PASS` [FAIL, measured above]; `packet_key_preserved: PASS` [not tested]; `source_ref_collision_check: PASS` [not tested; no unique constraint]; `database_writes: 0` [0]; `projection_writes: 0` [0].

- [ ] SRCREF-HARNESS-01 Build the recording harness above and run it on each candidate writer with fixtures.
- [ ] SRCREF-ADV-01 Add the adversarial normalizer test suite (backslashes, `./`, `../` rejection, `sveltekit-frontend/` vs `src/` namespaces, same basename in different directories, case-only differences not silently merged, URL/absolute/symlink-outside rejection, two packets from one file keep distinct `packet_key`) against the chosen owner, after SRCREF-DEF-01 selects it.
- [ ] SRCREF-NS-01 Add explicit `source_namespace` and `normalizer_revision` (additive columns or payload fields) only after the first-insert writer and namespace rules are proven; no historical rewrite.

### SRCREF-UNIQUE-01 — unique source key, PostgreSQL 18 DDL proof and idempotent provenance reconcile (2026-10-16; proof only, nothing created)

Method: read-only probes on live `atlas_packets` plus a DDL/MERGE proof on TEMP tables inside a transaction that was rolled back (`BEGIN`..`ROLLBACK`; `atlas_packets` and every other persistent table untouched). Server: PostgreSQL 18.4, `uuidv7()` available. Proof script lived in the session scratchpad.

Feasibility of candidate keys on the live data (61,718 rows):

| Candidate | Duplicates now | Verdict |
|---|---|---|
| `source_ref` (case-preserving) | 0 groups | A unique index would build today |
| `lower(source_ref)` | 0 groups | Case-only collisions do not exist today (still an owner decision, not a default) |
| `canonical_source_ref` | 263 groups / 526 rows | CANNOT be a unique key: distinct paths already collapse to one canonical value (the lower-case + prefix-strip hazard, confirmed in data) |
| `source_ref_key` | 211 groups / 434 rows | Not a key either |
| `packet_key` | 0 (UNIQUE already enforced) | Stays the packet identity |

Path-safety CHECK dry run against live rows: leading slash 0, backslash 0, `..` segment 0, leading `./` 0, double slash 0 — but 62 rows have a scheme-like prefix (`proto:` 61, `cluster:` 1) and 1 row has an empty/blank `source_ref`. Those 62 are not file paths (RPC registry and cluster-summary packets); they need their own namespace, not a CHECK that fails the whole constraint. A file-path rule must therefore be scoped (for example `WHERE source_namespace = 'repo'`) or those rows classified first. Sample ordering also surfaced non-path values stored as `source_ref` (for example `1`); count not measured.

Proposed shape (additive; NOT created):
- New table `atlas_source_locations`: `UNIQUE (source_namespace, source_ref)` with case-preserving `source_ref`, `source_revision` (sha256 of exact bytes, nullable until verified), `normalizer_revision` (`source-ref-v1`), and provenance (`producer_id`, `producer_revision`, `run_id`, first-seen time). The surrogate id, if wanted, uses `uuidv7()` (time-ordered, per the UUID policy) and never replaces `packet_key` or `source_ref`.
- `atlas_packets` keeps `packet_key UNIQUE`; a nullable `source_location_id` (FK) is filled by the reconcile. Do NOT add `UNIQUE (source_ref)` to `atlas_packets`: one source file may legitimately yield several packets (61 packets already carry a `function_symbol`).
- Production sequence (manual SQL sidecar under `drizzle/manual/`, `IF NOT EXISTS`, listed in `drizzle/sidecar-migrations.json`, never `drizzle-kit push`): pre-flight collision query must return 0; `CREATE UNIQUE INDEX CONCURRENTLY` (outside a transaction); `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE USING INDEX` (proved: PostgreSQL renames the index to the constraint name); `ADD CONSTRAINT ... CHECK (...) NOT VALID` then `VALIDATE CONSTRAINT` (proved). Backups and explicit operator approval first.

Idempotent provenance reconcile (proved on temp tables): load observed `(namespace, source_ref, source_revision, normalizer_revision)` into a staging table; classify by LEFT JOIN as `NEW`, `SAME` (no-op) or `REVISION_CONFLICT` (never overwritten; recorded in a rejection ledger for compare-and-swap or a new qualified representation); apply only `NEW` rows with `MERGE ... WHEN NOT MATCHED THEN INSERT ... RETURNING merge_action()`. Proved outcomes: a duplicate `(namespace, source_ref)` raises a unique violation, a `../` path raises a check violation, the first MERGE inserted exactly the NEW row, and the immediate re-run returned 0 rows (idempotent). The reconcile emits a receipt with counts of NEW/SAME/CONFLICT/rejected and `writesPerformed`.

- [ ] SRCREF-UNIQUE-01 Owner decisions: namespaces (`repo`, `frontend`, `rpc`, `cluster`, ...), whether case-only differences are one source (and for which namespace), and how the 62 non-path and 1 blank `source_ref` rows are classified. Then draft the sidecar SQL, rehearse on a restored copy (not the live DB), and only then request approval.
- [ ] SRCREF-RECONCILE-01 Implement the staging/classify/MERGE reconcile as a dry-run-first script with the receipt above, after SRCREF-HARNESS-01 identifies the writers that feed it.

### SRCREF-UNIQUE-01 progress and SRCREF-SCAN-01 design (2026-10-16)

Draft created, NOT applied: `sveltekit-frontend/drizzle/manual/20261016_atlas_source_locations_DRAFT.sql` (registered in `drizzle/sidecar-migrations.json` as `planned_sidecar`, +9 lines; live DB confirmed to have no `atlas_source_locations`). Contents: `atlas_source_locations` (`UNIQUE (source_namespace, source_ref)`, case-preserving, namespace slug CHECK, blank/padded CHECK, sha256 revision-shape CHECK, repo-namespace-only path-safety CHECK, `uuidv7()` surrogate, `normalizer_revision`, producer provenance) and the append-only `atlas_source_location_conflicts` ledger. Rehearsal on PostgreSQL 18.4 in a rolled-back transaction: 2 tables / 10 columns in-transaction; 12 of 12 invalid inserts rejected (duplicate, `../`, leading `/`, backslash, URL, drive path, `./`, `//`, blank, padded, upper-case namespace, malformed revision); case-only twin and a `proto:` id in namespace `rpc` accepted (no case folding in DDL); UUID version nibble 7; 0 tables afterward. `atlas_packets` is not altered; the `source_location_id` link is a later, separately reviewed sidecar. `audit-contract-map.mjs` was NOT run against the new registry entry.

- [ ] SRCREF-APPLY-01 Operator approval to apply the draft to the live database (backup first; re-run `CREATE ... IF NOT EXISTS` to prove idempotence; confirm 2 tables and the constraint list). Until then the table does not exist and nothing reads it.

SRCREF-SCAN-01 — light repo-scan recommendation pass tied to Daily Graphify (design recommendation, not built):
- Placement: an ADVISORY, dry-run step at the end of `graphify:daily` (same posture as `graphify-daily-ace-packet-step-v1.mjs`: receipt only, never part of the apply chain, never blocking), after the admission gate. A failing step is recorded as an explicit null with a reason and continues.
- Input: `git ls-files -z` (tracked set; avoids `node_modules`, `.tmp`, vendored trees) plus an optional untracked-not-ignored list. Cache `(path, size, mtime)` to skip re-hashing unchanged files; SHA-256 the exact bytes only for changed files, honoring the existing 5 MB / UTF-8 / read-error skip classes (skipped files are listed, not silently dropped).
- Normalize with the single owner chosen by SRCREF-DEF-01. Until that owner exists, record only the raw repository-relative path and reject unsafe forms; do not choose among the nine existing normalizers.
- Classify read-only against `atlas_source_locations` (report `TABLE_ABSENT` until applied) and `atlas_packets`: `NEW`, `SAME`, `REVISION_CONFLICT`, `FILE_WITHOUT_PACKET`, `PACKET_WITHOUT_FILE`, `NON_PATH` (proto:/cluster:), `UNSAFE_PATH`. Recommendations are counts plus a bounded top-N list, written to a checksummed receipt under `docs/reports/` and offered to the kanban/gate lists as advisory text.
- Writes: none by default. A separate `--apply` (operator-gated) would run the MERGE of `NEW` rows and append conflicts to the ledger; revision conflicts are never overwritten.
- Light by construction: no model calls, no GPU, no embeddings, no network; target well under a minute; bounded output. It observes identity; it never mints or repairs packet identity, and HLL telemetry may count its observations but never decides whether two paths are the same source.
- [ ] SRCREF-SCAN-01 Build the dry-run pass above after SRCREF-DEF-01 (owner) and SRCREF-APPLY-01 (table) so it has something authoritative to classify against; start with `git ls-files` + hashing + classification against `atlas_packets` only if the table is not yet applied.

## Stop boundary (unchanged)

Stop after: proof-ladder runner, global Graphify lock, feature-envelope lock/concurrency proof,
feature-envelope deterministic bounded-write proof, latent diagnostic, bounded resumable latent
implementation + tests, one foreground Graphify proof run, atomic artifact publication proof,
Studio read-only lane visibility. Do not proceed into RAPIDS installation, cuVS/cuGraph/PageRank
consolidation, KMeans/SOM/Neo4j GDS changes, Qdrant collection rebuilds, symbol/packet/tree-node
identity migration, Kafka integration, or automatic agent recommendations.

## GRAPHIFY-DAILY-CONTRACT-RECONCILIATION-02 — handoff (2026-10-16, read-only; nothing applied)

Receipt: `docs/reports/graphify-daily-contract-reconciliation-02-20261016.json` (sha256 `4787d3162edc33a300515b55cb4fb9d577797b0e50ad72c39120168f635f23dd`).

- [x] **Semantic evidence is no longer hash-only on demand.** `phase109b-repository-provenance-workflow.mts --live-embedder` calls Ollama `/api/embed` (`embeddinggemma:latest`); any failure throws and is counted as `failedEmbeddings` (no hash fallback). `OLLAMA_HOST=0.0.0.0` is normalized to 127.0.0.1:11434. Semantic stage is PROVEN only when every sample is a real, non-deterministic embedding; new `semantic.evidenceClass` = `NONE | HASH_SMOKE | LIVE_SAMPLE_PARTIAL | LIVE_SAMPLE_PROVEN` (sample-level, never a full-cohort proof).
- [x] **Entry guard** added to that script (it ran `main()` on import). Provenance specs 5/5 pass; the spec now compares the projection collection to `CANONICAL_QDRANT_COLLECTION` instead of a stale literal.
- [x] **Live proof (8 files, scratch output, not the authoritative receipt):** 8/8 `embeddinggemma:latest` via ollama, 0 failed, `semantic` PROVEN. A 24-file live run was launched to scratch and its result was NOT recorded here.
- [x] **Daily opt-in (committed):** `GRAPHIFY_LIVE_EMBEDDER=1` makes `run-graphify-daily-startup.mjs` forward `--live-embedder`; default stays hash smoke. Committed state of that file only carries this one-line opt-in; another session's uncommitted removal of the legacy fallback path in the same file was deliberately left out.
- [ ] **`run-graphify-daily-admission-order.spec.mjs` test 4** pins the removed guard name (`allowFallback`). Working-tree fix (assert the invariant: no fallback script, exit 1) is uncommitted because it only passes together with the other session's startup edit. Land both together.
- [ ] **OWNER DECISION: which Qdrant collection is canonical for `semantic_768`?** Live: `codebase_chunks_768` 328,348 points, `codebase_chunks_768_v2` 52,816, no alias; Postgres `content_embedding_768` populated 219,998. `vector-index-registry.ts` contradicts itself (one note: `_v2` canonical production; another: `_v2` challenger, plain name declared projection). `embedding-contract-768.ts` constant was flipped to `_v2` in the working tree by another session (uncommitted; HEAD = plain). Do not rename, migrate or rebuild vectors until decided.
- [ ] **Daily write surface (traced):** before the admission gate only local files/dry plans/build/startup lock (target of `feature-recommendations:refresh` not audited); after it a Postgres `graphify_runs` lifecycle row and the apply chain (dedup apply, material, phase8 fanout, qdrant tag-mirror, feature-map-sync); native structural and NES packets apply are flag-gated. `graphify:daily:dry` side effects not audited.
- [ ] **Why the daily run "errors":** by design it stops at projection admission (`NOT_SAFE_TO_PROJECT`, 7/11 predicates below PASS in the 11:37 PDT audit; that audit predates the 15:24 ordinal-map PASS, so rerun the read-only audit). The 11:28 receipt (run `c2dd8f24-ae69-4283-ab91-caf2cff46971`, revision `c9ef99d42c`) predates these fixes and is still the authoritative daily receipt (hash embedder, PARTIAL).
- [ ] **MTP launcher preflight:** real GGUF headers: Ornith `qwen35` width 4096 vocab 248,320; E2B `gemma4` 1536 vocab 262,144; E4B assistant `gemma4-assistant` width 256, `embedding_length_out` 2560, vocab 262,144. The launcher's byte scan returns the same widths and would reject both pairings, but it takes the first `.embedding_length` match (order-dependent; Gemma 4 also has `embedding_length_per_layer_input`) and has no tokenizer check. No E4B target exists locally; `.env` `MTP_DRAFT_MODEL` (`.tmp/atomic-mtp/...Q4_K_M.gguf`) does not exist and `ENABLE_MTP_DRAFTER=true` appears twice. Launcher not executed (its success path restarts :8090).
- [ ] Next gate unchanged: `GRAPHIFY_RUN_WRITER_AND_SOURCE_BINDING_READBACK` (source-binding observation: 25,468 enumerated = 25,361 bound + 107 skipped; receipt `sourceCount` 25,542 is 74 higher, cause not established). Safe next command: `GRAPHIFY_LIVE_EMBEDDER=1 npm run atlas:phase109b:workflow:dry -- --output-dir=<scratch>`.
