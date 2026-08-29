# Parent Atlas retrieval and analysis fabric audit

Date: 2026-08-29
Mode: read-only repository audit

## Verified surfaces

| Surface | Owner | State |
|---|---|---|
| Source identity, revisions, eligibility, evidence | PostgreSQL 18 | canonical owner |
| Relational/vector oracle | `codebase_chunk_index.content_embedding_768` / pgvector | semantic_768 proven for frozen 15-row cohort |
| CST/AST observations and source spans | 8095 Tree-sitter / AST-grep lane | provider surface present |
| Domain and `.okf` artifact processing | Python/TypeScript schema-driven pipeline | derived receipts present |
| Dense retrieval projection | Qdrant `codebase_chunks_768`, vector key `content` | rebuildable projection; frozen 15-row parity proven |
| Retrieval execution and streaming | Go Retrieval | `StreamCodebase` and `StreamEvidence` present; read-only executor |
| Fusion and context authority | SearchRuntime / ACE | downstream owner; raw stream events are not LLM context |
| GPU execution | 8098 WSL2 RAPIDS/cuVS/cuGraph | fixture ABI proven; live cuVS runtime currently blocked by missing WSL environment |

## Frozen flow

```text
source bytes / workspace revision
  -> 8095 CST/AST observations
  -> exact source/chunk binding
  -> PostgreSQL canonical eligibility
  -> CandidateOrdinalMapV1
  -> semantic_768 / EmbeddingGemma
  -> Qdrant, GPU, and topology projections
  -> Go Retrieval raw lane hits or chunk streams
  -> SearchRuntime identity normalization and single RRF owner
  -> ACE selection
  -> ContextManifest
```

PostgreSQL AIO and bitmap heap scans are planner behavior, not a separate application retrieval lane. The required performance evidence is an `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` receipt; a specific scan type is not a correctness requirement.

## Current proven evidence

- PostgreSQL/Qdrant `semantic_768` parity: 15/15 identities, vectors, scores, and ordering.
- Candidate feature manifest: 15 rows × 25 features.
- Graph feature replay: 7 present, 8 masked absent; baseline and graph replay deterministic.
- CandidateOrdinal executor fixture ABI: 23 graph rows, zero unknown ordinals, zero revision mismatches.

## Open gates

- Expand exact source lineage and semantic parity from 15 to 128, then 768.
- Install/select the WSL RAPIDS environment containing `torch` and `cuvs`; then prove live 8098/cuVS ABI and exact parity.
- Prove full-corpus chunk-stream replay through canonical identity normalization and ACE selection.
- Keep structural, sparse, graph, topology, classifier, cache, and learned reranking lanes separately gated.

No database, Qdrant, Neo4j, Valkey, or GPU state was changed by this audit.
