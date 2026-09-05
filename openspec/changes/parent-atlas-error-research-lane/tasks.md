# Parent Atlas — Error Research Lane (ER0–ER13)

**Status**: ER0–ER6 built 2026-08-12 | **Blocked**: `error_logs` not migrated live

## Ownership (frozen — do not collapse into one table)

| Table | Role |
|---|---|
| `error_logs` | Canonical failure observation |
| `error_research_context` | Research receipt (fingerprint, ACE local context, LDR escalation) |
| `error_fix_plan` (not built) | Fix recommendation |
| `fix_attempt` / `verification_receipt` (not built) | Operator-gated patch execution |

Contract for `scripts/atlas/research-error-fixes.mjs`: READ error_logs, READ ACE
codebase context, OPTIONALLY CALL LDR, WRITE research receipts. NEVER patch
source, NEVER change graph identity, NEVER mark an error resolved.

## Slice 1 — ER0–ER6 (research receipts, no fix generation)

| Task | State | Notes |
|---|---|---|
| ER0 fingerprint unresolved errors | DONE | `computeFingerprint()` — category + normalized message + source_ref, excludes timestamps/line numbers/request IDs |
| ER1 dedupe by fingerprint + workspace_revision | DONE | in-batch dedupe + anti-join against existing `error_research_context` rows |
| ER2 hydrate ACE local context | DONE | `fetchCodebaseContext()` from `features/ai/ace/context-assembler.ts` (the real entry point — NOT `lib/server/ace/context-assembler.ts`), runs BEFORE any LDR call |
| ER3 classify LOCAL_CONTEXT_SUFFICIENT vs EXTERNAL_RESEARCH_REQUIRED | DONE | conservative: known structural categories (`type_mismatch`, `missing_field`, `orphaned_reference`, `validation_error`, `inference_error`) are local-sufficient; unrecognized categories escalate |
| ER4 call LDR only for EXTERNAL_RESEARCH_REQUIRED | DONE | `runLocalDeepResearch()`, query grounded in the ACE local context digest, not the raw error string; bounded by `MAX_EXTERNAL_RESEARCH_PER_RUN = 25` |
| ER5 persist error_research_context receipt | DONE | schema: `drizzle/manual/error_research_context.sql` — statuses PENDING/LOCAL_ONLY/RESEARCH_REQUIRED/RESEARCH_RUNNING/RESEARCH_COMPLETE/RESEARCH_FAILED/STALE/SUPERSEDED; `UNIQUE(error_fingerprint, workspace_revision, research_policy_revision)` |
| ER6 produce enriched context, do NOT apply patch | DONE | script never writes to source, never sets `error_logs.resolved` |

**Acceptance gate ERROR_RESEARCH_CONTEXT_PROVEN — NOT YET RUN.** Blocked: `error_logs`
is declared in `schema-postgres.ts:5223` but does not exist in the live
Postgres DB (confirmed via `\dt error_logs` — zero rows returned). Every one
of `audit-error-fixes.mjs` / `plan-error-fixes.mjs` / `apply-error-fixes.mjs`
/ `research-error-fixes.mjs` hits the same missing-table guard today. None of
this lane is provably correct against live data until that migration lands.

Required to actually prove ER0–ER6 once unblocked:
- same repeated error → one research population, zero duplicate LDR calls
- local-only error → zero LDR calls, `LOCAL_ONLY` status
- research-required error → one LDR run, `RESEARCH_COMPLETE`
- LDR failure → explicit `RESEARCH_FAILED`, not silently swallowed
- workspace_revision change → old receipts don't silently satisfy a new fingerprint key

## Slice 2 — ER7–ER13 (NOT STARTED, explicitly out of scope for this session)

| Task | State |
|---|---|
| ER7 fix candidate generation | NOT STARTED |
| ER8 recommendation ranking | NOT STARTED |
| ER9 operator approval | NOT STARTED |
| ER10 patch application | NOT STARTED |
| ER11 targeted tests | NOT STARTED |
| ER12 verification receipt | NOT STARTED |
| ER13 analytics feedback (emit into event fabric: failure.observed → research → recommendation.signal → fix action → policy.decision.receipt → analytics.observed) | NOT STARTED |

## `/audit-duplication turbovec` result (2026-08-12) — CORRECTED: four transports, not three

**TurboVec has FOUR live, uncoordinated transports for overlapping GPU-vector
work**, not three as first noted — same duplicate-owner pattern as
`context.build_kv_packet` and the outbox-table conflict elsewhere this
session. Verdict: **NEW_CONFLICT**.

