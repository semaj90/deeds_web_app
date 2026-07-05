# Parent Atlas Service Probes

Generated: 2026-07-05T00:04:57.226Z
Status: PASS_WITH_WARNINGS

## Summary

- LIVE_PASS: 9
- FALLBACK_PASS: 1
- FAIL: 0
- critical failures: 0
- legacy warnings: 1

## Probes

| service | transport | url | status | fallback | ms | error |
|---|---:|---|---:|---:|---:|---|
| gemma4-llama-server | http | http://127.0.0.1:8090 | LIVE_PASS | false | 120 |  |
| langextract | http | http://127.0.0.1:8095 | FALLBACK_PASS | true | 10 | LangExtract unavailable; inline Gemma4 fallback available (fetch failed) |
| turbovec-grpc | grpc | 127.0.0.1:50062 | LIVE_PASS | false | 2 |  |
| go-retrieval | http | http://127.0.0.1:8100 | LIVE_PASS | false | 1890 |  |
| embeddinggemma | http | http://127.0.0.1:11434 | LIVE_PASS | false | 18 |  |
| qdrant | http | http://127.0.0.1:6333 | LIVE_PASS | false | 40 |  |
| postgres | postgres | postgresql://legal_admin:***@127.0.0.1:5434/legal_ai_db | LIVE_PASS | false | 51 |  |
| seaweedfs | http | http://127.0.0.1:8333 | LIVE_PASS | false | 18 |  |
| neo4j | http | http://127.0.0.1:7474 | LIVE_PASS | false | 14 |  |
| redis-valkey | redis | redis://127.0.0.1:6379 | LIVE_PASS | false | 335 |  |

## Legacy Warnings

- turbovec-jsonrpc-8792: Legacy TurboVec JSON-RPC wrapper is not live; canonical accelerator proof uses TurboVec gRPC on 50062 and HTTP ANN sidecar on 8791.
