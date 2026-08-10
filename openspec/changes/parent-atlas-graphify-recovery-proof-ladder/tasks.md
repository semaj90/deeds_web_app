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

**Not done** (per the addendum's B1/B3/B4, explicitly out of scope for this pass): the full
`CodebaseGraphStageReceipt` structured JSON format (only inline console timing was added), no
correction of any stale `npm run graphify:daily` documentation claims.

## Stop boundary (unchanged)

Stop after: proof-ladder runner, global Graphify lock, feature-envelope lock/concurrency proof,
feature-envelope deterministic bounded-write proof, latent diagnostic, bounded resumable latent
implementation + tests, one foreground Graphify proof run, atomic artifact publication proof,
Studio read-only lane visibility. Do not proceed into RAPIDS installation, cuVS/cuGraph/PageRank
consolidation, KMeans/SOM/Neo4j GDS changes, Qdrant collection rebuilds, symbol/packet/tree-node
identity migration, Kafka integration, or automatic agent recommendations.
