# Parent Atlas — Consolidated Execution Plan (2026-08-02)

## TL;DR

- **Source docs reviewed**: 4 (`parent-atlas-workstation-todo.md` [2026-07-06], `PARENT_ATLAS_WORKSTATION_TODO_0_100.md` [2026-07-23, most-current roadmap], `MASTER-FEATURE-TODO-2026-05-20.md` [oldest, self-contradictory on graph-lane status], `parent-atlas-workstation-may-audit-2026-07-26.md` [most-recent, cross-checks all three against live code])
- **Duplicate items merged**: ~9 (mostly retrieval-pass Qdrant/Neo4j/Redis/Langfuse wiring repeated across Phase 11D/11E/101A sections, and the 4 "Knowledge Graph Tool Lanes" repeated as both open and closed in the same May-20 doc)
- **Stale items dropped**: ~14 (May-20 doc items superseded by the July-23/26 docs — export stack, LAYER 1 identity, atlas-cartridge-seed, simdjson wiring, card ranking/compression all confirmed done in later docs)
- **Genuinely open, un-contradicted items carried forward**: 12
- **Final consolidated task list**: 12 items

## Cross-doc reconciliation

| Item | Verdict | Reason |
|---|---|---|
| Export Stack (Arrow/GIN/MsgPack/QLoRA), LAYER 1 canonical identity | **DONE, drop** | `parent-atlas-workstation-todo.md` (Jul 6) marks these complete; no later doc contradicts. |
| `atlas:cartridge-seed`, simdjson Bifrost wiring, card rank/compress (Phase 10A/AC/11D) | **DONE, drop** | MASTER-FEATURE-TODO marks these `[x]` with dated verification notes (2026-05-27/28); not referenced as open in the two July docs. |
| 4x "Knowledge Graph Tool Lanes" (`attention_rank_files`, `som_topology_stats`, `language_distribution`, `playbook_lookup_by_language`) | **CONTRADICTED → treat as OPEN** | MASTER-FEATURE-TODO marks these done (KG section + Phase KG-6), but the May-26 audit found live code (`scripts/mega-audit/build-chunk2-report.mjs`, confirmed present) still classifies all 4 as `contract-only / production:false / callable:false`. Audit wins — carried into task list as item 6. |
| retrieval-pass.mjs Qdrant/Neo4j/Redis/Langfuse wiring | **Duplicate across Phase 11D, 11E, 101A** | Same wiring claimed done 3x in MASTER-FEATURE-TODO; collapse to one line, treat as done (no later contradiction). |
| Full-corpus graph snapshot / NetworkX-GDS parity / bounded traversal / RRF canary | **OPEN, confirmed by both July docs** | `PARENT_ATLAS_WORKSTATION_TODO_0_100.md` lists all as `NOT_RUN`; May-26 audit independently confirms same gaps still block `AUTHORITY_PROMOTION`. Carried as items 1–4. |
| OpenCode dispatch router / `/api/opencode` mock surface / opencode-atlas-bridge placeholder embedding | **OPEN, verified live** | Glob-confirmed: `src/lib/server/opencode/dispatch-router.ts`, `src/routes/api/opencode/+server.ts`, `src/lib/server/opencode-atlas-bridge.ts` all exist; May-26 audit read their contents and found STUB/mock/placeholder code. Carried as item 5. |
| Hermes-era dead references (`/api/ai/hermes-run`) | **OPEN — cleanup** | May-26 audit confirms route file does not exist but is still referenced by 2 live scripts. Carried as item 9. |
| Package ownership / worktree lease / boundary verifier (0-10 band) | **PARTIAL, needs live check** | `0_100.md` marks `PACKAGE_OWNERSHIP_RUNTIME_BOUNDARY: LIVE_PARTIAL` — cannot verify "partial" meaning from static read; flagged needs-live-verification, folded into item 10. |
| LAYER 2 compiler output expansion (ast_symbols 0.9%, lexical 2.4%, entities 0%) | **OPEN, live row-count claims need DB verification** | `parent-atlas-workstation-todo.md` gives specific coverage percentages against live Postgres — cannot confirm from static analysis; flagged needs-live-verification, carried as item 7. |
| Phase 101A/B/C archival & pruning gates (dirty-tree classification, doc crosswalk, etc.) | **Mostly DONE per MASTER-FEATURE-TODO checkmarks, a few `[ ]` remain** | Kept only the still-unchecked, concrete sub-items (ast-grep pipeline wiring, PG17→18 drift audit) as item 11; dropped the ~15 already-`[x]` report-generation sub-steps as noise. |
| Table row-count claims (58,365 packets, 99.7% embeddings, etc.) | **Cannot verify statically** | Flagged as "needs live verification" everywhere they appear; not treated as true or false. |

