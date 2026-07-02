# EmbeddingGemma Qdrant TurboVec Proof

Generated: 2026-07-02T04:06:45.983Z
Overall: WARN

| lane | status | detail |
|---|---:|---|
| embeddinggemma | FALLBACK_PASS | OpenAI-compatible endpoint unavailable; used Ollama EmbeddingGemma only. Primary error: fetch failed |
| qdrant | LIVE_PASS | http://127.0.0.1:6333 |
| turbovec_grpc | LIVE_PASS | 127.0.0.1:50062 |
| turbovec_jsonrpc_8792 | FALLBACK_PASS | Legacy fallback only; canonical path is TurboVec gRPC 50062 and HTTP ANN sidecar 8791. |
