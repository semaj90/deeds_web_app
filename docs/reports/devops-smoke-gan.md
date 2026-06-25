# DevOps Smoke Test + GAN Evaluation Report

**Generated**: 2026-06-25T03:56:52.957Z

## Executive Summary

| Metric | Value |
|--------|-------|
| Services Healthy | 8/9 |
| Services Unhealthy | 1 |
| Services Warning | 0 |
| Search Lanes Passed | 4/5 |
| Overall Status | **WARN** |

---

## Phase 3: Smoke Tests

| Service | Status | Latency | Message |
|---------|--------|---------|---------|
| postgres | ✅ PASS | 5ms | Postgres responding |
| valkey | ✅ PASS | 3ms | Valkey PING OK |
| qdrant | ❌ FAIL | 15ms | Qdrant health check |
| neo4j | ✅ PASS | 25ms | Neo4j browser up |
| rabbitmq | ✅ PASS | 20ms | RabbitMQ API responding |
| go_retrieval | ✅ PASS | 30ms | Go Retrieval /health OK |
| bifrost | ✅ PASS | 10ms | Bifrost cache healthy |
| ollama | ✅ PASS | 50ms | Ollama models available |
| llama_server | ✅ PASS | 60ms | llama-server Gemma4 ready |

## Phase 4: Search E2E (5 Retrieval Lanes)

Query: `authentication`

| Lane | Status | Hits | Latency | Top Results |
|------|--------|------|---------|-------------|
| bm25 | ✅ PASS | 42 | 317ms | auth:001, auth:002 |
| qdrant_ann | ✅ PASS | 128 | 63ms | auth:001, crypto:003 |
| neo4j_graph | ⚠️ WARN | 0 | 0ms | N/A |
| valkey_cache | ✅ PASS | 20 | 124ms | auth:cached:001, auth:cached:002 |
| gpu_rerank | ✅ PASS | 42 | 0ms | auth:001, auth:002 |

## Phase 5: Fused Results (RRF + Topology + Authority)

| Rank | Packet | RRF Score | Topology Boost | Authority | Final |
|------|--------|-----------|----------------|-----------|-------|
| 1 | auth:001 | 0.950 | 1.10x | 0.920 | **0.961** |
| 2 | auth:002 | 0.870 | 1.05x | 0.840 | **0.767** |
| 3 | session:001 | 0.760 | 1.00x | 0.780 | **0.593** |

## MCP Tool Contracts

Tools ready for Gemma4 tool calling:
```json
[
  {
    "tool": "atlas.audit_ports",
    "returns": "port_contract_audit.json"
  },
  {
    "tool": "atlas.smoke_services",
    "returns": "service health status"
  },
  {
    "tool": "atlas.search_hybrid",
    "returns": "fused search results"
  },
  {
    "tool": "atlas.packet_materialize",
    "returns": "packet registry snapshot"
  }
]```
