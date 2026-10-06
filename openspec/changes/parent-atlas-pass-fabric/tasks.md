# Parent Atlas Pass Fabric — Detailed Tasks

**STATUS (2026-08-11)**: PF0-PF3 verified DONE via direct source read of
`sveltekit-frontend/src/lib/server/analysis/{worker.ts,analysis-jobs.ts}`.
Skip to PF4. Do not re-implement claimBatch/gate-fill/LISTEN-NOTIFY — they
already work as specified and correctly.

**Verification addendum (2026-09-27)**: `claimBatch` previously coerced a
zero/invalid limit to `LIMIT 1`, despite the worker currently skipping zero
free slots. It now returns an empty batch before querying for non-positive or
non-finite capacity. The isolated mocked boundary suite passes 6/6, including
four-row/one-query and invalid-capacity cases. This is application/fixture
proof only; PostgreSQL locking, concurrent workers, and notification latency
remain unproven and no live database was contacted.

## P0 UPDATE (2026-08-11, later same day): identity collision is worse than "disconnected" — it's a 3-WAY FORMAT SPLIT

Earlier framing was "a resolver exists (`packet-key-builder.ts`) and a
writer exists (`semantic-packet-writer.ts` / the newer live-wired
`analysis-pass-results.ts` ledger), they're just not connected." That's
still true, but a third scan (reviewing parallel work that landed mid-session
from another agent/process) found the actual live picture is worse:
**at least three incompatible `packet_key` formats coexist in live code**,
not two:

| Format | Example | Source | Live usage |
|---|---|---|---|
| `pkt:<workspaceId>:<32hex>` | `pkt:default:7ebdc697...` | `compute-packet-key.ts` | **Orphaned** — zero real callers (confirmed session 198) |
| `<64hex>` raw, no prefix | `a3f9...` (64 chars) | `packet-key-builder.ts` | Live — 2 real callers (`mcp-tool-implementations.ts`, `tasks/semantic-packets.ts`), barrel-exported |
| `ace:packet:<12hex>` | `ace:packet:c115e487d04d` | Unclear single origin — used across `ace-packet-store.ts`, `feature-context-cache.ts`, `phase110-end-to-end-retrieval-flow.ts`, `acp/packet-assembler.ts`, `ai/ace-builder.ts`, `ai/engram-registry.ts`, and more (10+ files from one quick grep, likely more) | **Live, high-volume** — appears to be the de facto dominant format across the ACE subsystem by file count, and is what `docs/reports/pos-concept-tagging-lane-proof.json`'s real proof run actually used (`packetKey: "ace:packet:c115e487d04d"`) |

**This changes the P0 remediation shape.** It is no longer "wire resolver A
into writer B." It is: **decide which of (at least) three schemes is
canonical, or define a new `PacketIdentityV1` that all three collapse into,
then migrate every producer and consumer to it.** The `ace:packet:` format
being both highest-volume AND the one real proof data (POS/concept-tagging
lane) actually emitted suggests it may be the pragmatic default to
standardize on — but that's a judgment call requiring:
1. Find whatever generates `ace:packet:<12hex>` — likely a short-hash
   truncation of something, not yet traced to its source function this
   session (unlike the other two, whose generator functions were read in
   full). **Next session: `grep -rn "'ace:packet:'" src/lib/server` to find
   the actual construction site(s) — plural, since 10+ files use the
   prefix, worth checking if they all construct it the same way or if this
   is itself several ad-hoc constructions sharing a string prefix by
   convention rather than one shared function.**
2. Check whether `ace:packet:<12hex>` derivation is deterministic (same
   source → same key) or contains any non-deterministic component (random,
   timestamp-based) — if the latter, it CANNOT be the canonical scheme
   regardless of usage volume, since PF-G0's core requirement is
   determinism.
3. Only after 1-2: decide canonical format, write a migration plan for the
   two/three non-canonical schemes' existing callers.

**This is a decision for a fresh session with full context** — it's a
real architectural choice (which identity scheme wins, or whether to unify
under a new one), not a mechanical fix. Flagging here so it's not
re-discovered as if new next time.

## FINAL CORRECTION (2026-08-11, same day, later): do NOT freeze PF4 semantics yet

Full detail: `memory/SESSION-198-FINAL-CORRECTIONS-PF4-SEMANTICS.md`. Short
version — the live pass ledger's dedup rule ("same pass_key → reuse
receipt, no new row") is only correct for **deterministic** passes. For
**stochastic** passes (confirmed: `summarization`, 5 different outputs from
identical input), the same identity legitimately produces multiple valid
executions — the current rule would silently return stale output for
those. Needs an `executionSemantics` field
(`deterministic_idempotent | stochastic_history | observed_event`) on
`AtlasPassDefinition`, resolved BEFORE the partial UNIQUE index (already
applied, safe for legacy NULL-revision rows, but NOT proven correct once
new rows start populating revisions — could reject legitimate future
stochastic executions).

**Corrected gate order (supersedes the P0→PF4→L2A jump stated above)**:
```
1. PF4C — prove pass_key semantics
2. Add executionSemantics enum to AtlasPassDefinition
3. Separate deterministic replay from stochastic execution history
4. Decide fate of the partial UNIQUE index
5. Define analysis_pass_current materialization (uniqueness belongs HERE,
   not on the append-only analysis_pass_results table)
6. Move/confirm HLL breadth telemetry as a derived projection, NOT owned by
   the canonical AtlasEvent contract (separate boundary violation found in
   event-hypergraph-contract.ts's telemetry extension)
7. Live Valkey HLL materializer
8. Exact baseline receipt
9. Recommendation promotion guard
```
Also flagged: `atlas/tensors/telemetry-breadth-contract.ts` and
`latent-lod-contract.ts` naming/location risk taxonomy collision with
model-space concepts (MHA/KV/SSM/MLA latent state) — rename/relocate, not
urgent but should happen before more code references these paths.

## PF4C RESOLVED (2026-08-11, continued): pass_key semantics proven, precisely

Read `buildAnalysisPassInputHash()` exactly (analysis-pass-results.ts:63-83):

```typescript
const canonical = {
  analysisJobId: input.analysisJobId,   // ← per-job UUID
  evidenceId: input.evidenceId,          // ← per-job
  caseId: input.caseId ?? null,
  jobType: input.jobType,
  packetKey: input.packetKey ?? null,
  sourceRef, sourceRevision, workspaceRevision, representationRevision,
  family, passName, passRevision, producerId, producerRevision,
  backend, backendVersion, device,
};
return sha256Hex(stableStringify(canonical));  // → pass_key
```

**Finding**: `analysisJobId` and `evidenceId` are both hashed into
`pass_key`. Since `analysisJobId` is a unique UUID per enqueued job,
**`pass_key` is currently scoped to a single job execution, not to a
logical `(packetKey, sourceRevision, passName, passRevision, inputHash)`
identity that could be shared across multiple different jobs computing
"the same" pass.**

**Concrete consequence**: two different jobs (different `analysisJobId`)
running `jobType='summarization'` against the identical packet/content get
**different `pass_key` values** and both insert as new rows — zero dedup
across jobs. This is also why the earlier duplicate-classification query
had to `GROUP BY (packet_key, pass_type, input_hash)` rather than
`pass_key` to find the 1,272 logical duplicate groups — `pass_key` itself
doesn't group them, because job identity is baked into the hash. The
POS-tagging proof run's `inserted: false, rowId: 11118` only demonstrates
"re-running the exact same job/evidenceId pair is idempotent" — it does
NOT demonstrate "the same logical pass computed by two different jobs
dedupes," which is the actual property PF9 (incremental eligibility) needs.

**This directly explains and justifies Correction 1's proposed fix
(`executionSemantics` on `AtlasPassDefinition`) — but sharpens it**: the
real gap isn't just "some passes are stochastic" — it's that **the current
`pass_key` formula structurally cannot express logical-pass identity at
all**, regardless of whether the pass is deterministic or stochastic,
because job/evidence identity always wins the hash. Two fixes are needed,
not one:

