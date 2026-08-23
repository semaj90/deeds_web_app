## 1. `agent/fanout-proof-db-readiness-20260822` verification

- [x] 1.1 Verify SQL syntax defect + fix (`20260822_graphify_revision_authority_v2.sql`) via direct diff read. Confirmed real, confirmed fixed correctly, no destructive DDL either side.
- [x] 1.2 Verify compat-entrypoint merge-corruption defect + fix (`materialize-graphify-source-inventory.mts`) via `git show`. Confirmed: 324 lines → 3-line clean shim.
- [x] 1.3 Verify the independent proof script's writer-path repoint (`prove-graphify-revision-owner-v2.mts`) via diff. Confirmed small, correct.
- [ ] 1.4 Run the read-only V3 dry manifest command in an isolated worktree, capture full output here. Command confirmed structurally read-only by code inspection before running (DB-write block gated behind `--apply` + two env vars, none set). **Running as of this task's last update — record the result when it completes.**

## 2. `agent/ace-centroid-alignment-20260822` verification

- [x] 2.1 Verify the "duplicate migration" claim for `codebase_chunk_index_routing_tier_columns.sql` / `route_runtime_packets_raw_column.sql` against `drizzle/manual/20260516_storage_tier_routing.sql` (grep-confirmed the May migration already owns all four columns via `IF NOT EXISTS`). Confirmed genuinely redundant; removal is git-history cleanup only, no live-DB impact (both were idempotent `IF NOT EXISTS` migrations already applied this session).
- [x] 2.2 Verify the `search-analytics.ts` Drizzle schema fix via diff. Confirmed real bug (wrong type `integer` vs live `uuid`, wrong/commented-out `compressedEmbedding` dimension) genuinely fixed.
- [x] 2.3 Run `node scripts/atlas/audit-ace-storage-runtime-alignment.mjs` (pure static check, no DB). **Result: 35/35 passed.**
- [x] 2.4 Run `npx vitest run src/lib/server/retrieval/centroid-cache-contract-v1.spec.ts`. **Result: 5/5 passed.**
- [x] 2.5 Attempt `npx vitest run src/lib/server/atlas/retrieval/semantic-storage-boundary-v1.spec.ts` per the operator's proposed command. **File does not exist on this branch** — confirmed via `find` across the full worktree checkout. Flagged as an inaccuracy in the proposed next step; not chased to find where (if anywhere) this file actually lives.

## 3. Not started this pass (real infra actions, deferred pending confirmation)

- [ ] 3.1 The disposable-Postgres-on-55432 progression from the fanout-proof plan: create `parent-atlas-fanout-proof` container (`pgvector/pgvector:pg18-trixie`, host port 55432), add the shell-side `DATABASE_URL` guard (refuse if it matches `5434`, require it matches `55432`), then run: schema-only clone from the shared 5434 instance → apply the repaired revision migration → apply the graph-snapshot-revision migration → Graphify writer canary (rolled back) → full manifest V3 apply on 55432 only → independent read-only revision-owner proof (rolled back) → graph-snapshot-writer proof → full proof snapshot → FANOUT admission read-only proof. **Not started** — real Docker infrastructure + live migration application, even though scoped to a disposable DB, warrants its own confirmed pass rather than folding into a review task.
- [ ] 3.2 The real `:8090` ACE chat replay against the repaired database (ace-centroid-alignment branch's stated next runtime gate, to run only after 2.3/2.4 pass — which they do). **Not started** — same reasoning as 3.1, a live runtime action against llama-server worth its own explicit go-ahead.
- [ ] 3.3 If 3.2 fails, the operator's fallback is to patch the precise optional-lane return site in the ACE context assembler (explicitly scoped narrow — "not a blanket catch around ACE", citing the assembler's existing correct fail-open behavior for cached-chunk reads as the pattern to match). Deferred until 3.2 actually runs.
- [ ] 3.4 If 3.2 succeeds, the operator's stated follow-on is to leave ACE degradation alone and move to wiring proof-qualified storage/GPU capabilities into the MCP Viterbi capability registry as hard executor admission masks (replacing probabilistic Viterbi weighting for those specific capabilities). Deferred — downstream of 3.2.

## 4. Merge decision (not made here)

- [ ] 4.1 Both branches appear correctness-verified and low-risk to merge (no destructive DDL, no live-data mutation, static+unit checks passing) — but the actual merge-to-`main` decision is an operator call, consistent with this session's established caution around shared-branch git operations (see `inference-wiring-deep-audit-aug22` task 5.9's merge-then-revert finding from earlier this session — multiple concurrent agents are actively touching `main`).
