# Retrieval Summarization Flow Proof

Generated: 2026-10-15T20:06:10.614Z
Status: FAIL
Query: Parent Atlas Qdrant TurboVec Go Retrieval LangExtract Gemma4 summarization flow

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
| ornith_synthesis | FAIL | http://127.0.0.1:8090/v1 |

## Canonical pgvector ↔ Qdrant Parity

Status: PARTIAL_PARITY
ID Overlap: 1 / 8 (12.5%)
Path Overlap: 1 / 8

## Summary Preview

```json
{
  "summary": "{\n\"summary\": \"The Parent Atlas summarization flow is a multi-stage pipeline that ingests packet feature envelopes, derives parent-atlas feature IDs, compresses them via a TurboVec compression plan, and generates summaries with Gemma4. Key components include scripts/atlas/parent-atlas-turbovec-compression-plan.mjs (TurboVec compression planning), scripts/atlas/gemma4-parent-atlas-summaries.mjs (Gemma4 summarization), sveltekit-frontend/src/lib/server/generation/packet-summary-pipeline.ts (packet summary pipeline), and scripts/atlas/graphify-summary-ranking-pipeline.mjs (summary ranking). The flow integrates with the graph traversal API (src/routes/api/graph/traverse/+server.ts), code intelligence datastore (src/lib/server/ace/codeintel-datastore.ts), and context-for-file (src/lib/server/atlas/context-for-file.ts). The P4 Gap Analysis provides a summary index using Self-Organizing Maps (SOM) and Autoencoders (AE) for dimensionality reduction and visualization. The overall pipeline follows a phased execution model (Phase A: status/commands, Phase B: execution-ready, Phase 2: multivector enrichment, Phase 3: execution pipeline map, Phase 4: gap analysis).\",\n\"domain_class\": \"retrieval_summarization_flow\",\n\"ontology_label\": \"Parent Atlas Qdrant TurboVec Go Retrieval LangExtract Gemma4 summarization flow\",\n\"topology_label\": \"multi_stage_pipeline\",\n\"citations\": [\n{\n\"evidence_id\": \"ev_6a432e8a6679f68c\",\n\"source_revision\": \"sha256:97c0289bf0bc214f427c682853fa7878cf0e5787d5f449d5366e54d5068cde08\",\n\"start_byte\": 0,\n\"end_byte\": 12837\n},\n{\n\"evidence_id\": \"ev_c252472110fcba13\",\n\"source_revision\": \"sha256:68a3940991abed3366506fc132799dbd08ff0eed25f1e476a304fd089abb6cbf\",\n\"start_byte\": 0,\n\"end_byte\": 12030\n},\n{\n\"evidence_id\": \"ev_3115185b854a997b\",\n\"source_revision\": \"sha256:5083075083d7a2c03a0350e7cbd7fdd65be3449eba5d084833b3fd1e95d2945e\",\n\"start_byte\": 0,\n\"end_byte\": 15233\n},\n{\n\"evidenc
```
