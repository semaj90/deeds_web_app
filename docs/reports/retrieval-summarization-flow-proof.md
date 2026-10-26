# Retrieval Summarization Flow Proof

Generated: 2026-10-15T20:15:32.044Z
Status: WARN
Query: Parent Atlas Qdrant TurboVec Go Retrieval LangExtract Ornith summarization flow

## Contract

EmbeddingGemma -> Qdrant content shortlist + Postgres pgvector shortlist -> TurboVec gRPC transform/prefilter -> Go Retrieval -> Postgres truth join -> LangExtract -> Ornith 1.5 bounded summary.

| lane | status | detail |
|---|---:|---|
| embeddinggemma | LIVE_PASS | http://localhost:11434 |
| qdrant | LIVE_PASS | http://127.0.0.1:6333 |
| postgres_pgvector | LIVE_PASS | codebase_chunk_index |
| turbovec_grpc | LIVE_PASS | 127.0.0.1:50062 |
| go_retrieval | LIVE_PASS | http://127.0.0.1:8100 |
| postgres_truth_join | LIVE_PASS | atlas_packets |
| langextract | LIVE_PASS | http://127.0.0.1:8095 |
| ornith_synthesis | DIAGNOSTIC_PASS | http://127.0.0.1:8090/v1 |

## Canonical pgvector ↔ Qdrant Parity

Status: PARTIAL_PARITY
ID Overlap: 1 / 8 (12.5%)
Path Overlap: 1 / 8

## Summary Preview

```json
{
  "summary": "The Parent Atlas summarization flow is a multi-stage retrieval pipeline. It begins with a summary-ranking-retrieval-pipeline.mjs that ranks and retrieves feature summaries, then feeds them into a Qdrant/TurboVec embedding store for vector search. Retrieved summaries are extracted via LangExtract (LangChain) and enriched with tree-sitter chunking and AST-grep parsing. Results are cached in a phase101-summary-cache.ts layer and ranked by a graphify-summary-ranking-pipeline.mjs graph-based ranking step. The flow supports SOM/AE dimensionality reduction for gap-analysis summaries and context-for-file retrieval, with a semantic-loop-types orchestration layer.",
  "domain_class": "retrieval_summarization_flow",
  "ontology_label": "Parent Atlas Qdrant TurboVec Go Retrieval LangExtract Ornith summarization flow",
  "topology_label": "multi-stage retrieval -> embedding -> extraction -> ranking pipeline",
  "citations": [
    {
      "evidence_id": "ev_57ed2a03ba19da73",
      "source_revision": "sha256:09c87d1289a1e4a6b4f360f831c6ac962e828f489c9ecb2ed74164448b8862c1",
      "start_byte": 0,
      "end_byte": 37226
    },
    {
      "evidence_id": "ev_a4602a70e2cf27da",
      "source_revision": "sha256:4a911c46c0339f1c2952d1077ca07e6a2a9f0101d7bdcc62062522fd492bcd45",
      "start_byte": 0,
      "end_byte": 20106
    },
    {
      "evidence_id": "ev_b3d11fe818984353",
      "source_revision": "sha256:30574833cd4906e8439dfb7fd5074c2ca21466c1d137b38d26666e434c4c20f8",
      "start_byte": 0,
      "end_byte": 20889
    },
    {
      "evidence_id": "ev_53963d6d8dc3594e",
      "source_revision": "sha256:88306ba3685d6e58c066c602fe18a82edbd2d2fc1a20dbce1ac032ba1d4aa9fb",
      "start_byte": 0,
      "end_byte": 3792
    },
    {
      "evidence_id": "ev_c252472110fcba13",
      "source_revision": "sha256:68a3940991abed3366506fc132799dbd08ff0eed25f1e476a304fd089abb6cbf",
      "start_byte": 0,
      "end_byte": 12030
    },
    {
      "evidence_id": "ev_2c53de3
```
