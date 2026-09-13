# Promotion Board Reconcile 02

Generated: 2026-09-13T03:53:29.686Z
Mode: READ_ONLY
Checksum: sha256:68c279bf077baf8c9cf9a324ddc8bf692e255c156827abf7ffb535381b1df7c4

## Board state

| Lane | Status |
|---|---|
| SOURCE_AUTHORITY | PARTIAL |
| TRACE_CORE | PROVEN |
| SEMANTIC_OWNER | codebase_chunks_768 (DECLARED) |
| SEMANTIC_CHALLENGER | codebase_chunks_768_v2 (NOT_PROMOTED) |
| CURRENT_SEMANTIC_CORPUS | BLOCKED |
| JUDGMENT_CORPUS | BLOCKED |
| JUDGMENT_IMPORT | DISABLED |
| RRF_CALLER_CONVERGENCE | PARTIAL |
| TOPOLOGY_CONTRACT | PROVEN |
| TOPOLOGY_EXECUTOR | OPTIONAL_CAPABILITY_NOT_DEPLOYED |
| RERANK_EXECUTOR | UNCONFIGURED |
| GRAPHIFY_PROMOTION | DO_NOT_RETRY |

## Promotion flags

| Flag | Value |
|---|---|
| safeToProject | false |
| safeToImportJudgments | false |
| safeToEnableTopology | false |
| safeToMigrateRrfCallers | true |
| safeToConfigureRerank | false |
| safeToRetryGraphifyPromotion | false |

## Blocker matrix

| Lane | Status | Promotion impact | Next gate |
|---|---|---|---|
| SOURCE | PARTIAL | BLOCKS safeToProject, safeToRetryGraphifyPromotion | CURRENT-STRUCTURAL-LINEAGE-01 |
| SEMANTIC_CORPUS | BLOCKED | BLOCKS safeToProject, safeToConfigureRerank, safeToRetryGraphifyPromotion | SEMANTIC-CORPUS-ADMISSION-01 |
| JUDGMENT | BLOCKED | BLOCKS safeToImportJudgments, safeToConfigureRerank | GOLDEN-REVIEW-CORPUS-02 |
| RRF | PARTIAL | BLOCKS safeToMigrateRrfCallers | RRF-CALLER-CLASSIFICATION-02 |
| TOPOLOGY | OPTIONAL_CAPABILITY_NOT_DEPLOYED | NONE (optional capability; does not block safeToProject) | TOPOLOGY-EXECUTOR-NEED-01 |
| TRACE | PROVEN | NONE — TRACE-MCP-CORE-SEARCH-01 leaves the critical path | none (returns to queue only if a downstream lane finds a missing contract) |
| RERANK | UNCONFIGURED | BLOCKS safeToConfigureRerank (already blocked upstream by SEMANTIC_CORPUS + JUDGMENT) | rerank endpoint configuration (P7) |
| GRAPHIFY | DO_NOT_RETRY | Retry gated behind safeToRetryGraphifyPromotion | CURRENT-STRUCTURAL-LINEAGE-01 (shared with SOURCE) |

## Read-only invariants

- writesPerformed: false
- graphifyApplyInvoked: false
- topologyStarted: false
- rerankConfigured: false
- judgmentsImported: false
- rrfRuntimeChanged: false
- qdrantModified: false
- postgresModified: false
- dockerCleanupPerformed: false

## Next-priority queue

- P0: CURRENT-SOURCE-OWNER/WORKSPACE-SNAPSHOT — Already PARTIAL_PROVEN for the admitted revision at the terminal-execution level; CURRENT-STRUCTURAL-LINEAGE-01 is the actual next unresolved sub-gate per parent-atlas-promotion-gates-v1.json.
- P1: SEMANTIC-CORPUS-ADMISSION-01 — Blocked on CURRENT_CORPUS_SELECTION_UNRESOLVED.
- P2: GOLDEN-REVIEW-CORPUS-02 — Blocked on judgment corpus not bound to a 768-dim current semantic corpus.
- P3: RRF-CALLER-CLASSIFICATION-02 — Not blocking: RRF_CALLER_CLASSIFICATION_READY (93/93 classified, 0 EXECUTOR_AS_LANE violations). Migration itself is a separate, not-yet-made decision.
- P4: PROMOTION-BOARD-RECONCILE (rerun) — Re-run after any of P0-P3 receipts change.
- P5: retrieval profile convergence — Depends on P1-P3.
- P6: TOPOLOGY-EXECUTOR-NEED-01 — Optional-capability question, not currently blocking; port 8101 confirmed owned by the Go index worker.
- P7: rerank endpoint configuration — Gated behind P1 and P2.

Full detail: `docs/reports/promotion-board-reconcile-v2.json`.