1. HTTP sidecar (`:8791`) — `gpu/turbovec-kmeans-launcher.ts`, `search/turbovec-search.ts`
2. gRPC client — `grpc/turbovec-cuda-client.ts` + generated `turbovec_cuda_pb`,
   called live from `features/ai/ace/context-assembler.ts`,
   `retrieval/autoencoder-cuvs-bridge.ts`, `retrieval/turbovec-prefilter.ts`,
   `routes/api/atlas/search/+server.ts`
3. Rust N-API addon (`crates/turbovec-napi`, in-process, no network hop) —
   called from `search/rust-napi-search-backend.ts`
4. `child_process.spawn` CLI/binary invocation — `vector/turbovec-client.ts`,
   called from `token-map/token-map-mapper.ts`

`vector/turbovec-contract.ts` was checked as a possible unifying dispatcher —
it is NOT one. It only exports shared constants/metadata helpers
(`TURBOVEC_EMBEDDING_DIMENSION`, `TURBOVEC_QUANTIZER`, packed-ref builder),
imported by just 2 files (`turbovec-client.ts`, `token-map-mapper.ts`). None
of the four transports declare or implement a common interface; none is
marked canonical.

Needs its own scoped decision (classify CANONICAL_OWNER / BACKEND / EXPERIMENT
per the runtime-ownership-registry convention) before anything new is built
against any of the four — out of scope for this change, recorded here per
the `/audit-duplication` command's Phase 4 rule (record, don't unilaterally
fix).

## Explicitly deferred (do not build speculatively)

- **BitFrost error ranker** — BitFrost in this codebase is Redis cache-key
  conventions + `bifrostChat()` routing, not a ranking service. Use it (once
  wired) only as hot-cache residency for ACE packets / recent research
  receipts / recent successful fixes — ranking stays in the canonical
  recommendation FeatureRow system, never a second ranker.
- **Kanban / Tang / HMM recommendation architecture** — separate, much larger
  lane (KAN0–KAN10, TANG0–TANG5, HMM0–HMM2) described in workstation notes;
  not part of this change.
- **RabbitMQ event-fabric fixes** (`occurredAt` normalization boundary,
  `resolveRabbitMqUrl` precedence contract) — active in a separate,
  concurrently-edited lane (`sveltekit-frontend/src/lib/server/queue/*`,
  `integration-events.ts`, `event-fabric.ts`). Do not touch from this change.

## Blocker re-verified + root-caused (2026-09-05, read-only)

Re-checked this lane's stated blocker live rather than trusting the 2026-08-12 note, and traced it
to an owner it wasn't previously linked to. Probe kept at
`sveltekit-frontend/scripts/atlas/audit-error-research-lane-blockers-v1.mts` (run from
`sveltekit-frontend/`) so this doesn't need re-deriving.

- **All five lane tables still MISSING live**: `error_logs`, `error_research_context`,
  `error_fix_plan`, `fix_attempt`, `verification_receipt` — the blocker is unchanged, and it is
  wider than this file's "`error_logs` not migrated" phrasing (the receipt table this lane's own
  ER5 depends on, `error_research_context`, is equally absent despite its migration file
  `drizzle/manual/error_research_context.sql` existing on disk since 2026-08-12).
- **Root cause is NOT specific to this lane, and this lane cannot unblock itself.** `error_logs` is
  created by journaled migration `drizzle/0036_swift_mac_gargan.sql:1` (`CREATE TABLE "error_logs"`,
  journal entry `idx: 36`), so the migration exists and is tracked — but the live DB's own applied-
  migrations ledger `drizzle.__drizzle_migrations` has **0 rows** (verified live; `public.__drizzle_migrations`
  doesn't exist). Nothing in the numbered-migration sequence is recorded as applied against this
  database at all; the live 498-table schema was built by other means (hand-applied `psql`, per
  CLAUDE.md's own documented manual-migration history).
- **Owner of that blocker is `openspec/changes/manual-migration-reconciliation/`**, which already
  documents this precisely and independently — 41 journal entries vs 0 live ledger rows, 66 loose
  root SQL files outside the journal, 41 unresolved hashes, `PRE_APPLY_BLOCKED` with `ledgerCount=0`,
  and an explicit standing instruction not to run global `drizzle-kit migrate`, `--fix-hashes`, or
  ledger repair until the baseline decision is approved. **Do not attempt to unblock this lane by
  hand-applying `0036` or `error_research_context.sql`** — that would add yet another
  out-of-ledger table to the exact drift problem that change is trying to reconcile. This lane's
  `ERROR_RESEARCH_CONTEXT_PROVEN` gate is downstream of that decision.

## Files

- `scripts/atlas/research-error-fixes.mjs` — the ER0–ER6 script
- `sveltekit-frontend/drizzle/manual/error_research_context.sql` — receipt table
- `sveltekit-frontend/scripts/atlas/audit-error-research-lane-blockers-v1.mts` — read-only blocker probe
