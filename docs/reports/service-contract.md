# Canonical Service Contract

**Generated**: 2026-06-25T03:56:46.740Z

## Executive Summary

| Metric | Count |
|--------|-------|
| Total Services | 17 |
| Healthy | 11 |
| Unhealthy | 4 |
| Unreachable | 0 |
| No Health Check | 2 |

---

## Service Directory


### ESSENTIAL

#### ❓ PostgreSQL 18.4

| Field | Value |
|-------|-------|
| Container | `legal-ai-postgres` |
| Image | `postgres:18.4-alpine` |
| Ports | 5434 (tcp) |
| Protocol | PostgreSQL TCP |
| Dependencies | none |
| Profile | `default` |
| Health | NO_HEALTH_CHECK (N/A) |

#### ❓ Valkey 8.1 (Redis-compatible)

| Field | Value |
|-------|-------|
| Container | `legal-ai-valkey` |
| Image | `valkey/valkey-bundle:8.1.1` |
| Ports | 6379 (tcp) |
| Protocol | Redis RESP |
| Dependencies | none |
| Profile | `default` |
| Health | NO_HEALTH_CHECK (N/A) |
| Note | Bound to 127.0.0.1 for security (internal only) |

#### ⚠️ Qdrant Vector Database

| Field | Value |
|-------|-------|
| Container | `legal-ai-qdrant` |
| Image | `qdrant/qdrant:latest` |
| Ports | 6333 (http), 6334 (grpc) |
| Protocol | HTTP + gRPC |
| Dependencies | none |
| Profile | `default` |
| Health | UNHEALTHY (404) |

#### ✅ Bifrost Semantic Cache

| Field | Value |
|-------|-------|
| Container | `legal-ai-bifrost` |
| Image | `bifrost:latest` |
| Ports | 3040 (http) |
| Protocol | HTTP (OpenAI-compatible) |
| Dependencies | qdrant, ollama |
| Profile | `default` |
| Health | HEALTHY (200) |


### GRAPH

#### ✅ Neo4j Graph Database

| Field | Value |
|-------|-------|
| Container | `legal-ai-neo4j` |
| Image | `neo4j:latest` |
| Ports | 7474 (http), 7687 (bolt) |
| Protocol | HTTP + Bolt |
| Dependencies | none |
| Profile | `default` |
| Health | HEALTHY (200) |


### MESSAGING

#### ⚠️ RabbitMQ Message Broker

| Field | Value |
|-------|-------|
| Container | `legal-ai-rabbitmq` |
| Image | `rabbitmq:3.13-management` |
| Ports | 5672 (amqp), 15672 (management) |
| Protocol | AMQP + HTTP (Management) |
| Dependencies | none |
| Profile | `default` |
| Health | UNHEALTHY (401) |


### RETRIEVAL

#### ✅ Go Retrieval Service (RAG+KAG+DAG)

| Field | Value |
|-------|-------|
| Container | `legal-ai-go-retrieval` |
| Image | `legal-ai-go-retrieval:latest` |
| Ports | 8100 (http), 50053 (grpc) |
| Protocol | HTTP + gRPC |
| Dependencies | qdrant, neo4j, valkey |
| Profile | `default` |
| Health | HEALTHY (200) |


### EMBEDDING

#### ✅ Go Embedding Service

| Field | Value |
|-------|-------|
| Container | `legal-ai-go-embedding` |
| Image | `legal-ai-go-embedding:latest` |
| Ports | 8097 (http), 50051 (grpc) |
| Protocol | HTTP + gRPC |
| Dependencies | ollama, valkey |
| Profile | `default` |
| Health | HEALTHY (200) |


### SEARCH

#### ✅ Go Search Service (Semantic Search)

| Field | Value |
|-------|-------|
| Container | `legal-ai-go-search` |
| Image | `legal-ai-go-search:latest` |
| Ports | 8096 (http), 50055 (grpc) |
| Protocol | HTTP + gRPC |
| Dependencies | qdrant |
| Profile | `default` |
| Health | HEALTHY (200) |


### OBSERVABILITY

#### ✅ Langfuse Web UI

| Field | Value |
|-------|-------|
| Container | `langfuse-server` |
| Image | `langfuse:latest` |
| Ports | 3030 (http) |
| Protocol | HTTP |
| Dependencies | langfuse-clickhouse |
| Profile | `default` |
| Health | HEALTHY (200) |

#### ✅ ClickHouse (Langfuse Analytics)

| Field | Value |
|-------|-------|
| Container | `langfuse-clickhouse` |
| Image | `clickhouse/clickhouse-server:latest` |
| Ports | 8124 (http), 9009 (grpc) |
| Protocol | HTTP + gRPC |
| Dependencies | none |
| Profile | `default` |
| Health | HEALTHY (200) |
| Note | Bound to 127.0.0.1 for security (internal only) |


### VISION

#### ✅ Docling VLM (Document OCR)

| Field | Value |
|-------|-------|
| Container | `legal-ai-docling-vlm` |
| Image | `legal-ai-docling-vlm:latest` |
| Ports | 8085 (http) |
| Protocol | HTTP |
| Dependencies | none |
| Profile | `default` |
| Health | HEALTHY (200) |


### GENERATION

#### ⚠️ ComfyUI Image Synthesis

| Field | Value |
|-------|-------|
| Container | `legal-ai-image-synthesis` |
| Image | `legal-ai-image-synthesis:latest` |
| Ports | 8092 (http) |
| Protocol | HTTP (ComfyUI) |
| Dependencies | none |
| Profile | `default` |
| Health | UNHEALTHY (404) |


### STORAGE

#### ✅ SeaweedFS Master (Metadata)

| Field | Value |
|-------|-------|
| Container | `legal-ai-seaweed-master` |
| Image | `chrislusf/seaweedfs:latest` |
| Ports | 9333 (http) |
| Protocol | HTTP |
| Dependencies | none |
| Profile | `default` |
| Health | HEALTHY (200) |

#### ⚠️ SeaweedFS S3 Gateway

| Field | Value |
|-------|-------|
| Container | `legal-ai-seaweed-s3` |
| Image | `chrislusf/seaweedfs:latest` |
| Ports | 8333 (http) |
| Protocol | HTTP (S3-compatible) |
| Dependencies | seaweedfs_master |
| Profile | `default` |
| Health | UNHEALTHY (403) |


### INFERENCE

#### ✅ Ollama Inference Server

| Field | Value |
|-------|-------|
| Container | `N/A (native)` |
| Image | `N/A` |
| Ports | 11434 (http) |
| Protocol | HTTP |
| Dependencies | CUDA GPU |
| Profile | `native` |
| Health | HEALTHY (200) |

#### ✅ llama-server (TurboQuant)

| Field | Value |
|-------|-------|
| Container | `N/A (native)` |
| Image | `N/A` |
| Ports | 8090 (http) |
| Protocol | HTTP (OpenAI-compatible) |
| Dependencies | CUDA GPU, Gemma4 model |
| Profile | `native` |
| Health | HEALTHY (200) |