1. **Separate `PassIdentity` from `PassExecution` hashing** (as designed
   throughout this whole session's memory files): compute TWO hashes, not
   one —
   ```typescript
   // Logical identity — NO job/evidence-specific fields
   passIdentityHash = sha256({ packetKey, sourceRevision, passName,
     passRevision, inputHash })
   // Execution identity — the current formula, keeps analysisJobId/evidenceId
   passExecutionHash = sha256({ analysisJobId, evidenceId, ...everything })
   ```
   Store both on each row. `pass_key` (current column) becomes the
   execution-level idempotency key (correctly prevents duplicate-job-retry
   inserts, which is a real and worth-keeping property) — but eligibility/
   dedup queries (PF9) must query by the NEW `passIdentityHash`, not
   `pass_key`.
2. **Then** apply `executionSemantics` (Correction 1) to decide, for a
   given `passIdentityHash`, whether a NEW execution should be
   short-circuited (deterministic_idempotent) or always allowed
   (stochastic_history/observed_event) when one already exists for that
   identity.

**PF4C status**: `PASS_KEY_SEMANTICS_PROVEN = true`: `pass_key` is the
job/execution retry key; `pass_identity_hash` is a separate logical identity.
The logical identity is now emitted only when the caller supplies a stable
`inputHash`; an absent/blank input hash remains `NULL` instead of silently
falling back to the job-scoped execution hash. `PASS_IDENTITY_PROVEN` applies
only to explicitly qualified inputs; population and consumer coverage remain
separate open gates.

## STEPS 2-3 APPLIED (2026-08-11, same day): executionSemantics wired

- `src/lib/server/db/schema/analysis-pass-results.ts`: added
  `passIdentityHash` column (additive, nullable) + `buildAnalysisPassIdentityHash()`
  (logical fields only, no job/evidence identity) + `PassExecutionSemantics`
  type + `KNOWN_PASS_EXECUTION_SEMANTICS` registry
  (`ast_symbols`/`pos_tagging`/`pos-concept-tagging-lane.v1` = deterministic,
  `summarization`/`entity_extraction`/`forensics` = stochastic, unlisted
  defaults to `observed_event` — the safe default, never silently
  short-circuits a real execution) + `resolveExecutionSemantics()`. Wired
  into `normalizeAnalysisPassLedgerInput()` so every new row gets both hashes.
- **Live DB**: `ALTER TABLE analysis_pass_results ADD COLUMN IF NOT EXISTS
  pass_identity_hash TEXT` + matching index — applied, additive, verified
  via `\d analysis_pass_results`.
- `src/lib/server/analysis/analysis-pass-results.ts`'s
  `recordAnalysisPassResult()`: now actually consults
  `resolveExecutionSemantics(input.passName)` before inserting. For
  `deterministic_idempotent` passes, checks for an existing row by
  `passIdentityHash` and reuses it (`inserted: false`) instead of inserting.
  For `stochastic_history`/`observed_event`, always inserts a new row
  (previous behavior, now correctly the explicit default rather than the
  only behavior).
- Typecheck: zero new errors (one pre-existing `TS2352` at a shifted line
  number, confirmed identical to the pre-session baseline).
- **Manual migration file** (`drizzle/manual/analysis_pass_results.sql`,
  the "mirrors live DB shape" contract) updated to match.

**Not yet done**: `KNOWN_PASS_EXECUTION_SEMANTICS` is a small hardcoded
registry, not yet the full `AtlasPassDefinition` (owner/truthClass/
executionClass/requires/invalidatesOn) design from earlier session-198
memory files — this is intentionally the minimal slice needed to unblock
correct replay behavior now; the fuller registry is still PF5/step-9+ work.

## STEP 4 APPLIED (2026-08-11, same day): partial UNIQUE index dropped

**Decision**: `DROP INDEX analysis_pass_results_identity_uq`. Reasoning:
- It enforced uniqueness on `(packet_key, source_revision, pass_type,
  pass_revision, input_hash)` — the wrong key composition (predates
  `passIdentityHash`, uses `pass_type` not `passName`/`passRevision`
  consistently) and the wrong surface (the append-only history table,
  not a materialization).
- It would have silently started rejecting legitimate stochastic
  re-executions the moment the live worker began populating
  `source_revision`/`pass_revision` broadly (currently only 3 rows had
  both populated — checked live before dropping, confirmed minimal blast
  radius).
- A blind DB `UNIQUE` constraint structurally cannot be execution-semantics
  aware (deterministic vs. stochastic vs. observed-event) — that logic now
  correctly lives in `recordAnalysisPassResult()`'s application-level check
  (step 2-3, applied above), not in a constraint.

**Verified live**: `\d analysis_pass_results` — index absent, zero errors.
Uniqueness enforcement now correctly deferred to step 5
(`analysis_pass_current` materialization), which can consult
`resolveExecutionSemantics()` when deciding what counts as "the current
eligible row" per logical `passIdentityHash` — something a DB constraint
alone cannot express.

**Remaining in the corrected order**: steps 5-9 — `analysis_pass_current`
materialization view, HLL/event-hypergraph boundary fix (Correction 3),
live Valkey HLL materializer, exact baseline receipt, recommendation
promotion guard.

## PF0: Audit Current Worker Behavior (30m) — ✅ DONE

**Findings** (worker.ts:176-234, analysis-jobs.ts:171-240):
- `pollOnce()` iterates `stageConfig` (4 job types today), computes
  `freeSlots = concurrency - gate.activeCount - gate.pendingCount`, calls
  `claimBatch(jobType, freeSlots)` — full batch claimed atomically.
- `claimBatch` uses `WITH picked AS (... FOR UPDATE SKIP LOCKED) UPDATE ... RETURNING`
  — textbook correct, no race.
- `POLL_MS = 30_000` (fallback only) + `pg_notify('atlas_analysis_jobs', ...)`
  on enqueue + `LISTEN` in `startNotificationListener()` — wake is near-instant.
- Crash recovery: `resetStaleJobs(10)` on `startWorker()`.
- Backoff: exponential 2s→32s on ECONNREFUSED / 57P03, rate-limited logging.
- Gap: only 4 job types wired (`entity_extraction`, `code_feature_registry`,
  `forensics`, `summarization`). No structural/linguistic/semantic pass names.
- Gap: no per-pass result ledger — `analysis_jobs.result` is job-lifecycle
  output, not a (packet_key, source_revision, pass_name, pass_revision,
  input_hash)-keyed idempotency record.

## DB-READY-TRISTATE-01: Startup Readiness Is Not a Repair Signal

- [ ] DB-READY-TRISTATE-01 — use one shared PostgreSQL readiness classifier
  for health routes and agentic repair admission. `STARTING` (including
  SQLSTATE `57P03` / `pg_isready` rejection) must remain retryable and must not
  create a repair task; successful query is `HEALTHY`; terminal connection
  failure is `UNAVAILABLE`.
  **Current evidence (2026-10-04):** implementation is wired through
  `sveltekit-frontend/src/lib/server/db/readiness.ts`,
  `sveltekit-frontend/src/routes/api/health/database/+server.ts`,
  `sveltekit-frontend/src/routes/api/health/ready/+server.ts`, and the
  repair-loop startup guard. Focused hermetic suites pass 24/24 across
  the classifier, both health routes, and repair-task suppression. This proves
  the code contract under injected states, not a live PostgreSQL crash-recovery
  event. Status: `WIRED_FOCUSED_TESTS_PASS`; no live outage was induced and no
  repair or database writes were performed. Keep the task open until the
  deployment/runtime health readback confirms the intended stable JSON and
  retry semantics without creating repair work during a real startup window.
  **Live readback (2026-10-04):** GET `/api/health/database` returned stable
  `healthy` / `OK`, SQLSTATE null, and both pools healthy. GET
  `/api/health/ready` initially returned 500 because an absent optional Engram
  URL was interpolated into a global `fetch`. The route now uses SvelteKit's
  request-scoped fetch, guards missing URLs, and turns rejected/timeout probes
  into fallback states; the ready response now returns 200 with PostgreSQL
  healthy and optional Engram unavailable. The two health route suites pass
  6/6. This is current healthy-state readback only; no live `57P03` startup or
  repair-suppression event was induced.

## PF0-OLD: Audit Current Worker Behavior (30m)

**Goal**: Establish baseline.

**Steps**:
1. Read `src/lib/server/atlas/analysis-worker.ts` pollOnce() loop
2. Count job types, gates, concurrency limits
3. Measure time per poll: `POLL_MS = 3000`
4. Check Postgres queries: HOW are jobs claimed?
5. Report:
   - Current max throughput (jobs/min)
   - Gate utilization (actual vs capacity)
   - Polling overhead

**Acceptance**: Baseline numbers captured.

---

## PF1: Implement claimBatch(jobType, freeSlots) (1h)

**Goal**: Replace single-claim with atomic batch claim.

**File**: `src/lib/server/atlas/analysis-worker.ts`

**Change**:

```typescript
// OLD (pollOnce)
for (const jobType of JOB_TYPES) {
  const job = await db.query(`SELECT * FROM analysis_jobs WHERE status='queued' AND job_type=$1 LIMIT 1`, [jobType]);
  if (job) executeJob(job);
}

// NEW (claimBatch)
async function claimBatch(jobType: JobType, limit: number) {
  const sql = `
    WITH picked AS (
      SELECT id FROM analysis_jobs 
      WHERE status = 'queued' AND job_type = $1 
      ORDER BY created_at ASC 
      LIMIT $2 
      FOR UPDATE SKIP LOCKED
    )
    UPDATE analysis_jobs j SET status = 'running', started_at = NOW(), updated_at = NOW()
    FROM picked WHERE j.id = picked.id 
    RETURNING j.*;
  `;
  return db.query(sql, [jobType, limit]);
}

// In pollOnce
for (const jobType of JOB_TYPES) {
  const freeSlots = cfg[jobType].concurrency - cfg[jobType].activeCount;
  if (freeSlots > 0) {
    const jobs = await claimBatch(jobType, freeSlots);
    for (const job of jobs) void executeJob(job);
  }
}
```

**Acceptance**:
- [x] Single Postgres query claims all free slots (source + mocked boundary proof; no live PostgreSQL claim)
- [x] Test: 4 free → 4 jobs claimed (not 1)
- [x] Test: 0 free → 0 jobs claimed (no error; invalid capacity short-circuits before DB call)

---

## PF2: Fill All Free Concurrency Slots (30m)

**Goal**: Each gate immediately filled to capacity.

**Change**: Update gate tracking in executeJob callback.

**Acceptance**:
- [ ] embed_gate: 0/3 → 3 jobs dispatched in one pollOnce call. Still open:
      the current `stageConfig` has no embedding job type, and this lane cannot
      be added until semantic writer/provenance ownership is authorized.
- [x] entity_gate: 0/2 → 2 jobs dispatched. `analysis-worker-wakeup.spec.ts`
      runs the actual poll loop with mocked queue/gate boundaries and confirms
      two entity jobs are admitted in one poll; job handlers are not invoked.
- [x] forensics_gate: 0/4 → 4 jobs dispatched. The same fixture confirms four
      forensics jobs are admitted in one poll; job handlers are not invoked.

---

## PF3: Add pg_notify/LISTEN Wake (1h)

**Goal**: Eliminate 3s polling latency.

**File**: `src/lib/server/atlas/analysis-worker.ts` + enqueue path

**Change**:

```typescript
// On enqueue (INSERT analysis_jobs)
await db.query(`
  INSERT INTO analysis_jobs (status, job_type, ...) VALUES (...)
  RETURNING id;
  SELECT pg_notify('atlas_analysis_jobs', json_build_object('job_type', $1)::text);
`, [jobType, ...]);

// Worker listener
db.on('notification', (msg) => {
  if (msg.channel === 'atlas_analysis_jobs') {
    void pollOnce(); // Wake immediately
  }
});

// Fallback: still poll every 30s
setInterval(pollOnce, 30_000);
```

**Acceptance**:
- [ ] Job enqueued → worker wakes in <100ms
- [x] Fallback poll fires every 30s. `sveltekit-frontend/tests/lane-contracts/analysis-worker-wakeup.spec.ts`
      starts the real worker with fake timers and verifies no second poll at
      29,999 ms and a poll at 30,000 ms. Job claims and PostgreSQL listener
      boundaries are mocked; this proves the timer contract, not live enqueue
      latency or PostgreSQL delivery. PF3's live wake-latency criterion remains
      open above.

---

## PF4: Add AnalysisPassResult Durable Ledger (1h) — CORRECTION: TABLE ALREADY EXISTS, ORPHANED

**Live discovery (2026-08-11)**: `analysis_pass_results` already exists in Postgres
(confirmed via `\d analysis_pass_results`) with columns: `id (bigint)`, `pass_key`,
`packet_key`, `source_ref`, `feature_id`, `pass_type`, `status`, `input_hash`,
`prompt_hash`, `model_name`, `temperature`, `max_tokens`, `output (jsonb)`,
`scores (jsonb)`, `index_push (jsonb)`, `provenance (jsonb)`, `created_at`,
`updated_at`. Indexes on `packet_key`, `(source_ref, feature_id)`,
`(pass_type, status)`, GIN on `output`/`provenance`.

**Gap found**: `grep -r "analysis_pass_results" sveltekit-frontend/src` → **zero
callers**. Same orphaned-table pattern as `atlas_packets` (Layer 2 Gate 1,
session 197) — schema exists, nothing reads or writes it.

**Also missing for idempotency**: no UNIQUE constraint (so duplicate
pass-attempts aren't rejected at the DB level), no `source_revision` /
`pass_revision` columns (so staleness can't be detected — `pass_type` +
`input_hash` alone can't tell "this packet changed since last run" from
"this is the same content, re-verify").

**My draft migration file** (`drizzle/manual/analysis_pass_results.sql`) used
different column names (`pass_name` vs `pass_type`, `producer`/`producer_revision`
not present live, `source_revision`/`pass_revision` not present live) — do NOT
apply it as-is; it would create a second incompatible ledger. Attempted apply
was a safe no-op: `CREATE TABLE IF NOT EXISTS` skipped (table already existed),
the two follow-on `CREATE INDEX` statements failed harmlessly (referenced
columns that don't exist on the live table) — zero schema damage.

**Real PF4 task, corrected**: `ALTER TABLE analysis_pass_results` to add
`source_revision TEXT`, `pass_revision TEXT`, and a `UNIQUE(packet_key,
source_revision, pass_type, pass_revision, input_hash)` constraint — extend
the existing table rather than create a parallel one. Then find/build the
writer (currently zero callers) before PF9 eligibility can use it.

**APPLIED (2026-08-11)**: `ADD COLUMN IF NOT EXISTS source_revision TEXT` and
`pass_revision TEXT` — both nullable, additive, zero data loss risk. Live now.

**BLOCKED — cannot add UNIQUE constraint yet**: pre-check found
`11076 total_rows`, `4173` duplicates on `(packet_key, source_revision,
pass_type, pass_revision, input_hash)`. Since the two new columns are NULL
on every existing row, and Postgres UNIQUE constraints treat NULL as never-
equal-to-NULL, adding the constraint now would (a) fail to reject the 4,173
existing duplicates it's meant to prevent, since they'd all differ only in
NULL columns that never collide, and (b) still let *future* NULL-revision
rows duplicate freely. **Do not add the UNIQUE constraint until**: either
(1) backfill `source_revision`/`pass_revision` on existing rows from whatever
governs packet identity, and dedupe the 4,173 conflicts (keep newest by
`updated_at`?), or (2) decide NULL revision means "legacy, no dedup" and only
enforce uniqueness on rows where both are NOT NULL (partial unique index:
`CREATE UNIQUE INDEX ... WHERE source_revision IS NOT NULL AND pass_revision
IS NOT NULL`). Recommend option 2 — lower risk, doesn't touch existing rows,
and any writer going forward should populate both fields anyway.

**APPLIED (2026-08-11)**: `CREATE UNIQUE INDEX analysis_pass_results_identity_uq
ON analysis_pass_results (packet_key, source_revision, pass_type, pass_revision,
input_hash) WHERE source_revision IS NOT NULL AND pass_revision IS NOT NULL;`
— live now. This is a **partial** index (only fires when both new revision
columns are populated), so it does NOT touch the 4,173 legacy NULL-revision
rows — no false invariant was enforced. Safe as applied.

## PF4 — DURABLE PASS RESULT IDENTITY (rewritten 2026-08-11, third pass)

**Invariant changed**: "one row per pass" → **logical pass identity ≠
execution attempt**. This table is an append-only execution ledger, not a
single-materialization cache. Do not force uniqueness onto it directly.
Replay behavior must be driven by pass definition semantics:
`deterministic_idempotent | stochastic_history | observed_event`.
Only deterministic idempotent passes may reuse an existing receipt as a
no-op. Stochastic history passes may create multiple legitimate executions
for the same logical identity.

```typescript
type PassIdentity = {
  packetKey: string;
  sourceRevision: string;
  passType: string;
  passRevision: string;
  inputHash: string;
};

type PassExecution = {
  executionId: string;
  identity: PassIdentity;
  attempt: number;
  backend?: string;
  backendVersion?: string;
  modelName?: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'failed';
};
```

**DONE**
- [x] existing table discovered (`analysis_pass_results`, 11,076 rows)
- [x] orphaned-table/writer condition discovered (zero callers in `src/`)
- [x] `source_revision` column added (nullable, additive)
- [x] `pass_revision` column added (nullable, additive)
- [x] partial unique index applied — `WHERE source_revision IS NOT NULL AND
      pass_revision IS NOT NULL`, safe no-op on the 11,076 legacy rows
- [x] **PF4A classify historical duplicates** — full-population query (not
      just top-N eyeball):
      ```sql
      WITH dup_groups AS (
        SELECT packet_key, pass_type, input_hash, COUNT(*) AS rows,
               COUNT(DISTINCT md5(output::text)) AS output_versions,
               COUNT(DISTINCT model_name) AS models,
               COUNT(DISTINCT prompt_hash) AS prompts,
               COUNT(DISTINCT temperature) AS temperatures
        FROM analysis_pass_results
        GROUP BY packet_key, pass_type, input_hash HAVING COUNT(*) > 1
      )
      SELECT CASE
          WHEN output_versions=1 AND models=1 AND prompts=1 AND temperatures=1
            THEN 'A_identical_retry'
          WHEN output_versions>1 AND models=1 AND prompts=1 AND temperatures=1
            THEN 'B_repeated_execution_same_config'
          WHEN models>1 OR prompts>1 THEN 'C_producer_variant'
          ELSE 'UNCLASSIFIED' END AS bucket,
        pass_type, COUNT(*) AS group_count, SUM(rows) AS total_rows
      FROM dup_groups GROUP BY bucket, pass_type ORDER BY total_rows DESC;
      ```
      **Result**: 1,272 duplicate groups total (matches the 4,173 excess-row
      count exactly). **1,225/1,272 groups (97%) = bucket B**
      (`summarization`, same model/prompt/temperature, 5 distinct outputs —
      non-deterministic LLM sampling, real execution history). Remaining 47
      groups (`embedding`: 37, `cache_push`: 10) are `UNCLASSIFIED` — not yet
      broken down further, small enough not to block the conclusion.

**BLOCKED**
- [ ] PF4B — determine table semantics precisely: confirmed execution-history
      shape for `summarization`; classify the legacy `embedding`/`cache_push`
      duplicate population without inferring retry semantics from missing
      identity or revision fields.
      **Source trace refresh 2026-09-29 (historical; superseded below):**
      `analysis-pass-orchestrator.mts` is a legacy Gemma4-summary importer;
      the shared analysis worker calls `recordAnalysisPassResult` with
      configured `passName` and nullable lineage. That source-only search did
      not find the legacy producers and did not query the database.
      **Read-only source/provenance refresh 2026-10-04:** the 47 duplicate
      groups / 97 rows split into 10 `cache_push` groups / 20 rows, 10
      `embedding` groups / 20 rows, and 27 `embedding` groups / 57 rows:
      - The first 20 `cache_push` rows and 20 `embedding` rows are tagged
        `source=test_orchestrator` across 10 packets per pass. They match
        `scripts/atlas/phase-b-test-orchestrator.mts`, whose header says it
        logs test data without calling the model, whose writes require
        `--apply`, and whose embedding payload is synthetic test metadata
        declaring the canonical 768-D dimension (with only five sample
        coordinates, not a real or complete vector). Historical rows emitted
        by the older 384-D fixture remain unchanged and are not backfilled.
        The cache payload names `chrom97_context`. These are repeated test-
        harness inserts, not evidence for production retry or embedding
        semantics.
      - The remaining 57 duplicate embedding rows (27 groups) are tagged
        `source=queue_consumer_embedding_batch`; across all rows with that
        tag, the read-only census found 130 rows / 100 packets. They match
        `scripts/atlas/phase-b-queue-consumer-embedding-batch.mts`, which
        records 768-D embedding metadata. Its ledger insert omits `input_hash`
        and uses a constant `pass_key`; `queue_message_id` is synthesized
        from packet key plus `Date.now()`, not read from the broker. None of
        these rows has source/pass revision or prompt/producer identity. In
        the duplicate subset, 18 groups have one output version and 9 have
        two; repeated processing is visible, but redelivery versus intentional
        re-embedding/content change is not distinguishable. The consumer acks
        after ledger logging and summary update, so a crash in that interval
        could cause redelivery; no persisted broker message identity proves
        that this caused the observed rows.
      **PF4B-DIVERGENT-01 read-only evidence matrix 2026-10-04:** the nine
      embedding groups with multiple stored output-metadata versions contain
      21 rows. All nine have `input_hash`, `pass_identity_hash`,
      `source_revision`, `pass_revision`, and `prompt_hash` NULL; model tag is
      `embeddinggemma:latest` without artifact revision; temperature and
      max-tokens metadata are NULL. `provenance.source` is the same queue
      consumer label, but producer ID/revision and upstream execution/result
      references are absent. Per-row `queue_message_id` values differ, but
      source constructs these as `${packet_key}:${Date.now()}`; they are not
      verified broker/attempt IDs. Each group has two distinct stored output
      JSON hashes, differing in `embedding_norm`; the vector itself is not in
      this table, so vector divergence is unknown. Classify these as
      `DIVERGENT_OUTPUT_UNEXPLAINED` at metadata level and
      `SAME_INPUT`/producer/revision/execution semantics UNKNOWN. Do not infer
      retries from timestamps. Full row matrix:
      `docs/reports/pass-fabric-pf4b-divergent-embedding-matrix-20261004.md`.
      PF4B-DIVERGENT-01 = READ_ONLY_CENSUS_COMPLETE; duplicate semantics
      remain UNPROVEN.
      PF4B remains open; no deduplication, backfill, uniqueness change, or DB
      write was performed.
      PF4B remains open for those 27 queue-consumer groups. Do not collapse
      rows, infer deterministic idempotency, or apply one pass semantic to
      every `embedding` row based on this partial trace.
- [ ] PF4B-EMBED-01 — enforce `semantic_768` (EmbeddingGemma, 768-D) as the
      only canonical persisted embedding output for pass-fabric and canonical
      retrieval. Reject new 384-D writes at writer/contract boundaries;
      retain historical 384-D rows only for explicit legacy reads. The
      `phase-b-test-orchestrator.mts` sample is synthetic metadata, not proof
      of a valid 768-D vector writer. Partial route proof (2026-10-04):
      `/api/embed` rejects every explicit EmbeddingGemma dimension other than
      native 768, including raw/unprompted 384 and naive 512 truncation; MRL
      remains a separate derivation from persisted `semantic_768`. Focused
      route + representation-contract suites pass 19/19. The legacy
      `backfill-content-embedding-384.mjs` writer is now retired: `--apply` and
      `--resume` fail before DB connection, its 384-D UPDATE was removed, and
      its policy tests pass 2/2. The legacy
      `atlas-qdrant-projection-worker.mjs` also fails before environment/DB/
      queue setup because it has no verified `semantic_768` source; startup
      policy test passes. This does not close the task by itself; the remaining
      production writer/caller census and live persistence proof are still
      required.
- [ ] PF4B-EMBED-02 — freeze representation identity on new canonical
      embedding rows: producer/model identity, `representation_id=semantic_768`,
      exact `representation_revision` and model-artifact revision, dimension
      768, and source/pass revisions plus `input_hash`. Runtime aliases such as
      `embeddinggemma:latest` alone do not identify an immutable artifact.
- [ ] PF4B-EMBED-03 — if compact MRL projections are admitted, derive only
      512/256/128-D prefixes from the exact persisted `semantic_768` vector,
      then L2-renormalize. Record parent representation/revision/checksum,
      derivation method/revision, dimension, and child checksum. These are
      derived projections, never aliases or substitutes for `semantic_768`.
- [ ] PF4B-EMBED-04 — keep `latent_*` under a separate learned-projection
      contract with its own producer/parameter revision and checksums. Never
      label learned latent vectors as EmbeddingGemma or MRL.
- [ ] PF4B-EMBED-05 — complete a producer/consumer census of every remaining
      384-dimensional surface before changing schemas or dimensions. Classify
      each as EmbeddingGemma truncation/projection, another model's native
      vector, cross-encoder/token limit, learned latent, historical schema, or
      UNKNOWN; record producer, consumer, storage/index, runtime reachability,
      representation identity, and write capability. Latest source audit
      (2026-10-04, not a live data census): the Atlas `codebase_chunks_384*`
      contracts are historical direct-slice EmbeddingGemma projections, not
      MRL; `populate-packet-vector-bundles.mjs` slices `semantic_768` to 384
      and requests `embeddinggemma:latest` before writing 384-D bundles;
      `phase108d-embeddings-backfill-full.mts` creates a 384-D stride-sampled
      alias; and `rebuild-gemma4-summaries-384.mjs` retains an explicit legacy
      write opt-in. These three write paths are now blocked before database or
      Qdrant work; their replacement with a schema-compatible, revision-bound
      768-D producer remains open. Separately,
      `semantic_embedding_cache_v2` declares halfvec(768), while the older
      `knowledge_graph` Qdrant sync declares 384 and its actual model/producer
      binding is UNKNOWN. Do not infer that it is MiniLM/MS MARCO or rewrite
      it without producer and consumer proof. Historical migrations and
      unrelated legal/domain vectors are not automatically EmbeddingGemma.
      Model clarification: repository references to
      `cross-encoder/ms-marco-MiniLM-L-6-v2` identify a sequence-classifier
      reranker, and its `max-length=384` is a token count, not vector width.
      Historical migrations explicitly name `nomic-embed-text` for some
      384-D domain vectors; these are separate legacy/model-specific surfaces,
      not EmbeddingGemma. Static source search found no caller for the old
      `qdrant-sync.ts::startSyncWorker` path; treat that path as a dormant
      candidate pending dynamic/runtime confirmation, not as a proven live
      MiniLM semantic-search owner.
      Focused writer guard passes 4/4; direct `--apply`/entry-point smoke for
      the three retired scripts exits 2 with the intended disabled reason.
      No database or Qdrant request was made. This is source/guard proof only;
      it neither migrates existing 384-D rows nor proves the full writer census.
      **Read-only recipe sample (2026-10-04):** persisted an 8,003-byte,
      `canonicalAuthority=false` receipt at
      `docs/reports/embedding-recipe-census-v1-20261004-n100.json` (100 rows
      per deterministic stratum; no database writes). Populations were 739
      rows with both columns, 54,430 `content_embedding`-only, 219,259
      `content_embedding_768`-only, and 52,364 tagged with the task-prefix-v1
      model tag. In the samples, `content_embedding` was mixed: the both-column
      cohort yielded 24 path-prefixed, 52 trimmed path-prefixed, 21 raw, and 3
      unknown; the content-only cohort yielded 27 path-prefixed, 66 trimmed
      path-prefixed, 6 raw, and 1 unknown. The 768-only cohort matched raw in
      all 100 sampled vectors; the both-column cohort's 100 `content_embedding_768`
      samples were all UNKNOWN, and only 2 tagged-cohort 768-column vectors
      were present (both UNKNOWN). Row tags also varied across strata. Treat
      these as sample observations, not corpus-wide recipe or artifact proof:
      the mixed recipes and UNKNOWN rows keep EMB-RECIPE-CLASSIFY and runtime
      artifact binding open. Do not bulk-migrate, relabel, or promote from this
      sample. Additional fail-closed policy tests cover legacy Qdrant collection
      creation and restore apply (2/2); no database/Qdrant writes occurred.
- [ ] PF4B-EMBED-06 — migrate or retire every confirmed EmbeddingGemma-backed
      semantic writer to native 768-D `semantic_768`; prohibit slicing,
      stride-sampling, or relabeling 384-D output as EmbeddingGemma/MRL.
      Persist only the exact model/representation revision and recipe-qualified
      768 vector. Cover the packet-vector-bundle, phase108d backfill, and
      summary-rebuild paths found by PF4B-EMBED-05. The 768 API dimension guard
      and the existing disabled legacy writers are partial protections, not
      proof that every writer is migrated or that persisted rows are valid.
- [ ] PF4B-EMBED-07 — prove the canonical semantic cache → search → Qdrant
      path uses the same EmbeddingGemma `semantic_768` representation and
      revision. Cache identity must include model artifact, representation,
      input/recipe policy, and normalized input checksum; Qdrant remains a
      rebuildable projection of the PostgreSQL-owned vector/identity. Keep
      `codebase_chunks_384*` out of canonical nomination/fusion. Audit the
      separate 384-D `knowledge_graph` sync and text-hash-only legacy cache
      callers; no dimension-only alias or cross-model cache reuse is allowed.
      Partial runtime proof (2026-10-04): `cache/embedding-cache.ts` now
      includes the model and `semantic_768` role in its exact Redis key,
      validates cached vectors and fresh outputs with the shared 768-D
      validator, and evicts/recomputes legacy 384-D values. `knowledge-cache.ts`
      retains model-qualified keys, now evicts invalid EmbeddingGemma cache
      values and refuses new non-768 EmbeddingGemma writes while preserving
      distinct non-EmbeddingGemma dimensions. Focused mocked-Redis tests pass
      6/6 across both cache owners. These Redis caches still lack model-artifact,
      tokenizer, and input-policy revisions and are not the revision-qualified
      `semantic_embedding_cache_v2` owner; cache/search/Qdrant parity remains
      open.
      **Caller convergence slice 2026-10-04:** `/api/retrieval/dual-lane` now
      uses the shared provider executor for Ollama `embeddinggemma:latest`,
      retaining its prior `OLLAMA_HOST || OLLAMA_BASE_URL` precedence,
      30-second timeout, and `unprompted_legacy` query recipe; its existing
      `semantic_768` validator and `codebase_chunks_768` Qdrant named-vector
      queries remain in place. The route no longer owns a direct Ollama
      embedding transport. Focused route-adapter and provider-executor tests
      pass 16/16. The read-only direct-endpoint guard passes with 75 live direct
      callers, 3 resolved since baseline, and 0 new bypasses. This closes one
      caller only; it does not prove corpus/query recipe parity or full
      cache/search/Qdrant convergence.
- [ ] PF4B-EMBED-08 — keep verified non-EmbeddingGemma model roles distinct.
      The repository identifies `cross-encoder/ms-marco-MiniLM-L-6-v2` as a
      sequence-classification/reranking model; its `--max-length=384` is a
      token limit, not evidence of a 384-D embedding. The NLP sidecar records
      that reranker as skipped/not invoked. Do not convert a reranker to
      EmbeddingGemma or count it as a dense semantic vector lane. If runtime
      evidence confirms the reported MiniLM/MS MARCO 384-D semantic-cache or
      Qdrant search path is a separate dense-vector producer, record its actual
      model/artifact, query and document recipes, dimension, cache key,
      collection/vector name, producer, consumer, and reachability. Keep that
      distinct model role explicitly separate; do not infer it from the number
      384 or silently fold it into the canonical EmbeddingGemma lane. Source
      trace (2026-10-04) found a real separate MiniLM-backed Chroma memory path:
      the `claude-mem` worker initializes `ChromaMcpManager` unless disabled;
      `ChromaSync` sends documents without explicit vectors and searches with
      `query_texts`; the pinned `chroma-mcp` runtime's dependency note identifies
      its shipped `all-MiniLM-L6-v2` embedding model. This is a Chroma memory
      lane, not proof of a MiniLM→Qdrant codebase lane. The exact active model
      artifact and vector dimension still need runtime readback. The separate
      `scripts/INFERENCE_INFRASTRUCTURE.md` inventory says all-MiniLM is active
      but is not itself runtime proof. Reconcile the reported Qdrant/cache path
      independently; do not mistake the MS MARCO cross-encoder token limit for
      this Chroma dense embedding model.
- [ ] PF4B-EMBED-09 — classify remaining 384-D database columns, migrations,
      fixtures, and learned-projection outputs by owner before schema changes.
      Preserve historical data and compatibility where required; do not
      mass-convert all `vector(384)` columns to 768, since dimension alone
      does not establish model, semantic role, or migration safety. Any active
      EmbeddingGemma semantic consumer must instead migrate through an
      independently validated 768-D source and readback. Source-level finding
      (2026-10-04): `sveltekit-frontend/drizzle/manual/feature_records_and_recommendation_events.sql`
      still labels `embedding384` as `content_embedding_384` from EmbeddingGemma,
      calls `embedding768` deprecated, and names `embeddinggemma-384-v1`; this
      contradicts the current canonical policy. Determine whether this manual
      SQL is active, applied, or historical before changing it. The separate
      `latent_384d` schema field is explicitly a latent representation and is
      not an EmbeddingGemma dense vector. Keep model, latent, domain, and legacy
      schema meanings separate.
- [ ] PF4B-EMBED-10 — finish a role-by-role audit of every production 384
      vector/search/cache/Qdrant path and reconcile its owner here before
      changing dimensions. Canonical pass-fabric and semantic query/document
      embedding uses EmbeddingGemma native 768-D `semantic_768`; the canonical
      semantic cache and canonical semantic Qdrant projection must use that
      same model, representation, recipe, and revision-qualified identity.
      Any active EmbeddingGemma writer currently producing or consuming 384-D
      vectors is a migration/retirement blocker, not a second canonical lane.
      Keep these model roles distinct:
      - `sentence-transformers/all-MiniLM-L6-v2` is a separate Chroma memory
        embedding model, not EmbeddingGemma and not proof of a Qdrant producer.
      - `cross-encoder/ms-marco-MiniLM-L-6-v2` is a reranker; its configured
        `max-length=384` is a token limit, not an embedding dimension.
      - Legacy Atlas `codebase_chunks_384*` projections are direct-slice
        EmbeddingGemma migration artifacts, not supported MRL outputs.
      - Other 384-D columns/collections may be distinct-model, domain/legal,
        learned latent, historical, fixture-only, or unknown; identify their
        actual producer and consumer before changing them.
      Specifically trace the reported MiniLM/MS MARCO semantic-cache and
      Qdrant path end to end. Current repository evidence has not bound that
      report to a live Qdrant writer/query, so label it
      `REPORTED_UNVERIFIED`; do not infer vector production from the
      cross-encoder name. If a 384-D model is producing active semantic
      query/document vectors for canonical cache/search, migrate that canonical
      path to EmbeddingGemma native 768-D `semantic_768`, with query/document
      recipe parity, revision-qualified cache identity, and independent
      pgvector/Qdrant readback. Keep any reranker as a separate post-retrieval
      scoring role. For each remaining 384 hit, classify it as
      `EMBEDDINGGEMMA_LEGACY`,
      `DISTINCT_MODEL_VECTOR`, `RERANKER_OR_TOKEN_LIMIT`, `LEARNED_PROJECTION`,
      `HISTORICAL_SCHEMA_OR_DATA`, `FIXTURE_OR_EXAMPLE`, or `UNKNOWN`; record
      actual model/artifact, input recipe, vector-vs-token meaning, producer,
      consumer, runtime reachability, storage/index, and write capability.
      Preserve distinct latent, legal/domain, historical, and fixture roles
      under their own contracts. Acceptance: no production 384 hit is silently
      treated as canonical EmbeddingGemma; all unresolved runtime roles remain
      explicitly `UNKNOWN` and block promotion. No bulk rewrite, relabel,
      Qdrant restore, or database migration is authorized by this census task.
      Narrow cleanup (2026-10-04): `search-runtime.ts` contained a private
      `makeProjected384EmbedFn` → `projectEmbedding` → `makeEmbedFn` chain with
      no repository callers. Removed that dead helper chain and its unused
      `DenseEmbedding` import; this prevents that file from retaining an
      unsupported 384-D projection path. This does not prove or change other
      384-D producers/consumers, so PF4B-EMBED-10 remains open. Focused
      `search-runtime.spec.ts` validation passed 17/17 tests; no live retrieval
      or persistence behavior was exercised by that mocked suite.
- [ ] PF4B-EMBED-12 — change the intended Chroma memory-lane model/configuration
      name to canonical EmbeddingGemma `semantic_768` only; defer adapter and
      storage integration. This is the requested name-only step, not proof that
      the bundled Chroma MCP embedder uses EmbeddingGemma: source evidence shows
      `ChromaSync` omits caller-supplied vectors and the pinned dependency
      identifies bundled `all-MiniLM-L6-v2`. Do not relabel existing MiniLM
      vectors or claim runtime/model/dimension changed without independent
      readback. The inspected `ChromaMcpManager` exposes no proven model-name
      option; if a supported name-only setting cannot be established, stop
      without adding a guessed environment variable and continue at
      PF4B-EMBED-12A. Do not silently proceed as canonical. Keep this Chroma
      memory lane distinct from the reported MiniLM/MS MARCO Qdrant path until
      that path has producer/consumer proof. No Chroma writes, collection
      rebuild, backend switch, or service startup is authorized by this naming
      task. Latest runtime check (2026-10-04) found no `claude-mem`/`chroma-mcp`
      process and no listener on port 8000, so active model/dimension readback
      remains unavailable.
- [ ] PF4B-EMBED-12A — later integration fallback only if the PF4B-EMBED-12
      model/configuration-name change cannot make new Chroma requests use the
      canonical EmbeddingGemma `semantic_768` producer. Evaluate caller-supplied
      768-D vectors through the existing adapter boundary or the existing
      PostgreSQL/pgvector memory owner, after feature-parity and replay review.
      This is the follow-up to use if the name-only change gets stuck or proves
      unsupported; leave Chroma non-canonical until resolved. No Chroma write,
      vector relabel, or collection rebuild until bounded parity and independent
      768-D runtime/readback proof pass.
- [ ] EMBED-RUNTIME-READBACK-01 — prove the active `:8097` service reports
      backend reachability, requested model availability/residency, model
      artifact digest, and dimension without issuing an embedding request.
      The Go source now reads Ollama `/api/tags` and `/api/ps` for `/health` and
      `/stats`; the legacy health keys remain, with additive typed readback
      fields. Stats no longer claim the model is loaded or GPU-active by default.
      `go test ./...` in `services/go-embedding-service` passes. **Live
      discrepancy (2026-10-04):** the running `legal-ai-go-embedding` container
      uses `OLLAMA_URL=http://host.docker.internal:11434` and
      `EMBED_MODEL=embeddinggemma:latest`; read-only requests from that same
      container show the exact tag installed with digest
      `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1` and
      `embedding_length=768`, but `/api/ps` returns no resident models. The
      active `:8097/health` and `/stats` still report `model_loaded=true` /
      `is_loaded=true` and `gpu_available=true`, so the running image does not
      match the corrected source behavior. Do not call `/ready` for metadata
      verification: it sends an embedding request. Keep the gate open until an
      authorized service rebuild/restart and independent live `/health`
      readback prove the corrected contract. Tokenizer and per-call input-policy
      bindings remain separate open model-receipt requirements; no embedding
      request or persistence was performed for this census.
- [ ] PF4B-EMBED-13 — converge canonical semantic cache/search vectors on
      EmbeddingGemma native 768-D `semantic_768`, including PostgreSQL/pgvector
      and any Qdrant semantic projection. Inventory cache/table/collection and
      vector-key owners, producer and query embedder, consumers, dimensions,
      recipes, revisions, runtime reachability, and readback. The repository
      declares 768-D pgvector surfaces including
      `codebase_chunk_index.content_embedding`,
      `semantic_embedding_cache_v2.embedding` (`halfvec(768)`), and
      `search-analytics` columns; verify the active schema and callers rather
      than creating a parallel store. Source search has not established a
      dedicated embedding LUT table; any claimed lookup table requires exact
      schema and consumer evidence. Keep the reported MiniLM/MS MARCO Qdrant
      path `REPORTED_UNVERIFIED` until its live producer/query chain is traced.
      A confirmed non-EmbeddingGemma 384-D vector used for canonical semantic
      cache/search is a migration blocker and requires a separately authorized
      replacement with recipe-matched 768-D vectors and checksum/readback.
      Preserve reranker, latent, legal/domain, and historical roles without
      relabeling them. Changing a model name is not a vector migration: do not
      claim existing MiniLM/384 vectors are EmbeddingGemma/768. If the provider,
      cache, Chroma MCP, or Qdrant integration blocks the migration, add a
      bounded follow-up task describing the adapter/compatibility gap and keep
      the affected path non-canonical until that task passes. No mass
      re-embedding, schema migration, Qdrant rebuild, or Chroma write is
      authorized by this task.
- [ ] PF4B-SEMANTIC-CACHE-01 — keep app-side semantic L2 fail-closed until
      server-derived request context and cached-answer provenance are available.
      Required admission: similarity >= 0.82; exact EmbeddingGemma model ID
      and artifact revision; `semantic_768` at dimension 768; exact embedding
      recipe and input-policy revisions; exact opaque domain ID plus taxonomy
      ID and taxonomy revision; matching retrieval/task intents; matching
      workspace revision or matching corpus and evidence-manifest revisions;
      independently valid answer-artifact ref/checksum. Current callers do not
      provide that authority. `/api/cache/bifrost/check` now returns MISS
      without an upstream call, and its store route rejects unqualified writes.
      `bifrostChat`'s direct Qdrant global L2 read/write and explicit Bifrost
      semantic-cache key are disabled; disclosed gateway cache hits are rejected.
      `inference-router.ts` no longer issues the 500 ms global-key cache probe;
      it skips semantic reuse without server-owned admission metadata while
      preserving the ordinary Bifrost synthesis fallback.
      Existing exact-match caching is unchanged. Focused Vitest is currently
      stalled/unverified; gateway/plugin behavior and stored-artifact metadata
      support remain unproven. Domain IDs remain opaque here: do not mint a
      competing taxonomy; resolve them through the existing `.okf`/domain
      classification owner when proven. A cache-key partition or similarity
      score alone is not admission. No Qdrant/cache write or Bifrost restart is
      authorized by this task.
- [ ] FANOUT-ALIGNMENT-AUDIT-01 — produce a read-only inventory of lexical,
      semantic, structural, graph, ontology, classification, routing, cache,
      GPU, MCP, SearXNG, and ACE fan-out capabilities using
      `scripts/atlas/audit-fanout-fabric-alignment.mjs`. Report source-reference
      files separately from AST-detected caller sites. Only explicit,
      capability-matched owner declarations may be counted as owner candidates;
      source mentions and signal co-location are not runtime, identity, lineage,
      or revision proof. Keep routing-domain, ontology-domain, and artifact-domain
      taxonomies distinct; treat SearXNG as external acquisition, not an internal
      retrieval vote. No Graphify refresh, service/database request, persistence,
      or canonical-authority claim is authorized by this audit.
- [x] FANOUT-AUDIT-02 — corrected the AST-grep probes to variadic argument
      patterns and persisted `docs/reports/fanout-capability-audit-v2.json`.
      The old `%TEMP%/fanout-capability-audit-v1.json` remains
      `SUPERSEDED_DIAGNOSTIC` (`CALL_PATTERN_ARITY_BUG`), SHA-256
      `f1b7f8419c69d82a5028277e82c9aebd978f3e00e35d2fad2f723b10995306b3`;
      it was not copied or changed. V2 (`AST_GREP_VARIADIC_ARGS_V2`) scanned
      17,327 files and 29 capability families: `routeQuery` 3 call sites,
      `buildRetrievalPlan` 4, `selectMcpToolSubset` 1, `requestAcquisition` 0.
      The selector call is in `src/mcp/server.ts` inside the `tools/list`
      handler (`ACTIVE_CALLER_PROVEN`); `requestAcquisition` remains unresolved
      in the audited source scope. V2 is static inventory only; generic calls
      are not attributed to capabilities, and this does not prove all owners,
      runtime reachability, or revision lineage. Report size is 746,256 bytes;
      embedded semantic checksum is `sha256:0bc6afa50f46ce2f12ff7337b4cb22f15f083cde4676d653e1f7c5a2f1aa581c`;
      raw report-file SHA-256 is `sha256:d38ef2b07629f41c38db617fd65d15c1712369926f8fea9e136f9b421396c884`;
      `writesPerformed=false`.
- [ ] KERNEL-RETRIEVAL-REAL-01 — read-only trace of all six local
      `atlas-task-kernel` tools. Do not patch until each first broken boundary
      is isolated. Current evidence: A, `atlas_expand` maps `target` directly
      to `find_dependencies`. KERNEL-PATCH-01 expanded the lookup across both
      `CodebaseFile.path` and `CodebaseFile.filePath` key families, so the
      earlier `QUERY_KEY_MISMATCH` diagnosis is superseded. The known symbol
      `planGraphifyEdgeReplayV1` is not a file key and now fails explicitly as
      `TARGET_NOT_A_PATH`; its containing file is absent from the live
      projection (`PROJECTION_MISSING_FILE`). `atlas_inspect` returned 0 refs.
      Live read-only replay on 2026-10-04 isolated the file lookup failure:
      Neo4j contained 69,009 `CodebaseFile` nodes (65,342 with `path`, 3,667
      with `filePath`), but the exact replay-planner file matched no node
      (`PROJECTION_MISSING_FILE`). A control query for
      `src/lib/server/ace/context-assembler.ts` matched both key families and
      returned dependencies (bounded at the 500-row cap), proving the read
      query is operational, not that its graph data is current. Its result
      still has `graphRevision=null`, `evidenceRefs=[]`,
      `status=UNRESOLVED`, and `canonicalAuthority=false`. Do not refresh
      Graphify solely to make the missing file appear; graph-snapshot
      admission remains a separate gate.
      Both carry `graphRevision=null`, `evidenceRefs=[]`, and `UNRESOLVED`, so
      a symbol-to-node resolver and admitted graph projection are unproven.
      B, three distinct code/legal/embedding queries returned the same 10
      packet candidates and static local diagnostic packet. This was the
      pre-patch behavior and is superseded by the query-specific live smoke
      below; retain its checksums only as historical evidence, not as the
      current retrieval result. Historical card-set checksum:
      `f001c4a167cf76361e1c5da46c5dc69ec9affde529622ce779f666a06c8888f4`;
      historical card-order checksum:
      `3e1436ed1b9cf716ef489849f124967339de3beca0d4516ffcfaa07fbcdfc631`.
      The static packet was `NON_CANONICAL_DIAGNOSTIC_ONLY`, missing source
      revision, and must not be confused with live retrieval. Historical
      query SHA-256 values, in code/legal/embedding order:
      `e25b2ad6ba592d970a2e9ef4cfcef7ea32a949402e74842e6d11d33c961e5ea5`,
      `89a31df12e57e0e27ac110c9356ed61699464f1e3825fc229004c21ffe92b704`,
      `68d47d34c88370a9dd5a303c663debbc90e8520db51df4a8f6d396388b305f5f`.
      **Current live read-only smoke (2026-10-04; KERNEL-PATCH-03):**
      `atlas_context` now calls TRACE `atlas.query`, binds candidate paths via
      `atlas.packet_search`, and uses the static packet only as an explicitly
      labelled fallback. A live EmbeddingGemma/`semantic_768` query returned
      three query-specific candidates (`TRACE_MCP_LIVE`,
      `LIVE_TRACE_RANKED_SEARCH`); it did not establish admission. All three
      candidates lacked packet identity and source revision, were marked
      `identityBound=false`, `proofUsable=false`, and
      `UNADMITTED_RETRIEVAL_CANDIDATES`. Exact `atlas.packet_search` lookups
      for the three returned source refs yielded no packet keys, with no RPC
      error, so the missing identity is not explained by a failed lookup.
      Candidate refs were
      `src/lib/server/atlas/features/candidate-feature-snapshot-v1.spec.ts`,
      `src/lib/server/vector/embeddinggemma-contracts.ts`, and
      `src/lib/server/embedding/semantic-lineage.ts`. The API currently
      constructs `promptPacket` text from these unadmitted candidate summaries;
      downstream model consumption is not proven. Keep the MCP/context-to-LLM
      admission gate open and do not treat query-specific ranking as evidence
      admission. No writes were performed.
      **KERNEL-REAL-02 owner reconciliation (2026-10-04):** the selected
      patch owner is `SearchRuntime` (the unified fusion runtime);
      `atlas.packet_dense_search` is an executor, not a second fusion owner;
      the static reconciliation packet remains diagnostic. The current
      `atlas.query` alias still dispatches to `handleTraceSearch`/`traceRerank`,
      so this owner decision is not yet wired into the kernel. A repository
      caller census also finds `runSemanticSearchWorkflow` invoked by the
      search TRPC router and `/api/retrieval/search-unified` handlers. Treat it
      as PATCH_EXCLUDED / RUNTIME_USE_UNVERIFIED, not globally dormant, until
      route/runtime evidence resolves the apparent discrepancy.
      `SearchRuntime` has a `readOnly` option guarding promotion-outbox,
      recommendation exposure, and policy-training writes. The transitive
      source audit found one additional write surface: the canonical reranker
      defaults to Redis cache reads/writes and deletes malformed entries.
      `SearchRuntime` now passes `cachePolicy='disabled'` in read-only mode,
      covering those cache paths too. A second audit found shadow XGBoost
      evaluation appends Redis Stream receipts; read-only calls now suppress
      that receipt while preserving the served baseline. Regression checks
      cover both policies; the SearchRuntime and canonical-reranker suites
      pass 33/33. This is focused/injected proof, not a live production
      zero-write proof across every transitive adapter. `runSemanticSearchWorkflow` also has
      source-level TRPC and API route callers, so retain
      `PATCH_EXCLUDED / RUNTIME_USE_UNVERIFIED` rather than declaring it globally
      dormant. KERNEL-REAL-02 remains open: prove the production adapter chain,
      candidate identity and revision fields, and zero writes before replacing
      the interim TRACE path.
      **Downstream admission guard (2026-10-04):**
      `scripts/atlas/agentic-recommendation-workflow.mjs` now withholds ACE
      packets/cards/signals unless the context status is `ADMITTED`; raw L4
      reranker summaries and raw ACE cards are no longer forwarded into model
      synthesis/recommendation inputs. Its focused fail-closed test and Node
      syntax check pass. This proves only this checked-in consumer boundary;
      it does not prove the external context builder or every MCP consumer
      avoids constructing/consuming unadmitted text. Keep
      KERNEL-CONTEXT-ADMISSION-01 held pending canonical revision evidence and
      final-consumer readback.
      No runtime orchestrator call was made in this audit.
      C, `atlas_research.maxRounds` is
      advertised and echoed in the envelope but dropped before the internal
      `build_agentic_rag_context` call. D, the MCP facade dispatches context and
      research through the live query path when available, with labelled
      static fallback; inspect/expand use read-only Neo4j projection queries,
      verify uses `classify_intent`, and validate-plan uses
      `build_recommendation`. The owner choice above is a planned correction;
      the present MCP/kernel path still does not call SearchRuntime or establish
      a Go Retrieval fusion owner. No KAG write was run.
      Focused MCP/kernel tests pass 41/41 on the current worktree; this is
      hermetic contract evidence, not live identity or model-injection proof.
- [ ] KERNEL-CONTEXT-ADMISSION-01 — held until real query-specific,
      canonical, revision-qualified evidence is returned and independently
      read back. Also withhold unadmitted candidate summaries from any
      `promptPacket`/model-facing context; the current live builder labels
      them unadmitted but still assembles their text into `promptPacket`.
      Prove the final consumer receives only the admitted, canonicalized
      context result; retrieval-specific ranking alone is insufficient.
- [ ] KAG-DAG-CALLER-TRACE-01 — HELD. Do not run the KAG DAG live-write trace
      or manufacture KAG rows until KERNEL-RETRIEVAL-REAL-01 proves that the
      active production kernel path needs KAG execution receipts.

**Frozen near-term order:** P0 BIFROST-L2-ADMISSION remains with its in-flight
owner; P1 TOKEN-BUDGET-01's six-kernel-schema (445 token) and TRACE-schema
(33,106 token) measurements are prior reported evidence, not a retrieval pass;
P2 FANOUT-AUDIT-02 is complete; P3 KERNEL-RETRIEVAL-REAL-01 remains open for
independent graph-node/readback resolution. KERNEL-REAL-02 is the next
read-only gate before orchestrator wiring; keep the five-flag proof and
model-facing admission open. Only after P3: CONTEXT-DEPTH-
ALIGNMENT-01, CONTEXT-BUDGET-01, bounded `atlas_expand`/`atlas_inspect`
argument alignment, CONTINUATION-01, DOMAIN-TAXONOMY-AUDIT-01 / DOMAIN-01 /
FEATURE-01..04, ROUTER-02 / TOOL-LUT-01 / MCP-ROUTE-01, then ACE-ROUTE-01 with
real result-token measurements. Keep KAG DDL/live write, Graphify edge
projection, a new evidence-depth enum, numeric relation codes, cluster-to-
domain mapping, SearXNG direct evidence, and Go Retrieval fusion ownership
held.
- [ ] PF4B-EMBED-11 — reconcile stale 384-D authority statements in active
      schemas, manual SQL, documentation, fixtures, and generation templates.
      Canonical policy is EmbeddingGemma native 768-D `semantic_768`; any
      384-D EmbeddingGemma wording must be marked legacy/retired, while genuine
      MiniLM reranking, other-model vectors, and learned latents retain their
      own role. First establish whether each SQL artifact was applied and who
      consumes it. Correct active guidance and tests; do not rewrite an
      already-applied historical migration or change a persisted column
      without a separately authorized migration and readback. Acceptance: no
      active contract describes 384-D EmbeddingGemma as canonical, and every
      historical statement is explicitly identified as historical or
      migration-only. No migration or vector rewrite is authorized by this
      documentation reconciliation task.
- [ ] PF4B-QUEUE-01 — do not treat the current
      `${packet_key}:${Date.now()}` value as broker or delivery identity.
      Capture a broker-issued message/delivery identity when available; until
      independently bound, execution/attempt identity stays UNKNOWN.
- [ ] PF4B-QUEUE-02 — require the revision-qualified logical identity inputs
      on new embedding writes: packet, pass type, exact source revision, pass
      revision, producer/config identity, representation identity/revision,
      and input hash. Preserve a separate attempt identity for executions.
- [ ] PF4B-QUEUE-03 — rerun the duplicate classifier against a frozen cohort
      of newly qualified rows. Distinguish retry/redelivery candidates from
      separate executions only when logical identity and broker delivery
      evidence support it; never auto-deduplicate historical rows.
- [ ] PF4B-QUEUE-04 — consumer patch + terminal classification (2026-10-04).
      **Legacy classification (frozen, evidence-bounded):** the 9 divergent
      groups / 21 rows are `DIVERGENT_OUTPUT_METADATA_PROVEN` (two stored
      output variants per group, differing only in `embedding_norm`) with
      `VECTOR_DIVERGENCE`, `RETRY` and `LEGITIMATE_REEXECUTION` all UNPROVEN;
      execution identity is `LEGACY_EXECUTION_IDENTITY_UNRECOVERABLE` unless an
      external broker log later proves attempt identity. The 3 groups that
      repeat a variant are `REPEATED_OUTPUT_METADATA` only (a matching
      `embedding_norm` does not make them retries). No dedupe, no uniqueness
      constraint.
      **Identity split (no new type; PF4C already owns the logical half):**
      logical = existing `passIdentityHash` (packet_key + source_revision +
      pass_name + pass_revision + input_hash); execution = that + `execution_id`
      + broker message identity. The execution half has no recorded home yet.
      **Code (commit after d42287db21, `phase-b-queue-consumer-embedding{,-batch}.mts`):**
      writers (raw INSERT, constant `pass_key` `embeddinggemma_summary_embed_v1`)
      now persist `provenance.broker` (messageId, deliveryTag, redelivered,
      routingKey, consumerTag), `input_hash` = sha256 of the summary, and
      `output.representation_id=semantic_768` + `model_tag` (artifact revision
      null: `:latest` is not an immutable revision). A failed ledger write now
      requeues instead of acking. Still NULL: `source_revision`,
      `pass_revision`, `pass_identity_hash` (messages do not carry them; not
      invented), so `PF4B-QUEUE-02` stays open. NOT run against the DB: the
      INSERT's `$12` mapping is read-checked only; a persistent DB failure now
      requeues indefinitely (needs a retry cap or DLQ).
- [ ] PF4B-QUEUE-05 — bounded redelivery / DLQ for the embedding consumers
      (2026-10-04). `sveltekit-frontend/src/lib/server/queue/embedding-consumer-retry-policy-v1.ts`
      (+ spec 8/8) owns the pure policy; both `phase-b-queue-consumer-embedding{,-batch}.mts`
      call `processDeliveryV1`. Failure (embedding null, ledger write false,
      summary update false, thrown error, unparseable body) -> `nack(requeue)`
      up to `EMBED_CONSUMER_MAX_ATTEMPTS` (default 3), then publish the original
      body + headers to the companion queue `atlas.enrichment.embedding.dlq`
      (confirm channel) and ack the original; if the DLQ publish fails the
      message is requeued, never dropped. A classic queue cannot gain a DLX
      without PRECONDITION_FAILED, hence the explicit companion queue. The DLQ
      path writes no `analysis_pass_results` row. Identities kept separate:
      broker identity = broker `messageId` else a content digest (never a
      timestamp); logical input key = packet_key + input_hash + `semantic_768`;
      execution id = consumer run + delivery tag + attempt (all three persisted
      under `provenance.execution`). Summary-update failures now count as
      failures (they were silently acked before). KNOWN LIMITS: the attempt
      counter is in-process, so a consumer restart resets it; a retry after a
      failed summary update can add a second ledger row for the same logical
      input (distinguishable by execution id, but still a PF4B-style duplicate
      until an idempotent upsert on logical identity exists); nothing was run
      against RabbitMQ or Postgres, only the pure policy tests.
- [x] PF4C — prove `pass_key` semantics from code/history: it is job-scoped
      execution retry identity, not logical pass identity. Keep it unchanged;
      use the separate logical identity only when a stable `inputHash` is
      explicitly supplied, otherwise leave `passIdentityHash` NULL. Focused
      cross-job tests prove execution keys differ while qualified logical
      identities match; no DB writes or uniqueness changes are part of this
      proof. `sveltekit-frontend/src/lib/server/db/schema/analysis-pass-results.identity.spec.ts`
      now also pins deterministic-idempotent, stochastic-history, and
      observed-event semantics; isolated contract tests pass 2/2. This does
      does not resolve PF4B's 27 remaining queue-consumer embedding groups or
      authorize a migration/writer.
- [x] PF4D — read-only recovery census completed 2026-09-27. No values were
      backfilled: all 11,076 legacy rows have both revisions NULL; none has an
      exact historical source-revision binding at or before its execution time,
      and legacy producer provenance has no explicit source/pass revision.
      Current packet revisions are not safe substitutes for historical values.
      The recovery outcome is zero evidence-backed candidates; PF4E remains the
      separate gate for explicitly representing unresolved legacy rows.
- [ ] PF4E — mark unrecoverable rows explicitly `legacy-unresolved` (do not
      silently leave ambiguous NULLs — a typed status is queryable, a NULL
      that means "we don't know" vs NULL that means "not applicable" is not)
- [ ] PF4F — wire the writer; new rows MUST populate both revision fields
      (the shared `recordAnalysisPassResult` writer is called by
      `sveltekit-frontend/src/lib/server/analysis/worker.ts`; its generic path
      forwards nullable source/workspace/representation revisions, while a
      specialized `code_feature_registry` branch builds a richer source-bound
      input when a qualifying receipt exists. Live coverage remains sparse:
      the 2026-09-27 read-only census found only 27/11,103 rows with both
      source/pass revisions. A separate legacy importer,
      `scripts/atlas/analysis-pass-orchestrator.mts`, is explicitly
      `--apply`-gated and writes only `gemma4_summary_v1` rows with
      `input_hash` and `prompt_hash` NULL and no source/pass revision columns.
      Neither source explains the observed `embedding`/`cache_push` duplicate
      groups. PF4F remains open: new eligible rows must carry both revisions.)
- [ ] PF4G — prove duplicate-delivery idempotency on new writes
- [ ] PF4H — add DB uniqueness **only at the logical-materialization
      boundary** (a view or projection selecting current-eligible-per-
      `PassIdentity`), never directly on the append-only execution table

**Current interpretation note (2026-08-11)**: `analysis_pass_current` is the
current eligible-materialization projection, not the final universal truth
surface. The partial unique index is acceptable as a transitional safety
rail for legacy rows, but it is not yet the final semantic proof that future
stochastic history and deterministic idempotent passes are both handled
correctly.

**Target shape**:
```
analysis_pass_results        (append-only, many execution receipts — KEEP AS-IS)
        ↓
current_eligible_pass_result (one selected row per PassIdentity — NEW, view or table)
```

**Hard rule**: classify first, dedupe never by assumption, enforce uniqueness
only on the logical-result boundary once identity is proven. Do NOT
delete/collapse the 4,173 duplicate rows — they are legitimate execution/
training/eval history, not ingestion bugs.

**PF9 (incremental eligibility) blocked on PF4B–PF4H, not just PF4A.**

---

## PF4B — APPLIED (2026-08-11)

```sql
CREATE OR REPLACE VIEW analysis_pass_current AS
SELECT DISTINCT ON (packet_key, source_revision, pass_type, pass_revision, input_hash)
  id, packet_key, source_revision, pass_type, pass_revision, input_hash,
  status, output, scores, provenance, model_name, prompt_hash, temperature,
  created_at, updated_at
FROM analysis_pass_results
WHERE status = 'success'
ORDER BY packet_key, source_revision, pass_type, pass_revision, input_hash, created_at DESC;
```

Live now. Verified: collapses the known 5-row `packet:07040d2cb741`/
summarization duplicate group to exactly 1 row. `analysis_pass_current` =
6,903 rows vs. 11,076 raw rows in `analysis_pass_results` (untouched,
zero data loss — this is a VIEW, not a migration).

**Live-contract reconciliation (2026-08-11)**: the shared
`analysis_pass_results` schema/helper path in `sveltekit-frontend/src`
was aligned to the actual live table contract (`pass_key`, `packet_key`,
`pass_type`, `output`, `scores`, `index_push`, `provenance`, nullable
`source_revision` / `pass_revision`). The POS / concept-tagging proof
harness now writes through the shared ledger path and replays safely:
same `pass_key` reuses the existing receipt row instead of inserting a new
one.

**Tie-break rule used: `MAX(created_at)` (most recent wins).** Flagged
**NOT_PROVEN as a semantic choice** — per the prompt's own caveat, "most
recent" and "canonical" are not automatically the same thing for
non-deterministic LLM outputs (e.g. for `summarization`, is the 5th sample
actually better than the 1st, or just later?). This should be revisited
once PF4C (pass_key semantics) is resolved and once there's a real quality
signal to break ties on instead of recency. Current view is a reasonable
default, not a proven-correct one.

**PF4C–PF4H remain undone** — genuine design work (pass_key semantics
investigation, dependency DAG, invalidation engine, eligibility gate,
deterministic join proof) needing full context in a fresh session, not
rushed. Do not attempt these without re-reading PF4C's requirements above
first — they depend on git-history/caller investigation that wasn't done
this session.

**Re-verification pass (2026-09-05, read-only — reconciles this line against the "STEPS 2-3
APPLIED" section above, both same-day 2026-08-11 entries)**: this line's "PF4C-PF4H remain undone"
appears to predate the "STEPS 2-3 APPLIED" section earlier in this file (same date, different point
in the session) — live code confirms PF4C's core mechanism (the `passIdentityHash` field +
`resolveExecutionSemantics()` gate inside `recordAnalysisPassResult()`) IS implemented and live, not
undone. Re-checked each sub-item individually against current code/DB, not just the file's own
prose:

- **PF4B (materialization view) — confirmed live.** Ran
  `npm run atlas:pass-fabric:report` (`scripts/atlas/report-pass-fabric-proof.mts`) fresh:
  `currentBoundaryKind: "view_only"`, `rawRows: 11095` (11,076 → 11,095, +19 rows since this file
  was last dated — expected drift), `currentRows: 6903` (still matches this section's claim
  exactly), `uniqueConstraintPresent: false`.
- **PF4C (identity/execution hash split) — source and fixture proof refreshed**:
  `pass_key` remains the execution retry identity, while logical reuse queries
  `passIdentityHash`. A stable caller-provided `inputHash` is required to emit
  that logical hash; missing/blank input hashes now produce `NULL`, not a
  job-scoped fallback. The idempotency fixture supplies the stable hash it
  claims to exercise. Focused analysis-pass and lexical-adapter suites pass
  15/15. This does not establish population coverage or authorize DB
  uniqueness/materialization; those remain separate gates.
- **PF4D historical checkpoint (2026-09-05; recovery/backfill was then unproven), and found to be a much smaller
  problem in practice than "wire the writer" suggests.** New diagnostic script
  `scripts/atlas/audit-pass-fabric-revision-population-v1.mts` (`npx tsx
  scripts/atlas/audit-pass-fabric-revision-population-v1.mts` from `sveltekit-frontend/`) queries
  the aggregate (not sampled)
  population rate: of 11,095 total rows, only **16** have `pass_identity_hash` populated and only
  **19** have `source_revision`/`pass_revision` populated — as of the newest row in the table
  (2026-08-25, two weeks after the 2026-08-11 fix). The writer's *capability* to populate these
  fields is real and live (confirmed above), but essentially none of the real worker traffic since
  the fix has actually exercised it — `worker.ts`'s default ledger-input path falls back to
  `sourceRevision: ... ?? null` when `passResult`/`jobResult` don't carry a source revision, which
  is evidently the common case; only the `codeLedgerInput` branch (line ~469-470, gated on a
  `codeEvidenceReceipt` being present) reliably threads a real `sourceRevision` through. PF4F should
  be read as "the writer *can* populate both fields when the caller provides them, not that it does
  so in practice yet" — a narrower, more precise finding than either "zero code paths write" (the
  pre-2026-08-11 framing) or "wired" (which could be misread as "populated across the board").
- **PF4D refresh (2026-09-27; read-only):** current population is 11,103 rows: 27 have both
  revisions, zero have only one, and 11,076 legacy rows have neither. No legacy provenance row
  carries an explicit source/pass revision. Although 1,304 legacy rows join to a packet with an
  exact source-ref match, every such packet was updated after the pass execution; the current
  revision is therefore not historical evidence. No exact workspace-source binding was observed
  at or before pass execution. PF4D closes as **zero evidence-backed recovery candidates**; no
  backfill or schema change was performed. PF4E remains open for explicit unresolved-state handling.
- **PF4E (mark unrecoverable rows `legacy-unresolved`) — confirmed still not done.** `rg
  "legacy-unresolved|legacy_unresolved"` across `src/` returns zero matches.
- **PF4G (duplicate-delivery idempotency on new writes) — not independently re-proven this pass**
  (would need a live double-submit test against a `deterministic_idempotent` pass; out of scope for
  a read-only verification).
- **PF4H (DB uniqueness only at the materialization boundary) — confirmed still not done**, per the
  same `uniqueConstraintPresent: false` result above; `analysis_pass_current` remains a plain view,
  not a uniqueness-enforcing materialization.

---

## ADDENDUM (2026-08-11): Gate 0 + Contract Additions from Review

External review of the Layer 2-4 TODO + Master Feature Ladder correctly
identifies that the missing `atlas_packets` writer (found session 197, Layer
2 Gate 1) is the actual blocking dependency for the whole Pass Fabric — not
a parallel concern. Adding as **new PF0, renumbering nothing else** (existing
PF1-14 stay as-is, this just inserts a harder gate in front of all of them):

### PF-G0: PACKET_IDENTITY_WRITER_PROVEN (blocks all other PF work)

Restated from session 197: `grep` found reads of `packet_key` across
`ace-packet-reader.ts`, `ace-materializer.ts`, etc., but **zero INSERT/UPSERT
into `atlas_packets`** and no located `identity-worker.ts`. Until this is
proven, every downstream pass (structural, lexical, semantic, graph) is
attaching results to an identity whose write path is undefined — a
correctness risk, not just a completeness gap.

**Resolution choice (2026-08-11)**: `packet-key-builder.ts` is the canonical
logical packet identity minting authority. `compute-packet-key.ts` remains
only as a compatibility / scoped-address helper for workspace-scoped flows.
The packet writer path should derive the logical key from canonical
structural fields and must not invent packet identity with a random ULID.

**Action**: locate or rebuild the deterministic writer:
`AstUnit → packet identity → atlas_packets INSERT/UPSERT (packet_key,
source_revision, representation_revision, producer_revision)`. This must
land and be proven **before** PF6/PF7 (CPU worker pool) or PF9 (incremental
eligibility) — those assume packets already have stable identity to key off.

### PF-G0 RECONCILED (2026-08-31, doc-accuracy pass — no code changed)

A later session (memory: `SESSION-200-PACKET-IDENTITY-ALIAS-CONVERGENCE.md`,
2026-08-21) ran the full P0 packet-identity audit this addendum called for
and closed most of PF-G0's concern, though not by "locating a missing
writer" — the finding was sharper than that. Live-verified this pass that
both artifacts below still exist in the tree:

- `sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-resolver.ts`
  — `resolveCanonicalPacketKey(inputKey)`: direct-row match first, alias-table
  fallback, throws typed `PacketIdentityUnresolvedError` on failure (no
  silent fallback). Smoke test:
  `sveltekit-frontend/scripts/smoke-packet-identity-resolver.mjs`.
- `sveltekit-frontend/drizzle/manual/atlas_packet_identity_aliases.sql` —
  live table `atlas_packet_identity_aliases`, additive, zero PK/FK mutation
  on `atlas_packets`.

**What was actually found** (supersedes the "zero INSERT/UPSERT, no
identity-worker.ts" framing above — writers do exist, plural, and mostly
agree): 58,304 of 61,660 live rows use `packet:<12hex>` (sha256 of
`canonicalSourceRef(source_ref)`, truncated), written by
`scripts/atlas/backfill-summary-layers-from-chunks.mjs::derivePacketKey()`.
3,294 rows carried a divergent `ace:packet:<12hex>` prefix — traced to a
**one-line typo** in `scripts/atlas/register-orphaned-chunks.mjs:91`, same
hash algorithm, not a competing scheme. That typo is fixed going forward;
the 3,294 already-written rows were aliased (not renamed, to avoid the
12-table FK-cascade risk a live rename would trigger) rather than migrated.
A full exhaustive sweep (`P0-4 residual`) found several more `*PacketKey()`
builders in the repo, all confirmed dormant/dead (zero live rows) except two
dry-run-only backfill scripts that have never actually been run for real.

**`packet-key-builder.ts::computePacketKey()`** — the function this
addendum names as "the canonical logical packet identity minting
authority" — is real, has 4 live callers, but computes a **structurally
different, node-scoped** key (hashes `source_ref + tree_node_id + title_id`)
than the file-scoped key that's actually live in 58,304+ rows. Session 200
deliberately did NOT collapse this discrepancy — it's frozen as an open
product question (`CURRENT_LIVE_IDENTITY` vs `FINAL_PACKET_IDENTITY_V2 —
NOT_YET_PROVEN`) in a doc comment on that file, not resolved. A
mismatch-guard (`resolvePersistedPacketKey()` in
`semantic-packet-writer.ts`) throws `PACKET_KEY_MISMATCH_CANONICAL_RESOLUTION`
if a caller ever supplies both identity shapes' inputs together — this is a
real, live, untriggered landmine, not inert code.

**Still open, not closed by Session 200**:
- P0-6 (historical PK rename to collapse the 3,294 aliased rows into the
  canonical format) — deliberately deferred, low risk if ever done (only 1
  of the 3,294 rows has a real downstream FK reference), but not done.
- The file-scoped vs. node-scoped grain question above.
- Whether `PF-G0: PACKET_IDENTITY_WRITER_PROVEN` should be marked done as
  originally scoped ("prove a deterministic writer exists") is now `true` —
  writers exist and are traced — but the broader identity-uniqueness
  property PF6/PF7/PF9 actually need ("one packet, one key, no ambiguity")
  is `PARTIAL_PROVEN`, not `PROVEN`, given the two points above. Treat PF-G0
  as unblocking PF6/PF7 (worker pool has something stable to key off for the
  dominant 58,304+ rows) but NOT as licensing PF9's eligibility query to
  assume every `packet_key` uniquely resolves — it must route through
  `resolveCanonicalPacketKey()`, not raw string equality, until P0-6 lands.

**Current code reconciliation (2026-10-04):** the live 12-hex compatibility
recipe now has a shared implementation in
`scripts/atlas/lib/canonical-source-ref.mjs::legacyPacketKeyFromSourceRef()`.
The audited packet-related scripts import it; the same module rejects
truncation collisions and duplicate key/source pairs, and its focused static
writer/guard suite passes 4/4. `upsert-whole-codebase-atlas-packets.mjs` is
apply-quarantined pending revision-qualified packet admission. This proves a
shared legacy recipe and code-level collision behavior only; it does not
resolve file-vs-node packet grain, prove every production caller/runtime, or
replace live-table collision/readback evidence. Keep the 64-hex builder and
V2 scheme distinct; do not infer one from the legacy 12-hex population.

**PLAYWRIGHT-CONFIG-ROLE-01 (2026-10-04; read-only):**
`playwright.config.ts` is the general E2E owner (Chromium and WebGPU projects,
dev-server policy, global setup/teardown). `playwright.screenshot.config.ts`
is a lightweight screenshot-capture config (single Chromium project, fixed
local base URL, no global setup/teardown); its name does not establish visual
baseline comparison. No `toHaveScreenshot` assertion appeared in the scanned
E2E tree. The repository contains additional Playwright configs, so the role
census is partial; do not merge configs, create/approve goldens, or invoke the
general config as a read-only proof because its global fixtures seed/clean DB.

### Job identity key (apply to PF4 ledger + PF1 queue going forward)

The review's job_identity composite is stricter than what's currently in
`analysis_pass_results`: `(packet_key, source_revision, pass_family,
pass_revision, producer_revision, input_hash)` — adds `pass_family` (groups
e.g. `ast_symbols`/`lexical_features` under a family) and `producer_revision`
(which the live table doesn't have as a column). Note for a future PF4
follow-up ALTER, not urgent — current partial unique index already unblocks
idempotency for the common case.

### okf-resolved pass definitions (new concept, not yet built)

Proposal: pass scheduling shouldn't hardcode concurrency/ordering per pass —
resolve a versioned `AtlasPassDefinition` (owner, truthClass:
deterministic/observed/derived/approximate, executionClass: cpu/nlp_sidecar/
gpu_model/graph/telemetry, orderingScope: none/packet/workspace, requires[])
and dispatch against its `executionClass`. This generalizes PF6's resource-class
idea (CPU_LOCAL/NLP_HTTP/GPU_BATCH/LLM_SERIAL_BOUNDED) into a real schema-backed
registry instead of a hardcoded map. **Defer until PF6/PF7 land** — don't
build the generalized registry before the concrete 4-class version proves out.

### Fork-join tool cap stays a query-executor policy, not Pass Fabric concurrency

Confirms PF12's own framing (`executeToolBatch(maxParallel=3)`) is correctly
scoped to the **agent query path**, separate from Pass Fabric's per-executionClass
concurrency (CPU 4-8, embed 3, entity 2, etc.). Already reflected correctly
in SPEC.md's Architecture Layers table — no change needed, just confirms the
existing design was right.

### Deterministic replay as the real completion gate

Adding as new validation gate **G8** (after existing G1-G7):
> Same `source_revision` replayed twice → same packet IDs, same event set,
> same ontology links, same feature inputs, same deterministic baseline
> ranking. Completion order (which worker finishes first) must not affect
> the result — revision + input_hash determine validity, not arrival order.

This is the test that actually proves PF5 (idempotency) + PF9 (incremental
eligibility) work together correctly, not just that they don't crash.

### Explicitly out of scope for this OpenSpec (tracked elsewhere, don't pull in)

The review also covers Kanban integration (§15-16), NLP index coverage
validator (§19), and the full Layer 3/Layer 4 metrics-topology-runtime-training
ladder — these are real but belong to `parent-atlas-graph-analysis-contract`
and the Layer 2/3/4 compiler-output TODO, not to this Pass Fabric spec. Do
NOT merge them into PF1-14 — this spec stays scoped to: durable queue,
worker concurrency, CPU/GPU resource classing, cache batching, tool executor.
Cross-reference only.

### Revised priority order (supersedes "start with PF1" — PF1-3 already done)

1. **PF-G0**: `PARTIAL_PROVEN` as of Session 200 (2026-08-21) — writers exist
   and are traced (see "PF-G0 RECONCILED" above); route through
   `resolveCanonicalPacketKey()` rather than raw `packet_key` equality until
   the file-scoped/node-scoped grain question and P0-6 rename land. No
   longer "not yet started."
2. PF4 follow-up: find/build `analysis_pass_results` writer (in progress, see above)
3. PF6/PF7: CPU worker pool + move structural passes onto it
4. PF9: incremental eligibility (needs PF-G0 resolver wired in + PF4 writer first)
5. PF10/PF11: NLP pass DAG + bounded Ornith
6. PF12/PF13: tool executor + real graph multi-hop

### title_id: the missing hash input to `computePacketKey()` (2026-09-07, connects directly to PF-G0)

A separate Layer-2-backlog reconciliation this session (`parent-atlas-workstation-todo.md`)
independently found that `title_id` — one of the three hash inputs to
`packet-key-builder.ts::computePacketKey()` (`source_ref + tree_node_id + title_id`, see the
PF-G0 section above) — has **zero real producers anywhere in the repo**. Every assignment
site (`classification-envelope-v1.ts`, `feature-extraction-v1.ts`, `graphify-task-candidate.ts`,
`ontology-linked-tuple-v1.ts`, `semantic-packet-v1.ts`, and the materializer in
`enriched-tree-node-contract.ts`) is either a pass-through of an already-`undefined`/`null` value
or, in the materializer's case, a hardcoded `const titleId: string | undefined = undefined;`
(line 113). Its documented meaning (`packet-canonical.ts:25`) is a semantic grouping slug
(`auth.session.validation`, `session-management`), not identity material — so `computePacketKey()`
hashing it as an identity input was already a design question per PF-G0's own framing
(`CURRENT_LIVE_IDENTITY` vs `FINAL_PACKET_IDENTITY_V2 — NOT_YET_PROVEN`), but this adds a second,
more basic blocker: **even if that node-scoped identity scheme is chosen, it cannot run today**,
because one of its three inputs is never populated. `computeTreeNodeId()` (the standalone
`tree-node-id-extractor.ts` implementation, distinct from the live `TreeNodeIdentityAuthoritySchema`
that `enriched-tree-node-contract.ts` actually reads `tree_node_id` from) is also a dead orphan —
zero callers anywhere in `src/` — and should be marked `DEAD_SUPERSEDED`/archived rather than wired
in, per this file's own Duplication Prevention rule, so a future agent doesn't accidentally treat
it as the tree-node-id authority.

**Do not open a new OpenSpec change for this** — it's the same `packet_key`/identity surface PF-G0
already owns. Bounded next step, once PF-G0's file-scoped/node-scoped grain question is actually
decided (not before): write a real `titleId` derivation (deterministic slug from summary/
classification, not a hash/UUID) and wire it into `materializeLinkedTupleDraftsFromEnrichedTreeNode()`.

### LEXICAL-PASS-WRITER-01 — first slice landed and independently re-verified (2026-09-07)

A pure, deterministic `lexical` pass writer landed this session, matching the design discussed
above and independently re-checked line-by-line (not accepted from a self-report):

- `sveltekit-frontend/src/lib/server/analysis/lexical-feature-registry-v1.ts` —
  `runLexicalFeatureRegistryV1()`, a pure function (no I/O, no DB) producing
  `identifiers`/`literals`/`normalizedTerms`/`symbolTerms`/`tokenStats` from raw source content via
  a hand-written comment/string-aware scanner. Explicitly `canonicalAuthority: false`,
  `writesPerformed: false` in its own output schema — matches its stated non-goal (no AST, no NLP,
  no embeddings, no DeepSeek).
- `sveltekit-frontend/src/lib/server/analysis/lexical-pass-ledger-adapter-v1.ts` — converts a
  registry result into the existing `AnalysisPassLedgerInput` shape, throws
  `LEXICAL_PASS_PACKET_KEY_REQUIRED` if `packetKey` is missing (no unqualified rows possible), and
  `proveLexicalPassAdmissionV1()` runs the adapter twice and byte-compares the stable-stringified
  output to prove determinism — still zero DB writes.
- `sveltekit-frontend/src/lib/server/db/schema/analysis-pass-results.ts` — correctly **extended**,
  not duplicated: `git diff` shows exactly one line added
  (`lexical_features: 'deterministic_idempotent'` in the existing `KNOWN_PASS_EXECUTION_SEMANTICS`
  map from the PF4/Session-198 `executionSemantics` correction above). No parallel schema created.

**Independently re-verified, not taken on the report's word**:
- `npx vitest run` on both spec files: **12/12 pass** (6 + 6), confirmed live — matches the claim.
- `npx tsgo --noEmit`: zero errors reference any of the three files.
- `npx openspec validate --strict parent-atlas-pass-fabric`: `Change 'parent-atlas-pass-fabric' is valid`.
- **One real discrepancy found**: `docs/reports/lexical-pass-writer-v1.json`'s own
  `focusedTests: {"passed": 11, "failed": 0}` undercounts by one — actual is 12/12. Minor, but
  flagging it per this repo's evidence-integrity rule (a report claiming test counts is itself a
  claim that should be checked, not just trusted because it looks like a receipt).

**Still open, not yet done** (per the report's own `openGates` and the adapter's own doc comment):
`LEXICAL-PASS-WRITER-01D` — actually calling `recordAnalysisPassResult()` against an explicitly
authorized fixture and reading it back to confirm duplicate delivery reuses the same logical pass
(no live DB write has happened yet, by design) — and `TITLE-ID-SEMANTIC-GROUPING-WRITER-01` above,
unchanged.
7. PF14: tricubic quarantine (low priority, do whenever)

**Goal**: Idempotency + incremental eligibility.

**Schema**:
```sql
CREATE TABLE analysis_pass_results (
  id UUID PRIMARY KEY,
  packet_key TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  producer TEXT NOT NULL,
  producer_revision TEXT NOT NULL,
  pass_name TEXT NOT NULL,
  pass_revision TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  status TEXT CHECK (status IN ('success','failed','skipped')),
  result_json JSONB,
  evidence TEXT[],
  device TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  UNIQUE(packet_key, source_revision, pass_name, pass_revision, input_hash)
);
CREATE INDEX ON analysis_pass_results(packet_key, source_revision);
```

**Acceptance**:
- [ ] Schema created
- [ ] Migration applied

---

## PF5: Enforce Idempotency Uniqueness (30m)

**Goal**: No duplicate pass results.

**Change**: On executeJob success, write to analysis_pass_results with ON CONFLICT DO NOTHING.

**Acceptance**:
- [ ] Duplicate enqueue → UNIQUE constraint rejected, logged
- [ ] Test: run same packet + pass_name twice → only one result_row

---

## PF6: CPU Worker Pool (2-6 threads) (1.5h)

**Goal**: Parallelism for CPU work.

**File**: New `src/lib/server/workers/cpu-pool.ts`

**Exports**:
```typescript
class CpuWorkerPool {
  constructor(count: number); // clamp(availableParallelism(), 2, 6)
  dispatch(jobId: string, work: () => Promise<any>): Promise<any>;
  shutdown(): Promise<void>;
}
```

**Acceptance**:
- [ ] Pool created with correct thread count
- [ ] Jobs dispatch to available workers, queue when full

---

## PF7: Move Structural Passes to Workers (1h)

**Goal**: Offload CPU-intensive work.

**Passes** → CPU workers:
- `structural_v1` (tree-sitter)
- `ast_grep_v1`
- `entropy_v1`
- `feature_normalization_v1`

**Change**: In executeJob, check pass_name resource class, dispatch to workerPool.

**Acceptance**:
- [ ] tree-sitter job routed to worker pool, not event loop
- [ ] 2-3 worker threads active during structural pass

---

## PF8: Valkey Batch Cache Contract (1h)

**Goal**: No single-key Redis operations.

**File**: `src/lib/server/cache/atlas-hot-cache.ts`

**Interface**:
```typescript
interface AtlasHotCache {
  mgetPassResults(keys: string[]): Promise<(AnalysisPassResult | null)[]>;
  msetPassResults(entries: [string, AnalysisPassResult][]): Promise<void>;
}

class ValkeyCacheImpl implements AtlasHotCache {
  async mgetPassResults(keys: string[]) {
    const batches = chunk(keys, 128);
    // MGET each batch, not GET each key
  }
  async msetPassResults(entries: [string, AnalysisPassResult][]) {
    const batches = chunk(entries, 128);
    // MSET each batch, not SET each key
  }
}
```

**Acceptance**:
- [ ] No direct redis.get() / redis.set() calls
- [ ] All batched MGET/MSET with max 128 keys

---

## PF9: Incremental Eligibility Query (1h)

**Goal**: Skip already-processed packets.

**Query**:
```sql
SELECT ap.* FROM atlas_packets ap
LEFT JOIN analysis_pass_results apr 
  ON ap.packet_key = apr.packet_key 
  AND ap.source_revision = apr.source_revision 
  AND apr.pass_name = $1 
  AND apr.pass_revision = $2 
  AND apr.status = 'success'
WHERE apr.id IS NULL
LIMIT 1000;
```

**Acceptance**:
- [ ] Corpus re-run skips 99%+ packets from prior run
- [ ] Only new/stale packets enqueued

---

## PF10: NLP Pass DAG Ordering (1h)

**Goal**: Semantic passes depend on linguistic facts.

**Order**:
1. structural_v1 (tree-sitter)
2. ast_grep_v1 (AST indexing)
3. linguistic_v1 (spaCy NLP sidecar)
4. semantic_768_v1 (embedding, after linguistic facts available)
5. optional: ornith_pattern_v1 (enrichment)

**Change**: Add pass_depends_on field, check before enqueue.

**Acceptance**:
- [ ] linguistic_v1 enqueued before semantic_768_v1

---

## PF11: Bounded Ornith Enrichment (1h)

**Goal**: Ornith only on changed/underconfident/complex/high-authority packets.

**Conditions**:
```typescript
shouldRunOrnith(packet) {
  return packet.sourceChanged 
    || packet.semanticConfidence < 0.65
    || packet.structuralComplexity > threshold
    || packet.authorityPercentile > 0.95;
}
```

**Acceptance**:
- [ ] Ornith skipped on trivial packets
- [ ] Cost tracking: < 5% of total GPU time

---

### Cross-reference (2026-09-07): a live, simpler tool executor already exists elsewhere and must
### be reconciled with this PF12 design before PF12 is built, not left as a second peer owner

`sveltekit-frontend/src/lib/server/ai/acp-rpc-loop.ts::executeToolCallsInParallel()` is real, live,
and already runs same-turn MCP tool calls concurrently today (`Promise.all`, no `maxParallel` cap,
no `effect: 'read'|'write'` distinction, no `dependsOn` DAG) — a plain fork-join with no admission
policy at all. PF12 below specs a DAG-aware, effect-flagged executor for a different call path
("agent queries"). Per this repo's Duplication Prevention rule: before implementing PF12's
`executeToolBatch()`, check whether it should *replace* `executeToolCallsInParallel()`'s call site
in `acp-rpc-loop.ts` (one canonical tool-executor owner) rather than becoming a second, parallel
implementation of "run several tool calls with some concurrency bound." Neither one currently has a
`resourceKey`-based keyed-write-serialization concept (PF12's `effect: 'read'|'write'` is coarser
than that) — flagged as an open correctness gap on both paths, not just the ACP RPC one: no MCP tool
registered in this repo mutates shared state today, so there is no live incident forcing this yet,
but the eventual real fix is one shared executor with a per-tool concurrency policy, not two.

## PF12: executeToolBatch(maxParallel=3) (1.5h)

**Goal**: Fork-join tool executor for agent queries.

**File**: `src/lib/server/executor/tool-batch.ts`

**Interface**:
```typescript
interface ToolCall {
  id: string;
  tool: string;
  input: unknown;
  effect: 'read' | 'write';
  dependsOn?: string[];
}

async function executeToolBatch(
  calls: ToolCall[],
  maxParallel: number = 3,
  timeoutMs: number = 30000
): Promise<ToolResult[]>
```

**Logic**:
- Build DAG
- Batch ready calls (up to maxParallel)
- Unblock dependents as results arrive
- Error if deadlock

**Acceptance**:
- [x] 3 independent read calls execute in parallel
- [x] Graph expansion waits for ANN seed
- [x] Test: 5 calls → batched as [3] then [2]

**Proof (2026-09-28; fixture/code only)**: `src/lib/server/executor/tool-batch.ts`
is the shared bounded scheduler used by the existing ACP call path. Three
explicitly known mock-read tools may overlap (cap 3); unclassified tools are
serialized as writes. The scheduler validates dependencies/cycles, skips
dependents after prerequisite failure, and preserves input result order.
Focused tests passed 10/10 across the scheduler and ACP adapter; the full
SvelteKit check passed with 0 errors and 291 existing warnings. The ACP
dispatcher remains mock-only; this does not prove live MCP effect policy,
resource-key serialization, or production tool execution. No datastore writes
or model calls were made.

---

### HYPERRAG packet-incidence lineage — prerequisite to PF13 / MULTIHOP-FILL-01

**Authority boundary:** Graphify emits structural facts; the Parent Atlas packet
identity resolver binds exact endpoints; `PacketIncidenceLineageV1` binds those
facts to a frozen workspace/graph/source revision; PostgreSQL packet incidence
is the admitted materialization; HyperRAG is a read-only exact-revision
consumer. Neither taxonomy hyperedges nor HyperRAG may become the incidence
writer.

**Independent read-only PostgreSQL census (2026-10-04, `legal_ai_db.public`):**
`graphify_edges` exists but has no rows; `atlas_packet_incidence` does not
exist; `atlas_hyperedges` contains 62,802 taxonomy rows, all with
`packet_key IS NULL` (zero packet-keyed rows), although those rows have
workspace, graph, and source revisions plus evidence refs; and
`atlas_ontology_linked_tuples` exists but has no rows. Revision/evidence fields
do not turn a taxonomy relation into packet incidence without exact packet
endpoints. Re-stamping or refreshing these taxonomy rows cannot satisfy the
lineage gate. The local migration/writer files are untracked scaffolding, not
an admitted or production-wired writer. No writes were performed.

**Bounded live extractor probe (2026-10-04; diagnostic only):** the existing
8095 Tree-sitter provider processed the unchanged
`graphify-import-target-resolver-v1.ts` source revision
`sha256:3d7e0b30b5f387e6d547ea1fd42be1bb2da6ba00688e3edb6109c7d90743b2e9` and
returned 64 chunks, 344 raw edges, and 298 compiled reference facts. The
projection adapter initially grounded 292/298. The six unresolved facts
referenced TypeScript `type_identifier` nodes that the shared occurrence helper
did not include. After adding that node type, the focused Python tests pass
15/15 in the 8095 container, and the actual HTTP route now grounds all 298/298
facts with no reference-span diagnostics. The provider response remains
64 chunks/344 raw edges; `canonicalAuthority=false`, persistence was not
attempted, and `writesPerformed=false`. This proves exact source-span
extraction for this one source only. The diagnostic used
`git:2b01bba4ed3fa7358cb60f55a2b6eee2b1cdf6b4` as a base revision, not a sealed
working-tree/Graphify snapshot. It therefore does not prove packet endpoint
identity, production projection wiring, or graph-output revision lineage.
Four focused TypeScript files pass 29/29 tests. The container's read-only
source mount required a controlled sidecar restart to load the helper change;
no Graphify projection or database write was performed. A separate read-only
PostgreSQL check found `graphify_edges` still has zero rows and `graphify_files`
has no row for this probe's sourceRef, so this source cannot qualify for the
canonical packet-endpoint resolver cohort.

**Span-coordinate contract clarification (2026-10-04):** do not describe the
8095 HTTP span fields as raw Tree-sitter `Point` values. The live chunker
adapter's `startLine`/`endLine` are 1-based and its columns are zero-based
Unicode code-point counts; the converter maps those to zero-based output rows
and UTF-8 byte offsets. The converter regression uses an emoji prefix where
API column 8 maps to byte offset 11, and verifies the exact UTF-8 source slice.
The separate 298/298 live route span check validates resulting spans for this
one source. Therefore `8095 adapter→UTF-8 byte span` is proven for the bounded
probe; `8095 input column is already a byte column` is explicitly false. Do
not apply native parser point semantics directly across this adapter boundary.

**Production-consumer reachability (2026-10-04):** the ACE context assembler
calls `retrieveMultihopContext` from `context-assembler.ts`; that existing path
queries Qdrant and then performs a bounded Neo4j traversal over generic
`stableKey`/`sourceRef`/`id` matches and populates `neo4j_neighbors`. The
HyperRAG packet RPC forwards that field. In contrast, source search found no
non-test production caller for `executeKagQuickHopV1`,
`runKagQuickHopV1`, or `readKagHyperedgesStrictV1`; the PostgreSQL strict-reader
composition currently exists as library/test coverage only. The existing ACE
Neo4j path therefore proves a separate multi-hop implementation, not
revision-qualified packet-incidence consumption.

**Expanded read-only endpoint-join census (2026-10-04; correction):** an
initial query compared the wrong `graphify_files.source_revision` field; the
endpoint resolver correctly uses `code_source_revision`. Rechecking the live
database found 17,475 exact `source_ref` file/packet pairs, of which 15,985
also match `code_source_revision=atlas_packets.source_revision`. However, all
56,646 joined source/revision rows have NULL packet `byte_start`/`byte_end`, so
zero Graphify symbol spans can be contained by a packet. Zero file/packet pairs
match `graphify_files.workspace_revision=atlas_packets.workspace_revision_key`;
the current values belong to different revision sets. All 26,014
`graphify_files` rows have `source_revision_authority` unset/not `PROVEN`, and
44 lack a workspace revision. A separate exact `source_ref` join to
      `codebase_chunk_index` found zero matching code-source revisions or workspace
      revisions, so that projection does not currently fill the gap. This is not a
      usable endpoint-resolver cohort: exact source revision alone cannot substitute
      for packet span and workspace binding. The existing
      `atlas_chunk_packet_identity_links` projection also cannot qualify: all
      105,762 rows have NULL `source_revision`; its 4,517
      `EXACT_CANONICAL_ID` rows therefore do not prove source-revision lineage.
      Of 53,380 links joining to a `codebase_chunk_index` row, none has an exact
      source-revision binding. The census ran in a read-only transaction and
      rolled back.

**Existing chunk-lineage bridge census (2026-10-04; candidate-only):**
`atlas_packet_chunk_lineage` contains 125,065 rows whose exact `source_ref` and
`source_revision` match a `graphify_files` source and `code_source_revision`.
Joining `canonical_chunk_id` to `codebase_chunk_index.chunk_id`, then using the
chunk's line bounds, yields 35,171 symbol→packet candidates with
`EXACT_SINGLE_MEMBER` or `EXACT_MULTI_MEMBER` and `revision_status=PROVEN`.
However, none has `graphify_files.workspace_revision` equal to its packet's
`workspace_revision_key`. The joined `codebase_chunk_index` rows also have no
matching source/workspace revision fields, so their line bounds cannot be
independently bound to the graph file revision. This is a promising existing
bridge to harden, not admitted endpoint evidence; do not bypass the workspace
or chunk-revision checks.

**Graph snapshot/run-owner readback (2026-10-04):** `atlas_graph_snapshots_v2`
contains two rows and both are `SUPERSEDED`; the table stores source/topology/
policy hashes but no explicit workspace or graph revision binding. The latest
completed `graphify_runs` record (`01a8d8fc-2507-4f39-868e-039039237b98`) names
the packet workspace key `sha256:e24bb971…` and 25,542 source files, but has
zero `graphify_files` rows linked by either `first_seen_run_id` or
`last_seen_run_id`. The latest run actually linked to a Graphify file
population is the 2026-09-05 run at workspace `sha256:e0dc2711…`; its 23,758
files have no `PROVEN` source-revision authority, and that workspace does not
match current packet workspace keys. A separate sealed graph-snapshot artifact
does exist for `repo:root` at workspace `sha256:e24bb971…`; its global manifest
declares graph revision `dff9006f…`, while the root shard records 48,339 nodes,
32,226 edges, `MATERIALIZED`, `replayMatches=true`, and `sealed=true`. This
does not qualify as the structural graph-output revision needed for packet
incidence: the inspected edge projection contains only `DERIVED_FROM` and
`CONTAINS` (no code-reference/call/import facts), and its Parquet edge bytes do
not match the declared legacy table hash. Preserve this as a sealed topology
snapshot, not as packet-incidence evidence. The run ledger and this snapshot
therefore still provide no admitted structural graph-output revision for
`HYPERRAG-LIVE-BINDING-01`.

**Workspace-binding hardening (2026-10-04):** the endpoint resolver now checks
each packet's `workspace_revision_key` against the frozen edge workspace at
both initial symbol/packet join and independent packet identity readback.
The shared Postgres lineage verifier also selects and checks
`workspace_revision_key` for both packet endpoints before resolving them;
missing or cross-workspace values fail closed. A fresh focused resolver,
materializer, and lineage run passes 12/12, including missing/stale workspace
rejection. The full `npm run check` was stopped after several minutes at about
4.7 GB process memory with no diagnostics; full Svelte/TypeScript validation
remains `UNVERIFIED`, not failed. This closes a code-level fail-closed gap
only; no live packet qualifies under the current mismatched revisions and
missing packet spans.

**Live extractor and projection-map probe (2026-10-04):** the running 8095
`/ast/chunk` endpoint returned HTTP 200 for
`sveltekit-frontend/src/lib/server/atlas/lineage/packet-incidence-lineage-v1.ts`.
The request source bytes were independently SHA-256 hashed and the response
echoed that token; extraction returned 56 chunks, 314 edges, 270 edges with
occurrence positions (471 positions), and zero diagnostics. This is a live
extractor result, not a graph/workspace admission receipt: the response echoes
the caller-supplied source revision, and no exact packet/symbol/workspace join
was performed. The updated structural adapter and projection-map suites pass
25/25 across four files. A repository search found no production caller of
`compileGraphifyStructuralIntelligence`; it is currently exercised by tests
only. Therefore the map builder is `CREATED_AND_FOCUSED_TESTED`, not wired to a
live Graphify/Parent Atlas producer, and the real incidence cohort remains
unproven.

- [x] HYPERRAG-LINEAGE-01 — freeze and test `PacketIncidenceLineageV1` as a
      deterministic derived record with schema-enforced
      `canonicalAuthority=false`. Focused validation on 2026-10-04 passed 24/24
      across six lineage, resolver, projection, and materializer suites; the
      candidate materializer performs no persistence. This closes the pure
      contract gate only, not live packet-incidence evidence or any canary-write
      gate.
- [ ] HYPERRAG-LINEAGE-02 — identify and admit exactly one existing Graphify
      projection stage as the packet-incidence producer. Current live census
      has zero `graphify_edges`; writer ownership remains unresolved. A
      read-only source census across TypeScript, JavaScript, MJS, Python, Go,
      and SQL found no `INSERT`/upsert producer for `graphify_edges`. The
      existing `graphify-symbol-writer-v1.ts` persists symbols only; its GSP-5
      edge path is planned, not implemented. The manual SQL file defines the
      table but is not a producer. Do not designate Graphify merely because
      its name or schema is present.
- [ ] HYPERRAG-LINEAGE-03 — resolve both structural edge endpoints to exact
      canonical packet identity using revision-qualified identity evidence.
      No path/fuzzy/semantic/taxonomy identity fallback is allowed. A live
      298-fact same-source extraction cohort now has exact source spans, but
      no facts have yet been joined to two exact canonical packet endpoints:
      although 15,985 live file/packet pairs match `code_source_revision`, the
      joined packet rows lack byte spans and no matching workspace revision key
      exists in the live Graphify/packet join. The sealed root topology snapshot
      is workspace-bound but contains only `DERIVED_FROM`/`CONTAINS` edges, not
      structural reference facts. The 35,171 candidates through chunk lineage remain ineligible
      because `codebase_chunk_index` lacks its own exact revision binding. The
      endpoint resolver now rejects packet workspace-revision drift on both
      initial join and independent readback; this is focused-test evidence, not
      a live admitted endpoint pair. No facts are bound to a sealed graph-output
      structural-edge revision; the existing sealed root snapshot is topology
      only and cannot supply incidence edges.
- [ ] HYPERRAG-LINEAGE-04 — bind packet, neighbor, source, workspace, and graph
      revisions from one frozen snapshot. A `source_manifest_digest` alone is
      not proof of the graph-output revision; never substitute current `HEAD`.
- [ ] HYPERRAG-LIVE-BINDING-01 — find and run a bounded live cohort of 1–5
      files with exact `graphify_files.code_source_revision`, symbol spans,
      packet identity/source revision/span, matching packet and file workspace
      revision keys, and one admitted graph snapshot. Run the live 8095 extractor
      and build `PacketIncidenceLineageV1` in memory; require at least one fully
      qualified edge with non-empty evidence refs and `writesPerformed=false`.
      Current read-only census result is `NO_REVISION_QUALIFIED_LIVE_SOURCE_COHORT`:
      15,985 source-revision matches but zero packet span matches, zero exact
      workspace-revision matches in the live Graphify/packet join, and no
      admitted structural-edge snapshot. The sealed root topology artifact is
      workspace-bound but contains no structural reference edges. Do not run
      `graphify:daily` or write incidence rows to manufacture this cohort.
- [ ] HYPERRAG-LINEAGE-05 — require non-empty, source-grounded `evidenceRefs`
      for each endpoint relation; empty or guessed evidence rejects the edge.
- [ ] HYPERRAG-LINEAGE-06 — calculate and independently recompute deterministic
      `inputChecksum` and `lineageChecksum` over canonical serialization.
- [ ] HYPERRAG-LINEAGE-07 — only after the prior gates and separate write
      authorization, persist a bounded 20–100 row canary. No schema apply or
      canary write is authorized by this ledger update. A working-tree draft
      exists at
      `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-packet-incidence-writer-v1.ts`,
      but it has no discovered caller or focused writer spec. Its `apply=true`
      plus non-empty string `authorizationRef` is not an independently
      verified authorization receipt. Treat it as an unadmitted code candidate;
      do not invoke it or apply its migration until a separately reviewed,
      snapshot/checksum-bound authorization and writer tests exist.
- [ ] HYPERRAG-LINEAGE-08 — independently read back every canary row and verify
      both packet identities, all revisions, evidence refs, and checksums.
- [ ] HYPERRAG-LINEAGE-09 — prove production HyperRAG consumes only those
      exact-revision incidence rows. The strict reader and composition point
      exist, but no non-test production caller was found; the live ACE Neo4j
      traversal is a separate, non-equivalent path. No packet incidence is read.
- [ ] MULTIHOP-FILL-01 — run the first real bounded packet→packet→packet
      expansion only after exact-revision incidence readback succeeds.

**Current state:** contract/resolver/reader paths have source and focused-test
coverage; production incidence writer `UNRESOLVED`; live packet incidence
`ABSENT`; taxonomy hyperedges `NOT VALID PACKET INCIDENCE`; `MULTIHOP-FILL-01`
`BLOCKED`. Existing PF13 evidence (27/27 mocked/code tests) proves bounded
Neo4j adapter behavior only, not this PostgreSQL packet-incidence path.

---

## PF13: Real Multi-Hop Graph Expansion (1h)

**Goal**: 1-2 hop neighbor traversal from ANN seed.

**Change**: Graph expansion only runs after dense_search results available.

**Acceptance**:
- [x] Graph expansion depends_on: dense_search
- [x] Returns 1-2 hop neighbors + edges

**Proof (2026-09-28; mocked Neo4j read boundary)**: `graph-retriever.ts`
now returns the actual path depth, relationship types, and ordered edge
endpoints returned by the bounded Neo4j query. Its test covers one- and
two-hop results and rejects malformed paths; invalid depth/candidate limits
fail closed before a session opens. SearchRuntime now selects only raw pre-fusion
`dense_768` candidates with explicit canonical identity; the adapter passes
that set to graph retrieval and skips graph expansion when the set is empty.
Tests exclude lexical/noncanonical candidates and verify adapter wiring. The
three focused suites passed 27/27. This is code/fixture proof only, not live
SearchRuntime or Neo4j execution evidence.

---

## PF14: Quarantine Fake Tricubic (30m)

**Goal**: Math correctness. Rename non-tricubic implementation.

**Change**: `tricubicSearch()` → `cubicKernelNeighborhoodExperimental()`

**Note**: Real tricubic interpolation deferred (requires 3D lattice + 64-sample neighborhood).

**Acceptance**:
- [x] Renamed in all callers to `cubicKernelNeighborhoodExperimental()`;
      the scalar weight helper is `cubicKernelWeightExperimental()`.
- [x] Governance: the CLI help, runtime label, and source comments identify
      this as an experimental, noncanonical neighborhood only. The existing
      `--tricube` flag and output behavior are preserved; real 3D lattice
      interpolation remains deferred.

---

## Validation Gates (All Tasks)

After each PF, run:
```bash
npm run atlas:pass-fabric:validate:pfN
```

Expected:
- G1: claimBatch throughput 2-4× baseline
- G2: Polling latency <100ms (pg_notify wake)
- G3: Corpus re-run skips 99%+ packets
- G4: CPU worker cores active
- G5: Valkey no single-key ops
- G6: Tool executor respects parallelism + DAG
- G7: E2E throughput increases

---

## E2E Validation (Final)

```bash
npm run atlas:corpus:pass-fabric:e2e
```

Expects:
- 58K packets → all passes complete
- Re-run same corpus → 99% skip (incremental eligibility)
- Total time reduced 2-4× vs baseline

---

## Lexical pass writer (2026-09-07)

The first lexical slice is a pure, read-only derivation under the existing
analysis owner. It does not write `feature_lexical_facts`, register a worker,
or promote taxonomy/domain meaning. The existing DB extractors remain outside
this slice until their input identity and pass-receipt adapter are proven.

- [x] LEXICAL-PASS-WRITER-01A — add `LexicalFeatureRegistryV1` with exact
  `sourceRef`, `sourceRevision`, `workspaceRevision`, content checksum, and
  extractor revision; emit identifiers, literals, normalized terms, symbol
  terms, and token statistics without datastore/queue access.
- [x] LEXICAL-PASS-WRITER-01B — prove deterministic ordering, UTF-8 content
  hashing, comment exclusion, literal capture, empty input, and revision
  changes with focused tests.
- [x] LEXICAL-PASS-WRITER-01C — add a pure pass-fabric adapter that maps the pure
  result to the existing `analysis_pass_results` receipt contract; require
  packet identity and both source/pass revisions before any future write.
- [ ] LEXICAL-PASS-WRITER-01D — run bounded live readback/idempotency proof
  before enabling the opt-in worker or admitting `feature_lexical_facts` materialization.
- [x] LEXICAL-PASS-WRITER-01D-PRECHECK — prove repeated adapter construction
  produces the same ledger identity and payload without a database write.
- [x] LEXICAL-PASS-WRITER-01C-IDEMPOTENCY — register `lexical_features` as a
  deterministic pass so the existing ledger can reuse the logical result on
  duplicate delivery once live admission is authorized.

### Lexical worker integration — 2026-09-07

- [x] Add `lexical-pass-executor-v1.ts`: resolve packet aliases using the existing
  canonical resolver, independently load `atlas_packets`, require the exact
  source path, content checksum, and numeric workspace revision, then extract.
- [x] Harden the pure adapter: verify its payload checksum and identity strings;
  include workspace, source, language, and extractor revision in the input hash.
- [x] Wire `lexical_feature_registry` into the existing job worker behind
  `ATLAS_LEXICAL_PASS_ENABLED=true` (read at worker module startup). Persist only
  through `recordAnalysisPassResult`, independently read the row by ID, and skip
  the worker's generic second ledger write. The existing `enqueueJob` accepts
  `jobType: 'lexical_feature_registry'` and the source fields in `result`.
- [x] Test the persisted queue-envelope handoff, canonical alias resolution,
  sequential fixture reuse, cross-workspace identity separation, corrupt
  payload/readback, missing ledger, and UTF-8 input bounds.
- [ ] Replay a bounded whole-source JS/TS fixture against the actual PostgreSQL
  writer and worker; independently verify job completion and ledger reuse before
  enabling this stage for production jobs. No worker was started or job enqueued
  by this implementation turn.
- [ ] Prove concurrent duplicate delivery separately: the generic ledger currently
  does select-then-insert, and per-process concurrency 1 is not a global uniqueness
  guarantee. Sequential in-memory fixture reuse does not close this gate.
- [ ] Add authoritative source adapters for chunk/git-revision formats and broader
  language coverage before accepting those jobs. This first executor accepts at
  most 256 KiB UTF-8, JS/TS, `sourceRevision: sha256:<content hash>`, and the stored
  numeric workspace revision serialized as a string. Its heuristic lexical terms
  are derived observations, not AST facts, BM25 relevance, ontology promotion,
  a new retrieval vote, or an embedding input policy.

Report: `docs/reports/lexical-pass-writer-v1.json`. Live PostgreSQL replay,
downstream lexical materialization, and ACE admission remain open; no migration,
Qdrant projection, model call, or cache write was performed.

Validation: 24/24 tests across extractor (6), adapter (8), executor (10).
Root OpenSpec strict validation and targeted diff checks pass. Compiler analysis
of the five implementation entrypoints reports zero diagnostics in those files;
one dependency error remains in `cache-keys.ts:663` (`admission.reason`, TS2339).
This is not a repository-wide typecheck pass. The worker gate type now uses the
existing `entityGate` type rather than an unavailable `p-limit.default` type export.

Related blockers remain separate: the repository currently has conflicting
`title_id` generator/regex contracts, so `TITLE-ID-SEMANTIC-GROUPING-WRITER-01`
requires its own reconciliation and is not closed by the lexical writer.

### GRAPH-CPU-GPU-PARITY: nx-cugraph added as an execution mode, not a new harness (2026-09-07)

Cross-reference, not part of this change's own scope — recorded here only because it directly
answers a duplication-prevention question raised against this file's PageRank/NetworkX↔cuGraph
material above. A separate conversation proposed building new `GRAPH-CPU-GPU-PARITY-01/02/03`
gates around NetworkX-vs-cuGraph parity for BFS/PageRank/Louvain. That parity oracle **already
exists and is already proven** in this repo two ways: `python/atlas_compute/gpu_mini_fabric/`
(small synthetic fixture, `GRAPH-PAGERANK-01/02`, `rankCorrelation: 0.99992`) and
`python/graph_snapshot_parity_networkx_oracle.py` / `graph_snapshot_parity_cugraph_oracle.py`
(production-scale, 162,234 nodes, `pagerankCorrelation: 1`, `louvainCommunityAgreement: 1`, see
CLAUDE.md's "NetworkX vs. Neo4j" correction). Building a third harness would have been a real
duplicate-owner violation per this repo's Duplication Prevention rule.

What's genuinely new and additive: `nx-cugraph` (RAPIDS' zero-code-change NetworkX GPU backend,
confirmed GA, `NX_CUGRAPH_AUTOCONFIG`/`backend=` dispatch) is architecturally a different
mechanism from both existing oracles — it runs the *same NetworkX API calls*, GPU-dispatched,
rather than either backend's own hand-written CPU or direct-cuDF/cuGraph implementation. Added
as an **optional `--backend cugraph` flag** to `python/graph_snapshot_parity_networkx_oracle.py`
(NOT to `graph_snapshot_parity_cugraph_oracle.py`, which already bypasses NetworkX entirely for
resident-VRAM performance and doesn't need this) — default behavior (`--backend networkx`)
completely unchanged. Confirmed `nx_cugraph` is already installed in the existing
`atlas-rapids-cu13` WSL2 env at version `26.06.00` (matches the rest of the RAPIDS stack — no
upgrade performed or needed, consistent with this repo's rule against bumping past 26.06 without
a justified capability gap).

**Bounded-fixture proof run** (synthetic 500-node/1495-edge graph, `random.seed(42)`, real WSL2
`atlas-rapids-cu13` execution, not simulated): connected-components match exactly (1 == 1);
PageRank matches to floating-point noise (`maxAbsoluteDelta: 4.3e-18`, top-10 overlap 10/10);
Louvain community count/modularity differ between runs (13 vs 21 communities) — but this matches
the oracle script's own pre-existing comment that NetworkX's Louvain is unseeded and
order/randomness-sensitive on **both** backends (re-running the CPU-only path twice in this same
session already produced 14 then 13 communities on identical input). Full receipt:
`docs/reports/nx-cugraph-backend-dispatch-parity-v1.json`.

**Still open**: this proves the mechanism works on a small synthetic fixture, not that nx-cugraph
matches at production scale — that needs a run against the real frozen corpus underlying
`docs/reports/graph-snapshot-parity/receipt.json`, plus proper ARI/NMI comparison for Louvain
specifically (not raw community-count diffing, which this repo already knows is the wrong metric
for community-detection parity).

### BOUNDED-NLP-STAGED-OBSERVATIONS-01 — safe enrichment before projection

- [ ] Freeze a bounded packet cohort through the existing source/packet resolver; require a real
  `packetKey` and preserve absent `sourceRevision` / `workspaceRevision` as null rather than
  deriving them from paths or current rows.
- [ ] Select bounded domain/topic/entity/POS/concept extraction passes from existing producers;
  outputs remain candidate observations and cannot write canonical feature, concept, entity,
  relation, retrieval, or evidence state.
- [x] Reconcile the existing `analysis_pass_results` status contract before persisting staged
  observations. `succeeded` remains execution status; explicit opt-in `stageAsCandidateOnly` stores
  `CANDIDATE_ONLY` in provenance without adding a DB status or migration. The writer resolves the
  supplied packet key through the existing packet-row resolver, stores the resolved physical key
  in the FK column, and records direct-versus-alias resolution in provenance without claiming
  PacketKeyV2 logical identity. It fails closed on unresolved/mismatched identity, rejects
  integration-event fanout, and rejects deterministic reuse without matching staged disposition.
  Focused identity/writer suites pass 15/15; centroid manifest/card contract tests pass 12/12.
  One bounded `spacy_entities` observation was staged for the exact existing packet row
  `packet:b13af559f410` and independently read back as candidate-only. This is a one-row canary,
  not proof of a bounded batch, full pass-family coverage, append-only behavior, or worker rollout.
- [ ] Prove bounded batch limits, deterministic producer/input checksums where applicable,
  append-only receipt behavior, and independent readback before enabling any worker or live pass.
  **Canary evidence (2026-10-03):** one exact packet row was staged and independently read back;
  a second execution reused row `11146` with identical input/output checksums and inserted no row.
  Reports: `docs/reports/analysis-pass-staging/nlp-stage-1791002497054-53184.json` and
  `docs/reports/analysis-pass-staging/nlp-stage-1791003261014-61356.json`. This does not prove
  batch ceilings, concurrent duplicate delivery, or append-only behavior; those remain open.
- [x] Add the pure `AnalysisPassAdmissionEnvelopeV1` classifier to the existing pass-results
  owner. It keeps execution and admission orthogonal, never derives packet identity from
  `evidenceId`/paths/current rows, preserves incomplete lineage as `OBSERVATION_ONLY`, and
  never authorizes persistence or emits `ADMITTED`. It consumes the existing typed
  `PacketKeyResolutionV2` output (including canonical/storage key and alias evidence), not a
  boolean attestation. Focused unit tests cover exact lineage,
  missing/unverified packet identity, missing revisions, failed execution, grounded evidence,
  checksum tampering, and deterministic replay. This is not a DB state, migration, batch run,
  or additional live pass write.
- [x] Add pure `NlpStagingCohortV1` freeze/verify helpers to the same pass-results owner. The
  contract permits only 8/16/32 members, requires exact resolver outputs and one shared
  workspace revision, rejects duplicate logical source refs, requires mixed caller-provided
  existing domain-class labels, labels null source revisions
  `REVISION_PARTIAL`, and deterministically seals sorted members. Focused tests cover replay,
  malformed size, workspace mismatch, duplicate source, unresolved identity, and tampering.
  This only freezes a cohort artifact contract; no cohort was selected from PostgreSQL and no
  NLP rows were appended. Keep the bounded live-cohort task open.

**Contract progress (2026-10-03):** Added `buildStagedAnalysisPassObservationV1()` and
`buildStagedAnalysisPassLedgerEntryV1()` to the existing `analysis_pass_results` schema owner, plus
an explicit `stageAsCandidateOnly` option on its existing writer. Staged rows require a packet key
resolved to an existing physical packet row through the existing resolver, producer/pass revisions,
and successful execution; keep execution status separate from
`admissionDisposition: CANDIDATE_ONLY`; retain absent source/workspace revisions as
null; and bind ledger-input/output checksums while preserving any declared input hash separately.
The opt-in writer stores the resolved physical packet reference and resolver lineage in row
provenance, without claiming PacketKeyV2 logical identity; it rejects integration-event fanout,
unresolved identity, or deduplication against an unstaged row. Focused fixture tests cover the
contract and mocked writer only. No cohort
was frozen, no pass was run/persisted, no live readback occurred, no database status/migration was
added, and bounded producer selection/readback remain open.

## Computer-engineering knowledge classification and MCP tool ranking

This sequence turns repository and admitted external evidence into cited,
revision-bound computer-engineering topic/domain candidates, then uses the
existing MCP tool-selection path to recommend bounded evidence tools. It does
not add a second taxonomy, classifier owner, index, ranker, or MCP dispatcher.

**Existing owner map to reconcile (presence is not runtime proof):**
- `.okf/manifest.yaml` registers language, domain, corpus, and index manifests;
  its language registry currently lists only `typescript.yaml`.
- `.okf/domains/feature-intelligence.yaml` defines the feature-intelligence
  vocabulary and authority boundary; `.okf/indexes/feature-intelligence.yaml`
  and `.okf/indexes/code-exploration.yaml` describe derived index roles.
- `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts` owns the current
  `domain_class` normalization/classification behavior. The existing runtime
  contracts include `DomainClassificationV1Schema` and the language/evidence
  schemas in `atlas/contracts/` and `atlas/language/`.
- `sveltekit-frontend/src/lib/server/atlas/language/language-intelligence-plan.ts`
  distinguishes Tree-sitter structure, TypeScript-family ts-morph semantics,
  and cross-language LSP semantics. Its declared language enum and availability
  flags do not prove that a grammar or language server is installed/live.
- `sveltekit-frontend/src/lib/server/ai/tool-selection-policy.ts` already owns
  deterministic `rankToolsByQuery()` and descriptor selection policy; reconcile
  its caller in `tool-selection.ts`, the live MCP `tools/list` registry, and the
  current dispatch boundary before changing ranking or adding tools.

Keep these axes distinct and explicitly cross-walked rather than flattened into
one `domain` enum: routing domain; ontology domain; artifact/source kind; topic
or concept; algorithm family; programming language; data-source type; task
intent; retrieval intent; query shape. Tree-sitter/LSP observations, model
classifications, similarity scores, and tool ranks remain derived evidence, not
canonical identity, authorization, task state, or proof.

### Ordered implementation gates

- [ ] ENG-CLASSIFICATION-OWNER-01 — reconcile `.okf/manifest.yaml`, existing
  `.okf/domains/` and `.okf/languages/` schemas, index manifests,
  `domain-taxonomy.ts`, `DomainClassificationV1Schema`, and the language
  intelligence planner. Record one owner per vocabulary/behavior, its revision,
  consumers, and exact crosswalks. Reuse existing domain classifiers; do not
  create a parallel domain service or claim `OTHER` means supported.
- [ ] ENG-CLASSIFICATION-PACKET-E2E-01 — invoke that owner on the same frozen
  packet used by LINEAGE-E2E-01 and capture its real output, model/checkpoint
  revision, input/output checksums, exact packet identity, and evidence refs in
  the diagnostic receipt. A live `/analyze` or MCP smoke on another input is
  component evidence only. Same-packet live classify receipt passed on
  2026-10-05; see `docs/reports/lineage-e2e-01-derivation-slice-v1.json`.
- [ ] ENG-CLASSIFICATION-FEATURE-ROUTING-01 — determine whether the existing
  feature/routing contracts can carry NB/LR probabilities as derived evidence.
  Do not coerce model output into `DomainClassificationV1` or canonical
  taxonomy labels. Add a typed adapter only after owner/schema reconciliation;
  preserve the classifier pass revision and checksum through routing.
- [ ] ENG-CLASSIFIER-EVALUATION-01 — evaluate MultinomialNB and
  LogisticRegression as separate domain-probability challengers using current
  checkpoint provenance, a frozen independently labeled holdout, full normalized
  probability vectors, training/holdout disjointness, calibration/metrics, and
  same-corpus replay before selection or promotion. The diagnostic evaluator
  exists at `scripts/atlas/lib/domain-classifier-evaluation-v1.mjs`; current
  checkpoint membership and a qualifying holdout are not proven. Do not conflate
  `P(domain | features)` with OKF heuristic fit or retrieval relevance.
  Derive the holdout only from an explicitly frozen human-reviewed or admitted
  label cohort; each row must bind sample ID, input checksum, source/evidence
  refs, expected label, and complete NB/LR class-probability maps. The training
  manifest must enumerate exact member input checksums for the evaluated
  checkpoint; aggregate file/label-set checksums are insufficient. Print a
  diagnostic receipt with separate accuracy, macro-F1, multiclass Brier, and
  log-loss per model. Keep the cohort/report as review artifacts only: do not
  index probabilities or predictions into PostgreSQL, Qdrant, Neo4j, or cache.
  `scripts/atlas/evaluate-domain-classifier-holdout-v1.mjs` is a local read-only
  printer; no qualifying cohort or exact checkpoint membership manifest exists.
- [ ] ENG-ML-OPT-11 — inventory PyTorch/ATen, scikit-learn, RAPIDS/cuML,
  cuVS/cuGraph, DSPy/GEPA, RLM, and Gymnasium owners and runtime callers. Keep
  task/classifier truth, prompt optimization, policy learning, clustering, and
  retrieval as separate capabilities; package presence is not wiring.
- [ ] ENG-ML-OPT-12 — freeze environment boundaries and dependency locks before
  adding packages: FastAPI/NLP sidecar, existing WSL2 RAPIDS Conda environment,
  and any future PyTorch/RL environment remain independently versioned. Record
  Python, NumPy, CUDA, framework, model, and artifact versions/checksums. Do not
  install RAPIDS or PyTorch into the sidecar as a convenience dependency.
- [ ] ENG-ML-OPT-13 — decide whether PyTorch/ATen is needed from a measured
  tensor workload. If needed, prove a CPU-only reference first, then a separately
  pinned optional executor; require bounded memory/device use and parity before
  GPU execution. No live sidecar/container update is implied by this task.
- [ ] ENG-ML-OPT-14 — freeze revision-qualified unsupervised feature inputs and
  a deterministic CPU clustering baseline. Clusters are exploratory routing
  features only; they do not create or relabel canonical domains.
- [ ] ENG-ML-OPT-15 — define feature scaling, missing-value handling, and
  normalization revisions for clustering/classification. Preserve raw values
  and checksums; reject mismatched feature schemas rather than silently padding.
- [ ] ENG-ML-OPT-16 — validate probability semantics on an independent holdout.
  Softmax/normalization must not be applied to arbitrary scores and called
  calibrated confidence; record class order, calibration method/revision, and
  multiclass metrics. Keep NB/LR outputs as separate challengers.
- [ ] ENG-ML-OPT-17 — compare optional cuML/cuGraph/cuVS execution against the
  frozen CPU oracle on the same revisioned inputs. Require checksum-bound input,
  ordinal LUT revision where applicable, numeric/tolerance policy, resource
  approval, and replay receipt. GPU ordinals remain non-identity.
- [ ] ENG-ML-OPT-18 — specify a read-only Gymnasium-style evaluation environment
  before any policy-learning work. Actions must be simulated/proposal-only;
  production tools, stores, task state, and agent mutations are unreachable.
- [ ] ENG-ML-OPT-19 — define independently reviewed reward/outcome labels and
  leakage-resistant train/validation/test splits for policy evaluation. Rewards
  cannot be inferred from model confidence, retrieval rank, or unverified task
  completion.
- [ ] ENG-ML-OPT-20 — evaluate PPO only after the environment, action schema,
  reward provenance, deterministic baseline, safety constraints, and held-out
  metrics are frozen. Training artifacts remain noncanonical and promotion is
  separately gated.
- [ ] ENG-ML-OPT-21 — evaluate DSPy/GEPA as prompt/program optimizers on frozen
  train/validation examples with an untouched test set, bounded model calls,
  captured optimizer/model/prompt revisions, and regression checks. No automatic
  prompt deployment or label/evidence promotion.
- [ ] ENG-ML-OPT-22 — bound RLM/self-prompting recursion, tool permissions,
  context/token budgets, retries, and termination. Retrieved text and model
  reflections remain untrusted inputs, never policy/system instructions.
- [ ] ENG-ML-OPT-23 — require independent review, reproducible replay, rollback
  artifact, and explicit admission authorization before promoting any model,
  prompt, policy, clustering, or routing change. No gate in ENG-ML-OPT-11..22
  authorizes training on production data or persistent indexing.
- [ ] ENG-LANGUAGE-COVERAGE-01 — inventory the languages/extensions present in
  the target source corpus against installed/declared Tree-sitter grammars,
  LSP servers, and supported operations (structure, symbols, definitions,
  references, diagnostics). Record provider/server and grammar revisions,
  availability, coverage, and unsupported/dormant cases. Reconcile the
  `.okf` language registry with the runtime enum; package presence alone is not
  live language support. Do not claim all languages are covered until every
  advertised language has provider evidence and a bounded smoke test.

- [ ] ENG-CODE-EVIDENCE-CITATION-01 — freeze a candidate evidence-unit contract
  for source snippets and citations. Bind `sourceRef`, exact source/workspace
  revision when available, language, producer/grammar/LSP revision, exact byte
  span plus coordinate encoding, excerpt checksum, and non-empty evidence refs.
  Derive display citations from the verified span; never fabricate line numbers
  or packet identity. Preserve unresolved packet/workspace binding as unresolved.
  External web citations require the admitted SearXNG acquisition receipt and
  captured-source identity; a result snippet alone is not evidence.
- [ ] ENG-TOPIC-ALGORITHM-CATALOG-01 — extend the existing `.okf` registries
  only after the owner gate. Define computer-engineering topics, algorithms,
  data-source kinds, and aliases as separately typed, revisioned vocabulary
  entries with definitions and evidence examples. Topics/algorithms are not
  domains; language labels are not topics; storage/executor names are not
  retrieval lanes. Validate YAML/schema and semantic references, and keep
  proposed/ambiguous terms reviewable rather than silently promoting them.
- [ ] ENG-EXTERNAL-SOURCE-ACQUISITION-01 — after the local source-code index
  has a frozen revision and bounded readback, use the existing reviewed
  `docs/.okf/dev/library-docs-manifest-v1.json` catalog and
  `atlas_okf_docs_pipeline.py` Firecrawl v2 / BeautifulSoup fetchers to acquire
  official, exact-host-allowlisted language, algorithm, data-source, and
  computer-engineering references. The current 24-source catalog is only a
  package-inventory seed, not proof of coverage for every supported language
  or engineering domain. Reconcile it against the measured Tree-sitter/LSP
  language cohort and the reviewed `.okf` topic/algorithm/data-source
  vocabularies before calling coverage complete. Use acquisition-only mode
  first: bounded
  pages/depth, immutable source/checksum/citation metadata, local run output,
  no embeddings, rank features, Qdrant/DB/cache writes, or automatic vocabulary
  promotion. Keep source-language tags linked to the catalog revision; let the
  existing `.okf` schemas own domain/topic/algorithm meaning. AST/NLP analysis
  of the acquired references waits until local code-index readback and this
  acquisition receipt both pass.
- [ ] ENG-DOMAIN-CLASSIFICATION-01 — use the admitted code/evidence units plus
  Tree-sitter, available LSP, imports/dependencies, schema/package metadata, and
  the frozen `.okf` vocabulary to produce multi-label classification
  candidates. Deterministic signals run first; any model-produced label is a
  proposal with confidence, alternatives, producer/taxonomy revisions, and
  grounded evidence refs. Test ambiguity, multilingual coverage, unknown
  labels, and conflicting signals. No classifier output may mint identities,
  write canonical ontology/domain state, or become an independent retrieval
  vote.
- [ ] ENG-EVIDENCE-INDEX-READBACK-01 — map code snippets, citations,
  classifications, and source metadata to the existing canonical identity and
  retrieval/index owners. Prove a bounded read-only query returns the exact
  source revision, span, citation, vocabulary revision, and projection lineage.
  PostgreSQL remains canonical where already defined; Qdrant/Go Retrieval and
  other indexes remain rebuildable executors/projections. No new table,
  collection, bulk index, or persistent write is authorized by this gate.
- [ ] MCP-TOOL-RANKING-01 — feed the frozen query shape, task/retrieval intent,
  language, domain/topic/algorithm candidates, and evidence requirements into
  the existing MCP registry and `rankToolsByQuery()` / selector path. Prove
  exact registry revision and tool-schema identity against live `tools/list`;
  evaluate deterministic top-k relevance, invalid/deprecated-tool rate,
  repeatability, and latency on a frozen reviewed cohort. Ranking is advisory,
  does not authorize execution, and must not add one vote per executor or create
  a competing `selectMcpToolSubset` owner.
- [ ] MCP-EVIDENCE-EXECUTION-01 — only after ranking proof, call selected tools
  through the existing dispatcher with schema validation, declared read/write
  effect, bounded time/cost, and per-tool authorization. The initial cohort is
  read-only. Preserve tool/registry revisions and returned evidence refs in a
  receipt; route selected evidence through ACE/ContextManifest before model
  injection. Retrieved code, documents, and web pages are untrusted data, never
  tool instructions. No raw retrieval hits go directly to the LLM.
- [ ] ENG-CLASSIFICATION-MCP-E2E-01 — replay a bounded, revision-frozen corpus
  through language evidence → exact code citation → `.okf` topic/algorithm and
  domain candidates → existing index retrieval → MCP tool ranking → authorized
  read-only evidence call → ACE/ContextManifest. Verify deterministic receipts,
  identity/revision propagation, cited output, no duplicate owners, and
  `writesPerformed=false`. Keep this incomplete until the end-to-end replay and
  independent readback pass.

**Dependency order:**
```text
ENG-CLASSIFICATION-OWNER-01
  ├─ ENG-LANGUAGE-COVERAGE-01 ───────────┐
  ├─ ENG-CODE-EVIDENCE-CITATION-01 ──────┼─> ENG-EVIDENCE-INDEX-READBACK-01
  └─ ENG-TOPIC-ALGORITHM-CATALOG-01 ──────┘   (freeze local code corpus first)
                                                   ↓
                                         ENG-EXTERNAL-SOURCE-ACQUISITION-01
                                                   ↓
                               ENG-DOMAIN-CLASSIFICATION-01
                                                   ↓
  MCP-TOOL-RANKING-01
        ↓
  MCP-EVIDENCE-EXECUTION-01
        ↓
  ENG-CLASSIFICATION-MCP-E2E-01
```

Do not run `graphify:daily` just to refresh a stale warning. Do not classify
taxonomy hyperedges as packet incidence, use ungrounded snippets as citations,
or treat an MCP ranking result as permission to execute a write tool.


### NLP/domain-classifier evidence reconciliation (2026-10-05)

- This supersedes only the component-level claim that the classifier path was
  wholly unavailable: the classifier-sidecar ledger records a live `:8095`
  `/analyze` classify invocation on 2026-09-03, returning `sklearn-lr` and a
  model revision. The best-fit ledger separately confirms real MultinomialNB
  and LogisticRegression `predict_proba()` outputs.
- It does not prove classification of the current LINEAGE-E2E-01 frozen
  packet, current checkpoint admission, revision/evidence binding, or
  propagation into feature setup and routing. Those remain open above.
- `python/train_domain_classifier.py` is an offline weak-label trainer using
  EmbeddingGemma/KMeans features and sklearn NB/LR. This status does not
  authorize training, checkpoint replacement, or label promotion. Probabilities
  remain derived routing evidence, not canonical domain truth.
- PF10/PF11 describe a proposed NLP/enrichment ordering; they do not supersede
  these owner, evaluation, or same-packet lineage gates and do not establish a
  current vertical-slice pass.

### Existing OpenSpec analysis pipeline gate closure (2026-10-05)

These gates close gaps across existing owners; they do not create a second
analysis system. Markdown/OpenSpec remains task-state authority. All derived
facts, cards, edges, and algorithm projections remain
`canonicalAuthority=false`. Keep every gate unchecked until its stated
independent readback/evaluation passes. No model-driven task-state changes or
unapproved durable writes are authorized.

- [ ] 11.1 `ANALYSIS-MODEL-RECEIPT-01` — status is
  `ARTIFACT_PROVEN / RUNTIME_BINDING_PARTIAL`, not wholly unproven. Existing
  artifact evidence covers the local GGUF path/checksum and 768-dimensional
  executor parity; tokenizer and input-policy revisions are separate. Runtime
  path/name matching is not an independently measured loaded-artifact digest,
  current executor availability, or per-call tokenizer/input-policy binding.
  Historical plan denominator is 11,024 EvidenceCards × 5 = 55,120
  representations (not 55,610). Child gate:
  `MODEL-RECEIPT-READBACK-01` independently reads the receipt and checks
  `modelId`, artifact checksum, dimension, pooling, tokenizer/model revision,
  producer revision, active runtime/provider binding, and per-call
  `tokenizerRevision` / `inputPolicyRevision`. Do not rerun the shared-output
  producer as the independent verifier. Evidence:
  `docs/reports/emb-prov-01-embedding-provenance-receipt.json`.
  Supplied 2026-10-03 readback reports the configured 621,867,360-byte GGUF
  SHA-256 matched
  `bc843658e96d2e9cc7c3402332b158f0cc4f73e61b23cef9a41acee1c0d372b7`;
  Ollama `embeddinggemma:latest` digest
  `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1`,
  768 dimensions, but no loaded model in `/api/ps`; `:8081` refused
  connections. `:8097/health`'s `model_loaded` was derived from `/api/tags`,
  so it is not loaded-runtime proof. Source was changed to check `/api/ps`
  and focused Go tests passed, but the service was not rebuilt/restarted and
  no embedding request or persistence was performed. Semantic persistence
  remains held pending independent readback, including pooling.
- [ ] 11.2 `ANALYSIS-EVIDENCECARD-OWNER-01` — reconcile the generated
  OpenSpec EvidenceCard corpus owner. The supplied audit distinguishes
  `atlas.openspec-evidence-card.v1` (generated corpus) from legacy/drifted
  `atlas.evidence-card.v1`; the persisted portfolio census still emits the
  latter. Keep open until a current revision-bound producer/readback proves
  schema, producer, identity/revision fields, and checksum. `TaskCardV1`
  remains a derived projection; do not create a second card authority or
  confuse this question with `CandidateEvidenceCardV1/V2`.
- [ ] 11.3 `ANALYSIS-ORDINAL-MAP-01` — blocked on owner-contract compatibility.
  Existing `CandidateOrdinalMapV1` binds packet/tree-node/symbol-version
  identity; coercing TaskCard `stableKey` or task blocks into it would misstate
  identity/revision. Do not reuse code-chunk ordinals or create a parallel
  allocator. Reconcile a discriminated OpenSpec task-universe variant in the
  existing owner, preserving packet consumers, then prove deterministic
  ordering, per-row task revision, universe/source revisions, checksum, and
  independent bounded readback. Evidence:
  `docs/reports/analysis-openspec-ordinal-owner-census-v1-20261003.md`.
- [ ] 11.4 `ANALYSIS-NLP-GROUNDING-01` — reuse the existing `:8095` NLP
  sidecar and extraction owners for domain, concept, entity, action, artifact,
  capability/tool, and dependency-phrase observations. Every observation must
  retain an exact source span, source/task revision, and extractor revision;
  outputs remain non-authoritative.
- [ ] 11.5 `ANALYSIS-ONTOLOGY-TUPLE-01` — map grounded NLP observations through
  the existing five tuple tables/owner; freeze the table owner for `DOMAIN`,
  `CONCEPT`, `ENTITY`, `ARTIFACT`, and `CAPABILITY`. Prove no sixth tuple
  store or duplicate relation authority. Persistence remains behind the
  existing write gate.
- [ ] 11.6 `ANALYSIS-DEPENDENCY-CANDIDATE-01` — derive revision-bound candidate
  task edges only from grounded dependency phrases (`after`, `requires`,
  `blocked by`, `depends on`). Exact declared task IDs may rank as stronger
  evidence; text-only edges remain review proposals. Prove candidates cannot
  alter task status, suppress retrieval, or enter confirmed graph ranking
  without review.
- [ ] 11.7 `ANALYSIS-HYPERGRAPH-01` — derive revision-bound hyperedges from
  admitted EvidenceCard/ontology/task facts. Pairwise CSR/COO algorithm
  projections must carry source/graph revisions, ordinal-map checksum, and
  checksums. Hypergraph is a derived projection, not another canonical store.
- [ ] 11.8 `HYPERRAG-INCIDENCE-OWNER-01` — identify an admitted producer for
  packet-keyed, revision-qualified incidence before `MULTIHOP-FILL-01`.
  Supplied owner audit reports 62,802 taxonomy `atlas_hyperedges` with null
  packet keys and zero packet resolution; linked tuples are empty or lack
  required provenance. `persistHyperedges()` in
  `sveltekit-frontend/src/lib/server/atlas/kag-hyperedge-postgres.ts` is
  reusable persistence infrastructure, but its discovered production caller
  is taxonomy promotion, not packet incidence. The production strict reader
  is statically reachable, but its default Qdrant candidate mapping omits
  `graph_revision`, so the exact-revision SQL gate is not reached on that
  path; the Postgres quick-hop composition has no production caller. Focused
  tests are mocked and do not prove live expansion. Require a current exact
  packet-incidence cohort and source/workspace/graph revisions; never rewrite
  taxonomy edges into incidence. Keep `MULTIHOP_LINEAGE_UNPROVEN`.

**Dependency DAG (not a serial checklist):**

```text
TASKCARD-PARITY-01 → EVIDENCE-TASK-JOIN-01 → 11.3 → CandidateFeatureMatrix
11.1 → MODEL-RECEIPT-READBACK-01 → semantic persistence eligibility
EMBED-OWNER-FREEZE-01 → live caller convergence
11.8 → current packet-incidence cohort → MULTIHOP-FILL-01
11.2 → 11.4 → 11.5 ─┬→ 11.7
                    └→ 11.6 ─┘
```

The model receipt does not block NLP extraction; NLP does not wait for semantic
indexing. Semantic indexing remains gated on 11.1–11.3. Graph ranking remains
gated on reviewed dependency edges and 11.7 readback.

### Codebase-Memory structural challenger (optional; no second graph owner)

Codebase-Memory MCP, if evaluated, is a disposable-worktree structural
challenger only. Its project/index/node IDs are not Atlas identity, Graphify
authority, packet incidence, or an execution DAG. Do not install, configure,
index, watch, or expose its tools to the default Ornith agent as part of this
ledger entry. Any future bounded evaluation must first use a binary-only,
hash/version-verified isolated install; disable automatic indexing/watch;
index only a disposable repo copy; compare a frozen structural-query cohort
against existing Atlas helpers; and resolve every returned path/symbol to exact
Atlas source revision and byte-span evidence before considering an adapter.

- [ ] `CBM-SECURITY-02` — verify release/version/hash before execution.
- [ ] `CBM-ISOLATE-03` — prove disposable root and auto-index/watch disabled.
- [ ] `CBM-INDEX-04` — explicitly index only that disposable root.
- [ ] `CBM-QUERY-05` — run bounded admitted query classes: definition, outline,
      snippet, import candidates, and path-bounded text. CALLS and impact output
      remain diagnostic nominations, not evidence.
- [ ] `CBM-PARITY-06` — compare correctness, latency, calls, and tokens against
      the same Atlas-helper questions.
- [ ] `CBM-IDENTITY-07` — resolve results to exact source revision and spans;
      unresolved observations remain diagnostic-only.
- [ ] `CBM-ADAPTER-08` — consider a thin helper-registry adapter only after
      parity and identity gates pass; do not expose raw tools by default.
- [ ] `CBM-KERNEL-09` — prove bounded reachability through the existing Atlas
      inspect/expand facade, with no second agent or graph authority.
- [ ] `CBM-WATCH-10` — consider background watch only after measured
      correctness, staleness, and Windows stability; requires a separate
      decision and authorization.

**CBM policy decision (operator accepted 2026-10-05; policy only):** admit
`CODEBASE_MEMORY_MCP` as a narrow `WORKTREE_STRUCTURAL` challenger for
`DEFINITION`, `OUTLINE`, `SNIPPET`, `IMPORTS` (candidate set; verify elsewhere),
and `BOUNDED_TEXT`. Keep `canonicalAuthority=false` and `emptyMeansUnknown=true`.
Do not admit blast radius, SvelteKit route-to-handler ownership, database-table
write ownership, CALLS as evidence, or negative connectivity claims. This does
not mark a runtime handler, Atlas adapter, or identity/freshness gate complete.
The handoff's `CBM-IDENTITY-01` maps to existing `CBM-IDENTITY-07`; do not add a
parallel identity owner.

- [x] `CBM-ADMISSION-01` — freeze the capability boundary above. This checkbox
      records the operator policy decision, not production integration.
- [ ] `CBM-FRESHNESS-01` — derive `CURRENT` only from a source/index snapshot
      match. Missing binding or post-index worktree changes produce
      `UNKNOWN`/`STALE_INDEX`, never silent structural use.
- [ ] `CBM-NEGATIVE-01` — empty CBM results stay `UNKNOWN`; verify negative
      claims with exact source/Atlas helpers.
- [ ] `CBM-TOKEN-01` — record request/result bytes and token estimates for
      outline, snippet, and bounded text queries.
- [ ] `CBM-FALLBACK-01` — stale, ambiguous, or empty observations fall back to
      `rg`/exact source inspection, not stale CBM evidence.
- [ ] `CBM-DETECT-CHANGES-01` — diagnose symbol-impact failure using one changed
      indexed file, one known symbol, and one known importer/caller. This is
      separate from admission and must not block the admitted query classes.

**CBM read-only measurement update (2026-10-05 local; installed 0.11.0; partial, not admission):**

**Cross-ledger reconciliation:** the ACE/RLM ledger contains the follow-up
CBM-MEASURE-02B/C/D measurements and the operator's narrow admission decision.
They are existing recorded evidence, not reruns in this pass. The bounded
`search_code`, outline/snippet, route/HTTP_CALLS, EnvVar, `WRITES`, and
`detect_changes` findings are incorporated below. These measurements do not
prove revision freshness or canonical identity, nor do they make CBM suitable
for blast radius, route-to-handler ownership, SQL/table writes, or negative
claims. Keep query parity and identity/freshness gates open; the standalone
one-file/symbol `detect_changes` diagnosis remains open.

**Import adapter follow-up (2026-10-06):** a bounded diagnostic `query_graph`
adapter now parses JSON rows as File/Module path candidates, but does not bind
the graph snapshot or Atlas identity and is not wired to runtime. One observed
positive matched direct source import; one known-importer query returned zero,
so import recall is not established and empty remains UNKNOWN. Verify each
candidate independently; do not use the adapter for negative claims.

**CBM source-parity microprobe (2026-10-05; read-only, not full CBM-PARITY-06):**
on `lib/agent/bounded-tool-caller.ts`, `get_file_outline` returned six symbols;
all six names matched current source at the reported start lines (6/6). A
`get_code_snippet` query for `callToolSafely` returned lines 31-49 whose
normalized-source SHA-256 exactly matched the current file slice
(`164d6c997e742780c706c58e657e8a6c2bf41ef478f33b7ad84a58ed8bc60c67`). This
proves bounded current-source agreement for one file only—not full index
freshness, Atlas-helper parity, identity qualification, recall, or runtime
wiring. Keep all CBM parity/freshness/identity gates open.

**Atlas lexical coverage probe (2026-10-05; explicit PostgreSQL `READ ONLY`):**
the existing `search_code_lexical('callToolSafely', 20, NULL)` returned zero,
and `code_retrieval_chunks` had zero rows for `bounded-tool-caller.ts`. The same
held for `buildLearningOutcomeV1` / `learning-outcome-v1.ts`. This does not
compare like-for-like structural retrieval; it shows the Atlas lexical corpus
does not contain either probe file, so FTS cannot serve as the parity oracle
for them. Do not count CBM's result as a win; choose a frozen file present in
both indexes or use the existing Atlas structural sidecar with valid source
revision inputs. Transaction rolled back; zero rows written.

**Shared-file same-query microprobe (2026-10-05; explicit PostgreSQL `READ ONLY`):**
for `quantizeGemmaLegalOutput` in `sveltekit-frontend/src/lib/ai/base64-fp32-quantizer.ts`,
bounded CBM `search_code` (`pattern`, `mode=files`, exact `path_filter`) returned
one file / one reported grep match (1,151 ms); its `raw_match_count` was zero,
so the provider's count semantics need clarification. CBM outline returned 25
symbols and its snippet for lines 320-325 exactly matched the current source
slice (SHA-256 `a50b49ed3b4d28342a3775f01788cb9fda6b2a82df81775d732d56de4274b4c1`).
The current source `rg` hit is line 320. Atlas `search_code_lexical` returned
three rows for the same identifier: the exact absolute-path row first
(score 0.54545456), plus two relative-path rows (0.16666667 each); the table
has eight rows for the absolute-path file. Read-only inspection showed the two
relative-path rows are `card:` and `qdrant:` stable-key entries with identical
content MD5s, while the absolute-path symbol result has a separate `file:` key.
These appear to be separate projection classes, not proven canonical chunk
identity. SearchRuntime's fusion key prefers `symbolVersionId`, else `packetKey`
(optionally disambiguated by `canonicalChunkId`), else candidate ID; it adds a
revision qualifier only when both source/workspace revisions are SHA-256. These
FTS rows do not supply those fields; do not merge them by path/content hash.
This is useful one-query overlap, but not equivalent
structural-ranking parity, recall, or proof the CBM snapshot is revision-current.
Keep `CBM-PARITY-06` and identity/freshness gates open; reconcile projection
rows only through their existing identity owner.

**Canonical identity resolver follow-up (2026-10-05; read-only):** inspected
the three returned `code_retrieval_chunks` rows and the existing identity
owners. The table has no dedicated packet/source/workspace revision columns;
the inspected row metadata has no `packet_key`, `symbol_version_id`,
`canonical_chunk_id`, `source_revision`, or `workspace_revision`. The
`card:`/`qdrant:` rows contain content hashes, but no qualified hash contract
was present, so those hashes cannot establish exact projection identity.
`resolveCanonicalIdentityV2` has strict resolution rules but no production
caller in the searched server tree; V1 is used by RRF normalization, but this
audit did not establish that it owns these FTS rows. Result: no canonical
candidate resolution is proven; a path-only resolution would be at most a
source group, and a lane ID remains degraded. Do not merge or promote these
rows. Keep CBM identity/parity gates open pending an existing-owner binding
that supplies qualified identity and revisions. The inspection ran read-only;
zero datastore writes.

- Existing project scope is `sveltekit-frontend/src` (74,735 nodes,
  250,913 edges; index status `ready`, indexed at 2026-10-06T01:29:49Z).
  The second indexed project is only `src/lib/server/atlas/workflow`.
  Branch metadata is `handoff/summary-enrichment-lineage-20260925`; no
  immutable index-to-current-worktree revision binding was established.
- Schema census reports 878 `Route`, 375 `EnvVar`, 71 `Table` nodes,
  1,042 `HTTP_CALLS`, 6,533 `WRITES`, and 21 `HANDLES` edges.
- Route lookup via `search_graph --qn-pattern` found GET/POST route
  candidates for `/api/routes/{routeId}/interactions`; `query_graph` linked
  both `HANDLES` edges to `routes/api/routes/[routeId]/interactions/+server.ts`.
  Current source independently exports GET and POST. A different route query
  returning no relationships is `UNKNOWN`, not proof of absence.
- `HTTP_CALLS` for `/api/auth/login` returned five caller files; the five
  exact direct `fetch('/api/auth/login', ...)` source callsites match that
  bounded cohort (5/5). This is a path-level diagnostic comparison, not a
  revision-qualified graph proof.
- `DATABASE_URL` returned 18 `CONFIGURES` candidates. One selected positive,
  `getPgPool` in `mcp/tools/vault-walker.tool.ts`, is confirmed by source; the
  remaining candidates were not individually precision/recall audited.
- `WRITES` is a code-level variable/field/method mutation relation, not a
  database-table ownership relation. A table-directed query returned no
  `users`/`atlas_packets` edge; that is not a negative SQL-write finding.
- **Correction to this pass's initial note:** `detect_changes` was not rerun in
  this pass, but the ACE/RLM ledger records a separate v0.11.0 `scope=impact`,
  `base_branch=HEAD` run over 557 changed files (~25s): the bounded file set
  matched known changed files, while `seed_symbols=0`, `impacted_total=0`, and
  `module_total=0`. Classify it `FILE_DIFF_ONLY_PROVEN / SYMBOL_IMPACT_NOT_PROVEN`;
  cause remains undetermined. The record did not establish `scope=files` as a
  separate run or page through all indexed `src/` paths. Keep a tiny symbol
  impact diagnosis separate from admission; do not patch Atlas around it.
- No CBM indexing, watch/config change, Graphify refresh, canonical semantic
  snapshot change, or Postgres/Qdrant/Neo4j/Valkey write was performed here.
  Keep `CBM-QUERY-05`, `CBM-PARITY-06`, `CBM-IDENTITY-07`, freshness,
  token-accounting, fallback, and negative-control gates open. Remaining work is
  exact snapshot identity, same-query Atlas parity (including import-candidate
  verification and token counts), and the small standalone `detect_changes`
  symbol-impact diagnosis.

## Computer Engineering Knowledge Acquisition / Classification (recorded 2026-10-04; reconciled against existing owners; nothing built)
Operator plan: `catalog -> classify -> acquire -> normalize -> cite -> admit -> index -> AST/NLP enrichment -> MCP rank`, with `.okf` owning catalogs/policy, Postgres owning admitted lineage, Qdrant/cuVS as projections, graph indexes derived, SearXNG discovery-only, MCP as routing not truth. Audited before recording (Duplication Prevention rule): most of the acquisition-to-index half already exists and is proven under `openspec/changes/parent-atlas-versioned-doc-intelligence/tasks.md` (DOC-00..DOC-27); the gates below are therefore tagged EXISTS / EXTEND / NEW instead of being added as new work.

### Owner census (what the proposed gates map onto)
| Proposed gate | Existing owner (evidence) | Tag |
|---|---|---|
| CE-SOURCE-01 `DocumentationSourceCatalogV1` | DOC-01 `ExternalDocSourceManifestV1` (`python/atlas_doc_manifest.py`, Pydantic `SourceConfigV1`/`PipelineManifestV1`; loader in `python/atlas_okf_docs_pipeline.py`), done | EXTEND (add fields only if DOC-01 lacks them: publisher, license/provenance, allowed/denied paths, drivers) |
| CE-SOURCE-02 discovery runner | DOC-03 Firecrawl bounded crawler (`atlas_okf_docs_pipeline.py::firecrawl_crawl_v2`, request builder unit-tested: page/depth/sitemap limits, external links, subdomains and whole-domain crawl disabled; live receipt `docs/reports/parent-atlas/doc-03-firecrawl-live-bounded-v1.json`) | EXISTS for Firecrawl; `llms.txt`-first and sitemap-first discovery NOT verified here (check before claiming) |
| CE-SOURCE-03 BeautifulSoup adapter | DOC-04 BeautifulSoup deterministic normalizer (`atlas_external_docs.py::fetch_beautifulsoup`, `extract_structured_text`, `enforce_allowed_domain`), done, plus BS4 parity proof script | EXISTS |
| CE-SOURCE-04 Firecrawl adapter | DOC-03 (`atlas_external_docs.py::fetch_firecrawl_v2`); `scripts/atlas/audit-doc-03-firecrawl-bounded-owner-v1.mjs` is the owner audit | EXISTS |
| CE-SOURCE-05 `DocumentationPageArtifactV1` | DOC-02 `DocCoordinateV1` (version-qualified identity) + DOC-05 `ExternalDocChunkV1` | EXTEND only if a field in the proposal is missing |
| CE-SNIPPET-01 `SourceCodeSnippetV1` | `atlas_external_docs.py::extract_code_blocks_and_signatures` is a deterministic regex over ONE already-chunked text (fenced blocks as `{language, code}` plus API-signature-like lines), called inside `chunk_document()`; `_detect_code_language` / `_code_block_text` handle HTML `<pre>/<code>` during BS4 normalization. It records no snippet ordinal, exact source span, inference confidence or snippet hash, and snippets do not exist independently of chunks. DOC-12 `ApiRuleV1` is a sibling output | EXTEND (add ordinal, span/anchor, declared vs inferred language with confidence, hash, heading context; a snippet cut by a chunk boundary is a known limitation to test) |
| CE-SNIPPET-02 Tree-sitter confirmation | DOC-23 ast-grep repair planner; `ast-grep-observation-adapter.ts` | EXTEND (no new parser authority) |
| CE-INDEX-01/02/03 canonical admission, projections, readback | DOC-06 / DOC-06A (Postgres canonical owner, pinned corpus admitted 2026-09-23), DOC-06b FTS, DOC-07 `semantic_768`, DOC-08 Qdrant dense, DOC-19/20/21 cuVS/CAGRA/IVF-PQ proofs over the admitted chunks | EXISTS; CE-INDEX-03's URL -> page -> chunk -> vector -> citation readback should be re-run as a single proof, not rebuilt |
| CE-CLASSIFY-01/02 documentation classification and lexical baseline | DOC-09 (`atlas_external_docs.classify_domain` / `classify_ontology`; admission through `parent_atlas_ontology.domain_mapping.admit_domain_classification`, "classifies, does not own") | EXISTS as baseline; EXTEND to multi-axis output (domains/topics/algorithms/languages/frameworks) |
| CE-NLP-01 grounded extraction | DOC-10 LangExtract source-grounded extraction (`DRY_RUN_PROVEN`), DOC-11 provider | EXTEND |
| CE-GRAPH-01 documentation edges | DOC-14 Neo4j/cuGraph doc-relationship projection (open, `NEW`) and DOC-13 doc<->symbol index (open) | OPEN under DOC-14/DOC-13; also gated by GRAPH-INDEX-01 |
| CE-MCP-01/02 documentation capabilities in tool policy | DOC-15 agentic docs retrieval fan-out (open, `EXTEND`); `sveltekit-frontend/src/lib/server/ai/tool-selection-policy.ts` (+spec) is the existing policy to extend; see TOOL-LUT-01 / MCP-ROUTE-01 in the lane-consolidation ledger | EXTEND |
| CE-MCP-03/05 fail-closed external acquisition | `requestAcquisition` (`atlas/acquisition/acquisition-writer.ts`); variadic ast-grep probe found calls only in `scripts/atlas/smoke-acquisition-mvp.mts` (see FANOUT-AUDIT-02) | NEW caller required (MCP-WEB-01) |
| CE-MCP-04 `selectMcpToolSubset` caller | static call at `src/mcp/server.ts:2093` in the `tools/list` handler (ACTIVE_CALLER_PROVEN, static) | EXISTS statically; a runtime proof is still the gate |
| Incremental recrawl / revision drift | DOC-26 incremental version recrawl (open, `NEW`), DOC-27 stale version rejection (done) | OPEN under DOC-26 |
| CE-DOMAIN-01/02, CE-TOPIC-01, CE-ALGO-01 catalogs | `.okf/domains` holds 3 yaml files (`feature-intelligence`, `parent-atlas-execution`, `structured-value`) and Postgres `atlas_domain_ontology` has 13 top-level groups; no computer-engineering topic or algorithm catalog was found in this pass | NEW, but reuse the 13-group ontology and `CANONICAL_DOMAINS` mappings first (DOMAIN-TAXONOMY-AUDIT-01, DOMAIN-01) |
| CE-LANG-01 `ProgrammingLanguageCatalogV1` | Owner found: `sveltekit-frontend/src/lib/server/atlas/language/language-intelligence-plan.ts` (+ spec), with `ts-morph-semantic-enrichment.ts` and `api-contract-observation-v1.ts` beside it (contents not read in this pass, so what languages and readiness fields it already models is unverified). `.okf/languages` contains only `typescript.yaml` | EXTEND the language-intelligence plan; read it first; do not mark `treeSitterReady` or `lspReady` without a live probe |
| CE-LSP-01 LSP enrichment | not audited here | NEW, optional, after admission |
| CE-E2E-01/02 replay fixture | not present; the DOC admission canary receipts are the closest precedent | NEW |

**CE-RECON-01 checkpoint (2026-10-04; source-ledger and artifact-presence
cross-check only, not a fresh runtime replay):** the versioned-doc task ledger
records DOC-01/02 contracts and focused tests, DOC-03's bounded 3-page live
Firecrawl receipt, DOC-04/05 HTML/code-block normalization and chunk tests, and
DOC-06A's 30-page/852-chunk canonical PostgreSQL admission with independent
readback. The cited admission, Firecrawl, DOC-10/12, DOC-15, and DOC-19/20/21
report files are present. These establish reusable owners, not that the proposed
computer-engineering corpus is complete or ready for a new crawl/index run.
Important limits from those same task records: DOC-07 proves 768-D vectors via
the configured endpoint, but does not bind the current corpus to the required
EmbeddingGemma model artifact/recipe; DOC-08's live Qdrant write/readback used a
disposable collection and its target collection was still recorded at
`points_count=0`; DOC-09 is a domain/ontology baseline, not the requested
multi-axis classifier. Corrected DOC-10 receipt lineage: the cited
`doc-10-12-live-contract-v1.json` is superseded for fixture results by
`docs/reports/parent-atlas/doc-10-multiturn-fix-v1.json` (`DRY_RUN_PROVEN`,
executed 2026-09-04, raw SHA-256
`231d19699e0c084819642d398cd8ee1112f81c853d075cdda680375fbf432560`). The
successor records 2/2 exact facts on the original fixture and 3/3 on a novel
fixture; DOC-12 API-rule non-empty coverage remains open. DOC-13/14/15 plus
DOC-26 also remain open. Therefore keep
`CE-RECON-01` unchecked:
independently inspect receipt fields/checksums and reconcile any drift before
calling an `EXISTS` row proven. Do not crawl, embed, populate Qdrant, or mark
the current owner map as end-to-end evidence from these records alone.

### Conflicts with the proposal as written (decide before building)
- **Do not create a parallel pipeline.** The proposed `scripts/docs/{discover-doc-sources,acquire-beautifulsoup,acquire-firecrawl}.py` would duplicate `python/atlas_okf_docs_pipeline.py` + `python/atlas_external_docs.py` + `python/atlas_doc_manifest.py`. `scripts/docs/` currently holds only `build-file-profile-cards.mjs`. Extend the existing modules; a discovery step, if missing, belongs inside them or as one small addition to the pipeline, not as a second acquisition stack.
- **Do not create `.okf/docs/sources/` and `.okf/docs/schemas/` yet.** The standing hold is "no new `.okf` hierarchy until OKF-OWNERSHIP-01 reconciles the two existing `.okf` shapes". Existing precedent for a source manifest is the DOC-01 manifest and `.okf/docs/dspy/` (a `corpus.json`, `corpus-3.4.0.json`, `postgres-index-contract.md`, timestamped `snapshots/`); put new source entries in that shape.
- **A PageRank implementation already lives in the docs module** (`atlas_external_docs.py::deterministic_pagerank`), in addition to the repo reference oracle and the NetworkX/cuGraph parity oracles. Do not add another for documentation graphs (CE-GRAPH-01); record it as a candidate for OWNERSHIP classification.
- **Firecrawl defaults:** the proposal's point that the service default crawl limit is large (10,000 pages in its docs, not re-verified here) is right; DOC-03 already builds an explicit-limit request, so the rule is to keep that builder as the only entry and reject any call without an explicit catalog limit.
- **Candidate limits come from the manifest, not the model.** Source `max_pages`/`max_depth` live in DOC-01's manifest; the proposed example values (500 pages, depth 4) are illustrative.

### Corrected implementation order (catalog -> classify -> acquire -> index -> enrich -> rank)

Do not crawl every source or start bulk indexing. First freeze the vocabularies
and source policy, then classify the request/source scope that is eligible to be
acquired. This pre-acquisition routing classification is distinct from
document classification: content-derived domain/topic/algorithm labels require
an acquired, normalized, cited, admitted artifact. Existing DOC-01..DOC-08
owners provide much of the acquisition and indexing machinery, but each reuse
claim below remains subject to `CE-RECON-01` and its source task's receipts.

#### 1. Catalog and capability proof
- [ ] CE-RECON-01 Confirm every `EXISTS` owner-map row against the DOC task's
     receipt and record the exact schema, producer, revision, and consumer; the
     owner map alone is not proof.
- [ ] CE-DOMAIN-01 Reconcile the existing `.okf` and runtime taxonomy owners;
     keep domain, topic, algorithm, programming language, framework/library,
     source type, and capability/tool as independent axes. A language does not
     imply a domain, a topic does not imply an algorithm, and a documentation
     host is never canonical evidence identity. Reuse `CANONICAL_DOMAINS` and
     the existing ontology; aliases remain separate from canonical IDs.
- [ ] CE-DOMAIN-02 Define the initial computer-engineering domain IDs and
     map them to existing ontology groups before minting IDs: algorithms-data-
     structures, programming-languages, compilers-parsers, operating-systems,
     computer-architecture, gpu-computing, distributed-systems,
     databases-storage, networking, security-cryptography, machine-learning,
     information-retrieval, search-ranking, graph-computing, web-runtime,
     systems-programming, developer-tooling, software-engineering,
     formal-methods, numerical-computing. Keep aliases in a separate field.
- [ ] CE-LANG-01 Extend the existing language-intelligence owner, not a
     second registry. Reconcile canonical IDs, aliases/extensions, grammar and
     package revisions, LSP server/revision, formatter/linter metadata, and
     documentation roots. `treeSitterReady` and `lspReady` require executable
     probes; declarations or package presence alone do not qualify.
- [ ] CE-TOPIC-01 / CE-ALGO-01 Extend existing `.okf` registries only after
     owner reconciliation. Keep topic families (data structures, algorithms,
     concurrency, memory, parsing/AST/IR, indexing, embeddings, ANN, reranking,
     clustering, graph ranking, and related catalog entries) distinct from
     algorithm identities (BFS, DFS, shortest paths, PageRank/HITS, KMeans,
     sorting/searching, top-k, cosine similarity, RRF, HNSW/CAGRA, union-find,
     LRU/LFU). Version aliases, definitions, complexity metadata, and applicable
     domains; catalog membership is not evidence that a source supports it.

#### 2. Request classification and bounded source discovery
- [ ] CE-REQUEST-CLASSIFY-01 Produce a deterministic, revisioned request
     routing classification from the frozen catalogs (domain/topic/algorithm,
     language, source kind, retrieval intent, query shape). Keep these axes
     separate. This may select eligible catalog sources; it does not classify
     unseen page content or authorize acquisition by itself.
- [ ] CE-SOURCE-01 Reconcile and extend DOC-01's source manifest only for
     missing contract fields: source ID, canonical origin, publisher/kind,
     allowed hosts/paths, denied paths, discovery order, bounded driver/limits,
     license/provenance, and topic/domain hints. SearXNG is discovery-only.
- [ ] CE-SOURCE-02 Reuse the existing bounded discovery runner. Produce an
     immutable, deterministically sorted discovery manifest; enforce host/path
     allowlists, URL/page/depth/byte/time limits, canonical URL normalization,
     and duplicate removal. Prefer `llms.txt`, sitemap, Firecrawl map, then
     bounded HTML links. No DB/vector/graph writes and no Graphify invocation.
- [ ] CE-SOURCE-03 / CE-SOURCE-04 Reuse DOC-04 BeautifulSoup and DOC-03
     Firecrawl adapters; do not add `scripts/docs/` crawler peers. BeautifulSoup
     normalizes an already selected page and cannot crawl arbitrary hosts.
     Firecrawl requires explicit catalog limits and path filters; preserve its
     source URL and HTTP status, and never rank by result order. Both emit local
     normalized artifacts only, not canonical-store writes.

#### 3. Normalize, cite, admit, and index
- [ ] CE-SOURCE-05 Reconcile DOC-02/DOC-05 into the page-artifact contract:
     source ID, canonical URL, content/source revision, acquisition run/driver,
     fetch time, content SHA-256, MIME type, title, normalized text/markdown,
     and citation anchors. URL alone is not identity. Retain heading structure,
     code blocks, language hints, anchors, outbound citations, and fetched time.
- [ ] CE-INDEX-01 Admit through the existing canonical docs writer only;
     PostgreSQL owns admitted document/chunk lineage. Every chunk binds source,
     page artifact, content revision, ordinal, and exact citation span. Preserve
     `semantic_768` / EmbeddingGemma for canonical dense vectors.
- [ ] CE-INDEX-02 Treat Qdrant as a rebuildable retrieval projection and
     graph/Neo4j/cuGraph as derived projections. Require exact source/content/
     revision lineage before projecting; no projection creates identity.
- [ ] CE-INDEX-03 Independently read back a bounded sample through URL ->
     page artifact -> canonical chunk -> vector projection -> citation. Reject
     orphan points and chunks whose citation cannot be recovered. Do not infer
     production corpus completeness from the existing pinned-corpus receipt.

#### 4. Post-admission code, AST, and NLP enrichment
- [ ] CE-SNIPPET-01 Extract source-code snippets from admitted page artifacts
     with stable snippet ordinal, source/page identity, exact span or anchor,
     declared and inferred language, confidence, snippet checksum, and heading
     context. Every snippet resolves to its source citation; preserve snippets
     on parser failure. Do not confuse snippets with canonical page identity.
- [ ] CE-SNIPPET-02 / CE-AST-01 Run Tree-sitter only where a live grammar is
     proven; preserve byte ranges and grammar revision. Parse failure or absent
     grammar leaves the snippet as textual evidence. AST facts are derived and
     cannot fabricate symbols, calls, or source spans.
- [ ] CE-LSP-01 Optional LSP enrichment runs only after source admission.
     Bind symbols/signatures/hover/references/tokens to snippet/source hash,
     language, server revision, and configuration digest. LSP is not identity.
- [ ] CE-CLASSIFY-01 / CE-CLASSIFY-02 Classify only admitted page/snippet
     artifacts into independent domain, topic, algorithm, language, and
     framework candidate sets. Start with the deterministic lexical baseline
     using `.okf` aliases, headings, and code metadata; record matched terms
     and source offsets.
- [ ] CE-CLASSIFY-03 Add a model/embedding challenger only against the
     lexical baseline, bound to exact artifact, model/recipe, and taxonomy
     revisions. Retain confidence, alternatives, evidence refs, and producer
     revision. No silent taxonomy mutation or lineage replacement.
- [ ] CE-NLP-01 Extend the existing grounded extraction owner for concepts,
     algorithms, APIs, libraries, data structures, complexity claims,
     requirements, and comparisons. Every assertion carries exact source
     offsets/citations and extractor revision; outputs remain proposals.
- [ ] CE-GRAPH-01 Build documentation relations only from admitted, grounded
     AST/NLP evidence. Require packet/source/revision evidence for every edge;
     reuse the existing docs graph owner and deterministic PageRank, with no
     new graph authority or ungrounded taxonomy-to-packet conversion.

#### 5. MCP ranking, gated acquisition, and replay
- [ ] CE-MCP-01 / CE-MCP-02 Extend the existing tool-selection policy with
     documentation capabilities and query-to-capability features. Use catalog
     and evidence features to rank a candidate tool subset; verify registry and
     tool-schema revisions. Ranking recommends tools, never truth or permission.
- [ ] CE-MCP-03 Keep `requestAcquisition()` behind a fail-closed gate:
     internal evidence is insufficient, the query permits external acquisition,
     and source policy allows the destination. SearXNG discovers; existing
     bounded adapters acquire; admission precedes durable evidence use. Never
     inject acquisition into retrieval fusion or write directly from MCP.
- [ ] CE-MCP-04 Prove the existing `selectMcpToolSubset()` runtime caller
     and selector/registry parity; the current static `tools/list` call is not
     runtime proof. Do not create a second selector/ranker.
- [ ] CE-MCP-05 Prove a bounded `requestAcquisition()` caller and its policy
     receipt; test deny, missing-policy, internal-evidence-sufficient, and
     allowed-acquisition paths without live external writes.
- [ ] CE-E2E-01 Freeze an offline replay (e.g. compare BFS, Dijkstra, and A*
     implementations in Rust and Python): request classification -> source
     selection -> admitted pages/chunks -> citations/snippets -> optional
     AST/NLP -> MCP ranking -> ACE/ContextManifest. No live acquisition.
- [ ] CE-E2E-02 Prove replay identity and citation recovery: same admitted
     corpus, taxonomy, classifier, and tool-policy revisions yield identical
     admitted evidence identities and ordering; `writesPerformed=false`.

**Dependency spine:**
```text
CE-DOMAIN-01/02 + CE-LANG-01 + CE-TOPIC-01/CE-ALGO-01
                         ↓
       CE-REQUEST-CLASSIFY-01 → CE-SOURCE-01 → CE-SOURCE-02
                                                  ↓
                         CE-SOURCE-03/04 → CE-SOURCE-05
                                                  ↓
                   CE-INDEX-01 → CE-INDEX-02 → CE-INDEX-03
                                                  ↓
             CE-SNIPPET-01 → CE-SNIPPET-02/CE-AST-01 + CE-LSP-01
                                                  ↓
              CE-CLASSIFY-01/02 → CE-CLASSIFY-03 + CE-NLP-01
                                                  ↓
                                           CE-GRAPH-01
                                                  ↓
                               CE-MCP-01/02 → CE-MCP-03/04/05
                                                  ↓
                                  CE-E2E-01 → CE-E2E-02
```

Do not crawl or bulk-index before the catalog, request classification, bounded
discovery, and source-artifact contract are frozen. Do not create a second
`.okf` hierarchy, docs table, crawler, classifier, MCP selector, or ranker.
No Firecrawl/BeautifulSoup/Tree-sitter/LSP/SearXNG/MCP component becomes source,
identity, admission, or fusion authority. No Graphify refresh, canonical-store
write, broad external crawl, or live acquisition is authorized by this plan.
