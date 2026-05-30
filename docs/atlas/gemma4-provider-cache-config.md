# Gemma4 Provider & Cache Configuration

This document outlines the operational configurations, provider endpoints, and caching strategies for running Gemma4 (TurboQuant / RotorQuant GGUF) via the OpenCode / Bifrost gateway infrastructure.

## MCP Gateway Architecture

Gemma4 does not directly run or call MCP tools. Instead, all context collection, codebase reads, and memory lookups are handled through a standardized tool gateway:

```
┌────────────────────────────────┐
│      OpenCode Client UI        │
└────────────────┬───────────────┘
                 │
                 ▼
┌────────────────────────────────┐
│   YorHA / Bifrost Gateway      │
│  (Orchestrates MCP Tool Calls)  │
└──────┬──────────────────┬──────┘
       │                  │
       ▼                  ▼
┌──────────────┐   ┌──────────────┐
│  MCP Tools   │   │  Gemma4 API  │
│  (Read-Only) │   │ (Inference)  │
└──────────────┘   └──────────────┘
```

### The Rule
All database, vector store, and graph queries (Postgres, Qdrant, Redis, Neo4j) must pass through a registered MCP tool. Inference pipelines are strictly decoupled from raw infrastructure access to ensure safety, consistency, and compliance with the **Trust Hierarchy**.

---

## OpenCode Provider Profiles

The active configuration mapping inside `opencode.json` defines these local endpoints:

### 1. TurboQuant Model (Port 8090)
* **Base URL**: `http://127.0.0.1:8090/v1`
* **API Key**: `local`
* **Model ID**: `gemma4-tq`
* **Context Limit**: 65,536 tokens
* **Output Limit**: 4,096 tokens

### 2. YorHA Facade (Port 5173)
* **Base URL**: `http://127.0.0.1:5173/api/v1`
* **API Key**: `local`
* **Model ID**: `yorha-legal`
* **Context Limit**: 65,536 tokens

---

## Caching Strategy (Redis BitFrost)

To minimize VRAM pressure and prevent redundant inference passes:
1. **L1 Semantic Cache**: Cached prompts are checked before inference. If prompt similarity is $\ge 0.90$, the cached completion is returned.
2. **L2 Variance Matching**: Maps semantic variants to a canonical prompt hash to increase cache hits.
3. **Hot Cache Expirations**: Enforces strict TTL limits:
   * `ace:packet:{runId}` (1 hour TTL)
   * `ace:cluster:{clusterId}` (24 hours TTL)
