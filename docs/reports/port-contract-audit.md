# Port Contract Audit Report

**Generated**: 2026-08-27T01:30:48.793Z

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Services | 28 |
| Running Correctly | 25 |
| Issues Found | 1 |
| Issue Rate | 3.6% |

---

## Service Port Matrix

| Service | Host Port | Container Port | Expected Location | Status |
|---------|-----------|-----------------|-------------------|--------|
| postgres | 5434 | 5432 | Docker | ✅ PASS |
| rabbitmq | 5672 | 5672 | Docker | ❌ FAIL |
| valkey | 6379 | 6379 | Docker | ✅ PASS |
| qdrant_http | 6333 | 6333 | Docker | ✅ PASS |
| qdrant_grpc | 6334 | 6334 | Docker | ✅ PASS |
| neo4j_http | 7474 | 7474 | Docker | ✅ PASS |
| neo4j_bolt | 7687 | 7687 | Docker | ✅ PASS |
| ollama | 11434 | 11434 | host | ⚠️ NOT FOUND |
| llama_server | 8090 | 8090 | host | ⚠️ NOT FOUND |
| bifrost | 3040 | 8080 | Docker | ✅ PASS |
| searxng | 8889 | 8080 | Docker | ✅ PASS |
| langfuse_web | 3030 | 3000 | Native Host | ✅ PASS |
| langfuse_clickhouse_http | 8124 | 8123 | Native Host | ✅ PASS |
| langfuse_clickhouse_grpc | 9009 | 9000 | Native Host | ✅ PASS |
| go_retrieval_grpc | 50053 | 50053 | Docker | ✅ PASS |
| go_retrieval_http | 8100 | 8100 | Docker | ✅ PASS |
| go_embedding_grpc | 50051 | 50051 | Docker | ✅ PASS |
| go_embedding_http | 8097 | 8097 | Docker | ✅ PASS |
| go_search_grpc | 50055 | 50055 | Docker | ✅ PASS |
| go_search_http | 8096 | 8096 | Docker | ✅ PASS |
| seaweedfs_master | 9333 | 9333 | Docker | ✅ PASS |
| seaweedfs_volume | 8080 | 8080 | Docker | ✅ PASS |
| seaweedfs_filer | 8888 | 8888 | Docker | ✅ PASS |
| seaweedfs_s3 | 8333 | 8333 | Docker | ✅ PASS |
| couchdb | 5984 | 5984 | Docker | ✅ PASS |
| nats | 4222 | 4222 | Docker | ✅ PASS |
| docling_vlm | 8085 | 8085 | Docker | ✅ PASS |
| image_synthesis | 8092 | 8092 | Docker | ✅ PASS |

---

## Issues Found

### 1. RABBITMQ

**Expected**: 5672->5672

**Docker PS**: [{"host":5673,"container":5672,"protocol":"tcp","raw":"0.0.0.0:5673->5672/tcp"},{"host":5673,"container":5672,"protocol":"tcp","raw":"[::]:5673->5672/tcp"},{"host":15673,"container":15672,"protocol":"tcp","raw":"0.0.0.0:15673->15672/tcp"},{"host":15673,"container":15672,"protocol":"tcp","raw":"[::]:15673->15672/tcp"},{"host":15693,"container":15692,"protocol":"tcp","raw":"0.0.0.0:15693->15692/tcp"},{"host":15693,"container":15692,"protocol":"tcp","raw":"[::]:15693->15692/tcp"}]

**Issues**:
- Docker PS: Found service but port mismatch. Expected 5672->5672, got 0.0.0.0:5673->5672/tcp, [::]:5673->5672/tcp, 0.0.0.0:15673->15672/tcp, [::]:15673->15672/tcp, 0.0.0.0:15693->15692/tcp, [::]:15693->15692/tcp


---

## Recommendations

1. **HIGH**: 1 port mismatches detected
   
   Verify docker-compose.yml ports match .env configuration. Restart containers if port bindings have changed.

2. **INFO**: Run full code scan for hardcoded port references
   
   Execute: rg -n "6333|7474|11434|6379|5672|50053|8100|3040" . --glob "!node_modules/**"


---

## Configuration Sources

### .env Files Loaded
- .env: 212 variables
- .env.local: 18 variables
- sveltekit-frontend\.env: 64 variables
- sveltekit-frontend\.env.local: 33 variables

### docker-compose Files Parsed
- docker-compose.yml: 26 services
- docker-compose.dev.yml: 8 services
- docker-compose.production.yml: 10 services
- sveltekit-frontend\docker-compose.full.yml: 9 services
- sveltekit-frontend\docker-compose.dev.yml: 7 services

### Running Containers
- miniforge-nlp-sidecar: 2 port mappings
- legal-ai-go-retrieval: 4 port mappings
- legal-ai-qdrant: 4 port mappings
- legal-ai-postgres: 2 port mappings
- legal-ai-seaweed-volume: 2 port mappings
- legal-ai-seaweed-filer: 2 port mappings
- legal-ai-go-search: 4 port mappings
- legal-ai-bifrost: 2 port mappings
- legal-ai-go-embedding: 4 port mappings
- legal-ai-caddy: 4 port mappings
- legal-ai-rabbitmq: 6 port mappings
- legal-ai-valkey: 1 port mappings
- langfuse-server: 2 port mappings
- langfuse-worker: 0 port mappings
- legal-ai-searxng: 2 port mappings
- legal-ai-nats: 4 port mappings
- langfuse-clickhouse: 2 port mappings
- legal-ai-couchdb: 2 port mappings
- legal-ai-neo4j: 4 port mappings
- legal-ai-docling-vlm: 2 port mappings
- legal-ai-image-synthesis: 2 port mappings
- legal-ai-seaweed-s3: 2 port mappings
- legal-ai-seaweed-master: 2 port mappings
