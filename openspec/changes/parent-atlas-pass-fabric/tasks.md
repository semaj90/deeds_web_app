# Parent Atlas Pass Fabric — Detailed Tasks

**STATUS (2026-08-11)**: PF0-PF3 verified DONE via direct source read of
`sveltekit-frontend/src/lib/server/analysis/{worker.ts,analysis-jobs.ts}`.
Skip to PF4. Do not re-implement claimBatch/gate-fill/LISTEN-NOTIFY — they
already work as specified and correctly.

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

**PF4C status**: `PASS_KEY_SEMANTICS_PROVEN = true` (now precisely
characterized — it's execution-scoped, not logical-identity-scoped, and
that's the root cause requiring the two-hash split above, not a bug to
patch in place). `PASS_IDENTITY_PROVEN` remains `false` until the
`passIdentityHash` field is added and threaded through eligibility queries.

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
- [ ] Single Postgres query claims all free slots
- [ ] Test: 4 free → 4 jobs claimed (not 1)
- [ ] Test: 0 free → 0 jobs claimed (no error)

---

## PF2: Fill All Free Concurrency Slots (30m)

**Goal**: Each gate immediately filled to capacity.

**Change**: Update gate tracking in executeJob callback.

**Acceptance**:
- [ ] embed_gate: 0/3 → 3 jobs dispatched in one pollOnce call
- [ ] entity_gate: 0/2 → 2 jobs dispatched
- [ ] forensics_gate: 0/4 → 4 jobs dispatched

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
- [ ] Fallback poll fires every 30s

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
      shape for `summarization`; `embedding`/`cache_push` duplicate cause
      still unknown (47 groups, ~97 rows — low volume, check before assuming
      same pattern applies)
- [ ] PF4C — prove `pass_key` semantics. Existing column already combines
      `packet_key + pass_type + input_hash + prompt_hash + model_name +
      temperature + max_tokens`. If `pass_key` was designed to *be* the full
      producer-config identity, the durable logical key may be `packet_key +
      source_revision + pass_key + input_hash` rather than introducing a
      redundant `pass_type + pass_revision` pair. Check code history /
      original design intent before freezing either shape.
- [ ] PF4D — recover `source_revision`/`pass_revision` where evidence exists
      (packet source ledger, producer provenance) for the 11,076 legacy rows
- [ ] PF4E — mark unrecoverable rows explicitly `legacy-unresolved` (do not
      silently leave ambiguous NULLs — a typed status is queryable, a NULL
      that means "we don't know" vs NULL that means "not applicable" is not)
- [ ] PF4F — wire the writer; new rows MUST populate both revision fields
      (currently zero code paths write to this table at all)
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

1. **PF-G0**: prove/rebuild packet identity writer (blocking, not yet started)
2. PF4 follow-up: find/build `analysis_pass_results` writer (in progress, see above)
3. PF6/PF7: CPU worker pool + move structural passes onto it
4. PF9: incremental eligibility (needs PF-G0 + PF4 writer first)
5. PF10/PF11: NLP pass DAG + bounded Ornith
6. PF12/PF13: tool executor + real graph multi-hop
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
- [ ] 3 independent read calls execute in parallel
- [ ] Graph expansion waits for ANN seed
- [ ] Test: 5 calls → batched as [3] then [2]

---

## PF13: Real Multi-Hop Graph Expansion (1h)

**Goal**: 1-2 hop neighbor traversal from ANN seed.

**Change**: Graph expansion only runs after dense_search results available.

**Acceptance**:
- [ ] Graph expansion depends_on: dense_search
- [ ] Returns 1-2 hop neighbors + edges

---

## PF14: Quarantine Fake Tricubic (30m)

**Goal**: Math correctness. Rename non-tricubic implementation.

**Change**: `tricubicSearch()` → `cubicKernelNeighborhoodExperimental()`

**Note**: Real tricubic interpolation deferred (requires 3D lattice + 64-sample neighborhood).

**Acceptance**:
- [ ] Renamed in all callers
- [ ] Governance: experimental implementation flagged, not canon

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
