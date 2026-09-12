# Deferred Search Tool Reintegration + Logic Pivot — 2026-09-11

This addendum is part of `parent-atlas-neural-prefill-encoder`. It records the requested
priority correction without changing any live MCP/tool configuration.

## Ledger task

- [x] **SEARCH-REINTEGRATION-01 — Inventory disabled/auxiliary search-tool surfaces for later reintegration.**
  `scripts/atlas/audit-deferred-search-tool-reintegration-v1.mjs` performs a static/read-only
  inventory of TRACE MCP, `atlas-tools`, the disabled `atlas-task-kernel`, Vibreti/TurboVec-style
  challenger references, placeholder search-tool names, and NLP-sidecar entrypoints. The audit
  calls no external tool, enables no MCP server, and performs no datastore/model/projection write.

The future reintegration gates below are deliberately **deferred and non-blocking**; they are plain
ledger gates rather than active checkboxes so they do not inflate current OpenSpec completion
counts.

- **SEARCH-REINTEGRATION-02 — Exact identity envelope.** Any reintegrated search/tool result must
  carry admitted `workspaceRevision`, `sourceRevision`, `sourceRef`, `packetKey`,
  `canonicalChunkId`, `evidenceRefs`, and `producerRevision`. No tool may synthesize canonical IDs
  or revisions.
- **SEARCH-REINTEGRATION-03 — TRACE observability boundary.** TRACE MCP may observe execution and
  receipts but may not own retrieval, relevance, evidence, canonical identity, or source history.
- **SEARCH-REINTEGRATION-04 — NLP sidecar boundary.** The NLP sidecar remains a grounded
  AST/enrichment executor. Reintegration requires exact source spans, revision-qualified input,
  producer identity, zero canonical-ID minting, and zero datastore writes.
- **SEARCH-REINTEGRATION-05 — Vibreti/TurboVec challenger boundary.** Search/ranking challengers
  may execute over an admitted candidate snapshot or `semantic_768`; they may not create an
  additional logical RRF vote.
- **SEARCH-REINTEGRATION-06 — atlas-task-kernel re-enable gate.** Keep disabled until its handlers
  are deterministic and non-placeholder, identity failures are fail-closed, replay is proven, and
  health/readiness receipts exist.
- **SEARCH-REINTEGRATION-07 — Re-enable preflight.** Before changing any enable flag, rerun MCP
  startup/unreachable/tool-response audits and prove an outage degrades only the optional surface.

## Active logic queue

External tool plumbing is now `DEFERRED_NON_BLOCKING`. The active queue is:

1. **P0 — `parent-atlas-retrieval-lineage-dag-convergence` / `CURRENT_SOURCE_PACKET_CHUNK_RECONCILIATION`.**
   Run the bounded selected-snapshot packet/chunk v2 planner and classify the exact lineage blocker.
   No Qdrant, ontology, ranking, cache, or agent promotion can replace this proof.
2. **P1 — `parent-atlas-candidate-feature-execution-fabric` / candidate identity + snapshot binding.**
   `CandidateOrdinal` is a derived execution coordinate only and must bind to one
   revision-qualified `CandidateFeatureSnapshotV1`.
3. **P1 — `parent-atlas-retrieval-fusion-reachability` / logical-lane convergence.**
   Within-lane dedupe precedes RRF. Qdrant, pgvector exact, cuVS, CAGRA, and TurboVec are semantic
   executors/challengers, not independent semantic evidence votes.
4. **P1 — `parent-atlas-query-routing-classifier` / revision-qualified routing.**
   Query/domain/topic classification produces routing evidence only; it cannot mint source/chunk
   authority.
5. **P2 — `parent-atlas-retrieval-lod-algorithm-taxonomy` / chunk-file-directory normalization.**
   Normalize existing structural, lexical, semantic, classifier, topology, and ontology evidence
   into one chunk profile; derive file and directory profiles without introducing a datastore.
6. **P2 — `parent-atlas-ontology-kernel` / ontology admission.**
   Classifier labels, NLP nouns/keywords, and LangExtract observations remain evidence until
   resolved through the canonical concept registry and admitted to `OntologyLinkedTupleV1`.
7. **P2 — `parent-atlas-ace-rlm-bitfrost-integration` / stable candidate manifest pagination.**
   Freeze one ordered candidate universe with `candidateSetChecksum` + `rankingRevision`; paginate
   after ranking using stable cursors rather than mutable OFFSET semantics.
8. **P3 — `parent-atlas-neural-prefill-encoder` / exact ContextManifest binding.**
   Bind the manifest to the exact CandidateFeature/FEAT-04 cohort. Neural prefill remains
   `SHADOW_READONLY` until reviewed quality evidence authorizes promotion.

## Storage/search invariant

The code retrieval architecture remains one canonical identity fabric with multiple derived
features/executors:

```text
sealed Graphify source
  -> canonical packet/chunk identity (PostgreSQL)
  -> lexical / AST-CST-LSP / semantic_768 / graph-ontology evidence
  -> compact topology + classifier features (KMeans/SOM/PageRank/domain)
  -> CandidateFeatureSnapshot
  -> one logical lane per evidence family
  -> ranking / stable CandidateManifest
  -> ContextManifest
  -> synthesis/prefill
```

KNN, Top-K, KMeans, SOM, PageRank, GraphRAG, pgvector, Qdrant, cuVS, CAGRA, TurboVec,
ATen/cuTile, ACP/A2A, MsgPack, mmap, and `.okf` are executors, projections, transports, or derived
features. None owns canonical source/chunk identity.

`writesPerformed`: source/OpenSpec audit artifacts only. No tool enablement or canonical/projection
mutation is authorized by this addendum.