## Consolidated task list (priority order)

1. **Materialize full-corpus immutable graph snapshot (Postgres tables + manifest)**
   - What: Build the deterministic snapshot tables described in `0_100.md` bands 10-25/40-55 (node/edge/identity/topology hashes, exclusions + unresolved-identity ledger).
   - Why: Every downstream gate (`PERSISTED_LIVE_PARITY`, `BOUNDED_GRAPH_TRAVERSAL`, `GRAPH_RRF_CANARY`, `AUTHORITY_PROMOTION`) is blocked on this being `FULL_CORPUS_GRAPH_SNAPSHOT: NOT_RUN → RUN`.
   - Proof gate: Snapshot run produces a manifest with stable content hash across two consecutive runs on unchanged data; `node scripts/atlas/<snapshot-script>.mjs --verify` reports 0 hash drift.

2. **Prove persisted NetworkX vs Neo4j GDS PageRank parity on the same snapshot**
   - What: Run PageRank via both NetworkX (persisted) and Neo4j GDS against the snapshot from item 1, diff scores.
   - Why: `PERSISTED_LIVE_PARITY: NOT_RUN` is a named blocker in both July docs; PageRank contract code already exists (`pagerank-contract.ts`, confirmed live) but has never been checked for parity.
   - Proof gate: Diff report shows score correlation above an explicit threshold (e.g. Spearman ≥0.95) on the frozen snapshot; write result to a dated report file.

3. **Replace legacy multihop adapter with bounded, snapshot-scoped traversal**
   - What: Enforce canonical identity, hop limits, and fan-out limits in the traversal path; remove/retire the unbounded legacy adapter.
   - Why: `BOUNDED_GRAPH_TRAVERSAL: NOT_RUN`; current multihop code (`retrieveMultihopContext`, confirmed wired into ACE) is unbounded and not snapshot-scoped per both docs.
   - Proof gate: `npm run smoke:multihop-contextual-tree` (existing smoke, confirmed present) passes AND explicitly logs hop-count/fan-out truncation events on a query that would otherwise exceed limits.

4. **Run the graph RRF canary (exact + sparse + dense + graph candidates)**
   - What: Execute the RRF canary described in `0_100.md` band 80-88 with all four candidate types and capped, provenance-preserving graph influence.
   - Why: `GRAPH_RRF_CANARY: NOT_RUN`; this is the last gate before `AUTHORITY_PROMOTION` can be unblocked.
   - Proof gate: Canary run report shows all 4 candidate types contributing and graph-authority influence capped at its documented ceiling; written to a report file with before/after retrieval-quality comparison.

5. **Un-stub the OpenCode dispatch layer and Atlas bridge**
   - What: Replace `// STUB` returns in `src/lib/server/opencode/dispatch-router.ts` (routes: `search_rg`, `query_qdrant`, `search_codebase`, `plan`, `auto`) with real execution; replace the placeholder `new Array(768).fill(0.1)` embedding in `src/lib/server/opencode-atlas-bridge.ts` with a real embed call; replace the mock tool list in `src/routes/api/opencode/+server.ts`.
   - Why: May-26 audit read all three files and confirmed stub/mock/placeholder code is still live — this is the single biggest gap between "retrieval primitives exist" and "OpenCode can actually use them."
   - Proof gate: A real query through `/api/opencode` returns a non-placeholder embedding (vector not all-0.1) and a dispatch route (`query_qdrant`) returns actual Qdrant hits, not a queued placeholder object.

6. **Register the 4 Knowledge-Graph tool lanes as production-callable (not contract-only)**
   - What: `attention_rank_files`, `som_topology_stats`, `language_distribution`, `playbook_lookup_by_language` — currently `status: 'contract-only', callable: false` in `scripts/mega-audit/build-chunk2-report.mjs` (confirmed live), despite MASTER-FEATURE-TODO claiming them done.
   - Why: MASTER-FEATURE-TODO's own "done" claim is directly contradicted by the audit script's live output — don't trust the older doc; this is a real, currently-open gap.
   - Proof gate: Re-run `node scripts/mega-audit/build-chunk2-report.mjs` and confirm all 4 lanes flip to `callable: true, production: true`.

