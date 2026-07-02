# Parent Atlas Service Probes

Generated: 2026-07-02T03:54:00.905Z
Status: PASS_WITH_WARNINGS

## Summary

- LIVE_PASS: 10
- FALLBACK_PASS: 0
- FAIL: 0
- critical failures: 0
- legacy warnings: 1

## Probes

| service | transport | url | status | fallback | ms | error |
|---|---:|---|---:|---:|---:|---|
| gemma4-llama-server | http | http://127.0.0.1:8090 | LIVE_PASS | false | 95 |  |
| langextract | http | http://127.0.0.1:8095 | LIVE_PASS | false | 711 |  |
| turbovec-grpc | grpc | 127.0.0.1:50062 | LIVE_PASS | false | 2 |  |
| go-retrieval | http | http://127.0.0.1:8100 | LIVE_PASS | false | 19 |  |
| embeddinggemma | http | http://127.0.0.1:11434 | LIVE_PASS | false | 9 |  |
| qdrant | http | http://127.0.0.1:6333 | LIVE_PASS | false | 43 |  |
| postgres | postgres | postgresql://legal_admin:***@127.0.0.1:5434/legal_ai_db | LIVE_PASS | false | 30 |  |
| seaweedfs | http | http://127.0.0.1:8333 | LIVE_PASS | false | 8 |  |
| neo4j | http | http://127.0.0.1:7474 | LIVE_PASS | false | 682 |  |
| redis-valkey | redis | redis://127.0.0.1:6379 | LIVE_PASS | false | 340 |  |

## Legacy Warnings

- turbovec-jsonrpc-8792: Legacy TurboVec JSON-RPC wrapper is not live; canonical accelerator proof uses TurboVec gRPC on 50062 and HTTP ANN sidecar on 8791.
