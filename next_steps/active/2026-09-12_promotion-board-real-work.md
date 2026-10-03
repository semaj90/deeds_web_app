# Promotion Board — Real Work Remaining (2026-09-12)

**TL;DR**: Today's session was measurement, not fixes. Every blocker below needs a human decision
or human labor — none of them can be closed by another audit script. Full technical detail and
receipts are in `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md` (search
`PROMOTION-BOARD-RECONCILE-02`); this file is the short, action-oriented version.

## What's actually blocking promotion, in priority order

### P0 — DONE (attempted), still blocked: Graphify ran and correctly refused to promote
**Update 2026-09-12: this was actually attempted, not skipped.** `npm run graphify:daily` was run
for real (three times — two retries cleared unrelated retention/environment blockers: a crashed
partial snapshot and two historical snapshots over the retention cap, both archived per this
repo's convention, plus a transient Windows file-lock that self-resolved). The pipeline got much
further than before — provenance/inventory/structural/validation all came back `PROVEN` — then hit
its own internal canonical-projection admission gate, which ran transactionally read-only and
returned **`NOT_SAFE_TO_PROJECT`: 10 of 11 promotion predicates fail.** Full breakdown in
`openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`'s
`CURRENT-SOURCE-TERMINAL-EXECUTION-01` entry (2026-09-12) and
`docs/reports/atlas-canonical-projection-fabric-audit-2026-09-12.json`.
- **This is not a partial failure to retry — it's real architecture debt the run surfaced**: no
  `atlas_packets.workspace_revision` column, `graphify_symbols` table exists but is empty, no
  representation/graph-manifest/ordinal-map ledgers exist at all. Re-running `graphify:daily` again
  will not change this outcome — these are things that need to be *built*, not re-triggered.
- **Action**: pick which of the 9 failing predicates to build out first (see the table in the
  tasks.md entry above) — this is a real prioritization decision, not a script to run.
- **Blocks**: everything else on this list, same as before — just with real evidence now instead of
  a "never ran" placeholder.

### P1 — CORRECTED 2026-09-12: neither "backfill" nor "rebuild" is actually available yet
`codebase_chunks_768` has 109,776 points; only the ~30 written by the compliant
`qdrant-sync-worker.ts` carry a valid `workspace_revision`. The other ~109,746 (6 legacy scripts'
output, all confirmed `promotionBlocked: true` in `docs/reports/emb3a-qdrant-writer-lineage-audit.json`)
have none. **Both options below were previously framed as independent choices — they're not.**
Both need the same missing upstream input: real `atlas_workspace_source_bindings` rows for the
admitted revision, which today is 0/61,718 packets (only 111 bindings exist at all, under a
*different*, non-admitted revision — see
`openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`'s
`WORKSPACE-REVISION-COLUMN-01` and `QDRANT-WRITER-CONTRACT-PATCH-01` entries for the full trace).
1. **Backfill** (`QDRANT-LEGACY-PAYLOAD-BACKFILL-01`, dry-run computed, `BLOCKED_ON_UNGROUNDED_REVISION`)
   — would write a `workspace_revision` value with zero Postgres justification. Refused.
2. **Rebuild** — ~~would naturally produce compliant payloads without a patch step~~ **corrected:
   false.** Rebuilding from Postgres today would derive from the same empty/dead
   `atlas_packets.workspace_revision` (integer, 100% zero) and the same near-empty binding table —
   it would produce an equally ungrounded corpus, just via a different code path. Not a shortcut.
- **The real action, superseding both options above**: run Graphify for real and let it produce
  actual source bindings (P0 — attempted 2026-09-12, self-blocked at `NOT_SAFE_TO_PROJECT` for
  unrelated reasons; see the deep-audit doc). Until that produces real bindings, neither backfill
  nor rebuild is meaningfully different from the other — both would write ungrounded data.

### P2 — Get someone to grade the 60 golden-review queries
60 queries are registered and ID-bound (`golden_review_pending` domain), but **zero judgments
exist for them**, and no human-graded judgment exists in this database for ANY query in any domain
(everything is `derived` or `gemma4`-graded). This is not a data-wiring problem — it needs an
actual person to sit down and grade query/candidate relevance.
- **Action**: assign a reviewer. The 60 queries are already staged and ready
  (`docs/reports/golden-review-query-registration-receipt-v1.json` has the IDs).
- **Blocks**: reranking, `GOLDEN-REVIEW-CORPUS-02` closure.

### P3 — Decide what to do with the 41 `LEGACY_COMPATIBILITY` RRF callers
93 RRF call sites classified; 41 are independent, real, production fusion implementations that
never delegate to the declared canonical owner (`search-runtime.ts`). This is a genuine
architectural sprawl question, not a bug: do these get migrated, retired, or left as intentionally
separate lanes? Also found: `combineViaRRF` (in `rrf-combiner.ts`) is itself a second
canonical-shaped primitive, separate from `search-runtime.ts`'s `fuseSearchRuntimeCandidates` —
that ambiguity needs resolving too.
- **Action**: a design decision, not a script. Full classification is in
  `docs/reports/rrf-caller-classification-v1.json`.

### P4 (optional, not blocking) — `TOPOLOGY-EXECUTOR-NEED-01`
Not started. Question: does any current admitted workload actually need a live topology executor
that Postgres/Neo4j/cuGraph/SearchRuntime can't already serve? If the honest answer is no, this
gate closes as `OPTIONAL_CAPABILITY_NOT_DEPLOYED` and nothing needs building.
- **Action**: read-only investigation, safe to pick up any time, low urgency.

## What NOT to do
- Don't run any of the above "fixes" without re-reading the relevant receipt first — several
  contain corrected findings that overturned this file's own earlier assumptions (e.g., the
  `atlas_packets.workspace_id` column existing, `latent_64` being populated). Assume anything here
  can go stale the same way.
- Don't merge `codebase_chunks_768` and `codebase_chunks_768_v2` — they're deliberately distinct
  (owner vs. challenger), confirmed multiple times this session.