7. **Verify + finish LAYER 2 compiler-output extraction coverage (ast_symbols/lexical/entities)**
   - What: Fix `phase1-ast-grep-extraction.mjs` (confirmed to exist) writing synthetic `packet_key`s instead of real ones (blocking issue per `parent-atlas-workstation-todo.md`), then run lexical + entity extraction phases.
   - Why: Coverage numbers cited (ast_symbols 0.9%, lexical 2.4%, entities 0%) are **live-DB claims that cannot be verified from static analysis** — needs live verification before treating as current, but the underlying blocking bug (synthetic keys) is a code-level fact worth fixing regardless.
   - Proof gate: `npm run atlas:phase1:ast-grep:dry` output shows packet_keys matching real `atlas_packets.packet_key` values (not synthetic), then `--apply` run raises `ast_symbols` coverage; confirm new percentage via a fresh Postgres count query (live verification required, not assumed).

8. **Close Hermes-era dead references**
   - What: `/api/ai/hermes-run` is referenced by `scripts/smoke-attention-rank.mjs` and `src/lib/server/atlas/route-feature-map.ts` but `src/routes/api/ai/hermes-run/+server.ts` does not exist.
   - Why: Confirmed real drift by the May-26 audit; low effort, removes a source of confusing false-positive "this exists" signals for future audits/agents.
   - Proof gate: `rg "hermes-run" scripts/ src/` returns 0 hits after cleanup (or the route is re-created if intentionally still needed — operator decision, not assumed).

9. **Verify PACKAGE_OWNERSHIP_RUNTIME_BOUNDARY `LIVE_PARTIAL` — determine what's missing**
   - What: `0_100.md` marks this `LIVE_PARTIAL` without detail on what remains.
   - Why: Cannot determine "partial" scope from static docs alone — needs a live-state read of the actual boundary-verifier output.
   - Proof gate: Run the boundary verifier (`npm run verify:spec-supersedes` per project CLAUDE.md) and record which package(s) fail ownership declaration; convert to a concrete follow-up item once known.

10. **Build the durable ErrorResolutionIssue / error_resolution_runs model + rollback proof**
    - What: `0_100.md` band 88-94/94-98 — triage/retrieval/patch/validation as bounded roles, rollback artifacts required, independent validation before promotion.
    - Why: `AGENTIC_ERROR_REPAIR: LIVE_PARTIAL` — partially built per docs, but no closed-loop rollback proof exists yet; this is a named precondition for `AUTHORITY_PROMOTION`.
    - Proof gate: Run one supervised low-risk error-resolution canary end-to-end; confirm baseline reproduction, scope authorization, and a working rollback artifact exist and were exercised (not just designed).

11. **Finish PG17→18 drift audit + ast-grep pruning pipeline wiring**
    - What: Two concrete unchecked items from Phase 101A: (a) audit PostgreSQL 17.6 vs 18 table/index drift to label canonical vs experimental tables; (b) wire `ast-grep` into the directory-pruning analysis pipeline (scripts already exist: `run-ast-grep.mjs`, `ast-grep-map.mjs`, `phase1-ast-grep-extraction.mjs`, `phase1.5-ast-grep-extraction.mjs`, `phase2a-ast-grep-synthetic-key-fix.mjs` — all confirmed present in earlier greps of this repo's structure, wiring/integration is what's missing).
    - Why: Blocks the archive/apply gate for Phase 101A repo pruning; currently stuck at "dry-run ready" per the doc's own status line.
    - Proof gate: Drift audit report exists comparing 17.6 vs 18 schemas with an explicit canonical/experimental label per table; ast-grep pipeline run produces file-role classifications consumed by the pruning dry-run without manual intervention.

12. **Reconcile and archive stale planning docs themselves**
    - What: MASTER-FEATURE-TODO-2026-05-20.md is confirmed internally contradictory (marks the 4 KG tool lanes both open and done) and superseded for most other content by the two July docs. `parent-atlas-workstation-todo.md` is superseded for LAYER 1/Export Stack but still the only source for LAYER 2/3/4 status.
    - Why: Prevents future sessions from re-discovering the same contradictions this task just resolved; per project archival rules, archive (don't delete).
    - Proof gate: `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md` moved to `deeds_labs/archive/` (or `.archive/`) with a manifest entry per this project's archival convention; this consolidated plan becomes the new pointer target in any index/TOC files that referenced the old doc.
