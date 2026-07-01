# Parent Atlas Service Probes

Generated: 2026-07-01T21:55:55.253Z
Status: PASS_WITH_WARNINGS

## Summary

- LIVE_PASS: 10
- FALLBACK_PASS: 0
- FAIL: 0
- critical failures: 0
- legacy warnings: 2

## Probes

| service | transport | url | status | fallback | ms | error |
|---|---:|---|---:|---:|---:|---|
| gemma4-llama-server | http | http://127.0.0.1:8090 | LIVE_PASS | false | 72 |  |
| langextract | http | http://127.0.0.1:8096 | LIVE_PASS | false | 601 |  |
| turbovec-grpc | grpc | 127.0.0.1:50062 | LIVE_PASS | false | 2 |  |
| go-retrieval | http | http://127.0.0.1:8100 | LIVE_PASS | false | 38 |  |
| embeddinggemma | http | http://127.0.0.1:11434 | LIVE_PASS | false | 13 |  |
| qdrant | http | http://127.0.0.1:6333 | LIVE_PASS | false | 16 |  |
| postgres | postgres | postgresql://legal_admin:***@127.0.0.1:5434/legal_ai_db | LIVE_PASS | false | 42 |  |
| seaweedfs | http | http://127.0.0.1:8333 | LIVE_PASS | false | 6 |  |
| neo4j | http | http://localhost:7474 | LIVE_PASS | false | 27 |  |
| redis-valkey | redis | redis://127.0.0.1:6379 | LIVE_PASS | false | 170 |  |

## Legacy Warnings

- langextract-stale-8095: Legacy LangExtract listener still advertises ollama_available; canonical Gemma4-backed LangExtract is 127.0.0.1:8096.
- turbovec-jsonrpc-8792: Legacy TurboVec JSON-RPC wrapper is not live; canonical accelerator proof uses TurboVec gRPC on 50062 and HTTP ANN sidecar on 8791.
