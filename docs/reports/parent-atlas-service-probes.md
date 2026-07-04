# Parent Atlas Service Probes

Generated: 2026-07-04T09:48:56.080Z
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
| gemma4-llama-server | http | http://127.0.0.1:8090 | LIVE_PASS | false | 42 |  |
| langextract | http | http://127.0.0.1:8095 | FALLBACK_PASS | true | 5 | LangExtract unavailable; inline Gemma4 fallback available (fetch failed) |
| turbovec-grpc | grpc | 127.0.0.1:50062 | LIVE_PASS | false | 1 |  |
| go-retrieval | http | http://127.0.0.1:8100 | LIVE_PASS | false | 1860 |  |
| embeddinggemma | http | http://127.0.0.1:11434 | LIVE_PASS | false | 4 |  |
| qdrant | http | http://127.0.0.1:6333 | LIVE_PASS | false | 16 |  |
| postgres | postgres | postgresql://legal_admin:***@127.0.0.1:5434/legal_ai_db | LIVE_PASS | false | 20 |  |
| seaweedfs | http | http://127.0.0.1:8333 | LIVE_PASS | false | 6 |  |
| neo4j | http | http://127.0.0.1:7474 | LIVE_PASS | false | 11 |  |
| redis-valkey | redis | redis://127.0.0.1:6379 | LIVE_PASS | false | 131 |  |

## Legacy Warnings

- turbovec-jsonrpc-8792: Legacy TurboVec JSON-RPC wrapper is not live; canonical accelerator proof uses TurboVec gRPC on 50062 and HTTP ANN sidecar on 8791.
