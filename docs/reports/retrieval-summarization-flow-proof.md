# Retrieval Summarization Flow Proof

Generated: 2026-07-01T22:30:28.066Z
Status: LIVE_PASS
Query: GPU Qdrant TurboVec Go Retrieval HyperRAG dense search summaries

## Contract

EmbeddingGemma -> Qdrant content shortlist -> TurboVec gRPC transform/prefilter -> Go Retrieval -> Postgres truth join -> LangExtract -> Gemma4 bounded summary.

| lane | status | detail |
|---|---:|---|
| embeddinggemma | LIVE_PASS | http://127.0.0.1:8081 |
| qdrant | LIVE_PASS | http://127.0.0.1:6333 |
| turbovec_grpc | LIVE_PASS | 127.0.0.1:50062 |
| go_retrieval | LIVE_PASS | http://127.0.0.1:8100 |
| postgres_truth_join | LIVE_PASS |  |
| langextract | LIVE_PASS | http://127.0.0.1:8096 |
| gemma4_summary | LIVE_PASS | http://127.0.0.1:8090/v1 |

## Summary Preview

```json
{
  "summary": "The provided context is a codebase feature envelope summary, detailing basic statistics for the analyzed code. Key metrics include a word count of 129, 40 sentences, 25 paragraphs, and a character count of 2656. The average words per sentence is calculated as 3.225. The document type is classified as a 'codebase_feature_envelope' with a general contract type.",
  "domain_class": "Codebase Analysis",
  "ontology_label": "Codebase Feature Envelope Summary",
  "topology_label": "Basic Code Metrics",
  "source_refs": [
    "sveltekit-frontend/src/lib/server/ai/error-fix-memory.ts",
    "sveltekit-frontend/src/lib/server/analytics/research-summaries-db.ts",
    "sveltekit-frontend/src/lib/config/retro-console-palettes.ts",
    "sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts",
    "sveltekit-frontend/src/lib/components/ui/gaming/effects/gradient-utils.ts",
    "sveltekit-frontend/src/lib/server/indexer/cluster-summary.ts",
    "sveltekit-frontend/src/lib/components/ui/gaming/constants/gaming-constants.ts",
    "sveltekit-frontend/src/lib/utils/accessibility.ts"
  ],
  "missing_evidence": [
    "Specific details regarding GPU Qdrant TurboVec Go Retrieval HyperRAG dense search summaries are not present in the provided source references or extracted structure."
  ],
  "confidence": 0.9
}
```
