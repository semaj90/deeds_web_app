# Retrieval Summarization Flow Proof

Generated: 2026-07-02T03:38:40.126Z
Status: WARN
Query: GPU Qdrant TurboVec Go Retrieval HyperRAG dense search summaries

## Contract

EmbeddingGemma -> Qdrant content shortlist -> TurboVec gRPC transform/prefilter -> Go Retrieval -> Postgres truth join -> LangExtract -> Gemma4 bounded summary.

| lane | status | detail |
|---|---:|---|
| embeddinggemma | FALLBACK_PASS | OpenAI-compatible EmbeddingGemma unavailable; used Ollama EmbeddingGemma only. Primary error: fetch failed |
| qdrant | LIVE_PASS | http://127.0.0.1:6333 |
| turbovec_grpc | LIVE_PASS | 127.0.0.1:50062 |
| go_retrieval | LIVE_PASS | http://127.0.0.1:8100 |
| postgres_truth_join | LIVE_PASS |  |
| langextract | LIVE_PASS | http://127.0.0.1:8095 |
| gemma4_summary | LIVE_PASS | http://127.0.0.1:8090/v1 |

## Summary Preview

```json
{
  "summary": "The provided context details various components related to advanced retrieval and inference mechanisms within a codebase, including GPU-accelerated reranking, TurboVec caching, and specific modules for LLM interaction (Gemma4 tool loop), graph analysis (HyperRAG, research graph), and general knowledge base retrieval.",
  "domain_class": "RetrievalAugmentedGeneration (RAG) / AI Infrastructure",
  "ontology_label": "Advanced Knowledge Retrieval and Inference Pipeline",
  "topology_label": "Modular Service Layer",
  "source_refs": [
    "sveltekit-frontend.kb-retrieval-server",
    "sveltekit-frontend.turbo-prefix-cache",
    "sveltekit-frontend.gemma4-tool-loop",
    "sveltekit-frontend.research-graph-rl",
    "sveltekit-frontend.cluster-summary",
    "sveltekit-frontend.gpu-reranker",
    "sveltekit-frontend.minified-research-cache",
    "sveltekit-frontend.hypergraph-4d"
  ],
  "missing_evidence": [
    "Specific implementation details or usage examples for 'GPU Qdrant TurboVec Go Retrieval' are not explicitly detailed, only the presence of related modules."
  ],
  "confidence": 0.9
}
```
