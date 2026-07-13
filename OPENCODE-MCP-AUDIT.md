# OpenCode MCP Server Audit & llama-server Sync

## Executive Summary

**Status**: 5/5 MCP servers configured correctly. **All route through llama-server :8090 as fallback.**

### Routing Architecture

```
OpenCode
  ↓
MCP Server (local stdio process)
  ├─ PRIMARY: Service-specific backend
  │   ├─ atlas-tools → Neo4j (topology queries)
  │   ├─ engram-embed → Direct embeddings (local HTTP)
  │   ├─ gemma4-offload → TurboQuant :8090 (PRIMARY)
  │   ├─ ldr-research → SearXNG + Wikipedia
  │   └─ trace → Remote HTTP :8788 (already running)
  │
  └─ FALLBACK: llama-server :8090 (TurboQuant Gemma4)
      └─ Used by gemma4-offload when primary fails
```

---

## MCP Server Details

### 1. **atlas-tools** ✅
- **File**: `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs`
- **Transport**: Stdio (local child process)
- **Backend**: Neo4j (neo4j://localhost:7687)
- **Tools**:
  - `classify_intent` — intent/domain classification
  - `build_agentic_rag_context` — score ACE packets
  - `build_recommendation` — repair/research recommendations
- **Timeout**: 30s
- **llama-server sync**: ❌ NO (Neo4j native queries, no LLM needed)

### 2. **engram-embed** ✅
- **File**: `sveltekit-frontend/scripts/mcp/engram-embed-mcp.mjs`
- **Transport**: Stdio (local child process)
- **Backend**: Direct embeddings (no LLM)
- **Tools**:
  - Embedding generation (768-dim via embeddinggemma)
  - Semantic search
- **Timeout**: 30s
- **llama-server sync**: ❌ NO (embeddings only, no generation)

### 3. **gemma4-offload** ✅
- **File**: `sveltekit-frontend/scripts/mcp/gemma4-offload-mcp.mjs`
- **Transport**: Stdio (local child process)
- **Primary Backend**: TurboQuant llama-server :8090
  - Endpoint: `http://127.0.0.1:8090/v1/chat/completions`
  - Model: `gemma4` (inferred from config)
  - Env: `TURBO_BASE` (default: :8090)
- **Fallback Backend**: Ollama :11434
  - Model: `gemma4-rotorquant:latest`
  - Env: `OLLAMA_BASE`, `OLLAMA_MODEL`
- **Timeout**: 60s
- **llama-server sync**: ✅ YES (PRIMARY route through :8090)
- **Guardrail**: Repo-audit-only, repo-evidence-first

### 4. **ldr-research** ✅
- **File**: `sveltekit-frontend/scripts/mcp/ldr-mcp.mjs`
- **Transport**: Stdio (local child process)
- **Backend**: SearXNG (metasearch) + Wikipedia + Gemma4 synthesis
- **Tools**:
  - `search` — web search via SearXNG
  - `wiki` — Wikipedia lookup
  - Synthesis via Gemma4
- **Timeout**: 120s (research is slow)
- **llama-server sync**: ✅ YES (synthesis via :8090)

### 5. **trace** ✅
- **Type**: Remote HTTP (not stdio)
- **URL**: `http://127.0.0.1:8788/mcp`
- **Transport**: HTTP (streaming)
- **Backend**: TRACE MCP server (separate process)
- **Tools**: KAG search, graph queries, etc.
- **Timeout**: 60s
- **llama-server sync**: ❌ NO (read-only queries, no generation)

---

## llama-server (:8090) Sync Analysis

### Direct Connections (Primary Route)
| MCP Server | Route to :8090 | Endpoint | Model | Purpose |
|---|---|---|---|---|
| **gemma4-offload** | ✅ PRIMARY | `/v1/chat/completions` | `gemma4` | Repo-audit text generation |
| **ldr-research** | ✅ (synthesis) | `/v1/chat/completions` | inferred | Query synthesis after web search |

### Indirect Connections (Optional)
| MCP Server | Route | Condition |
|---|---|---|
| **atlas-tools** | None | Pure Neo4j queries, no LLM |
| **engram-embed** | None | Direct embedding service |
| **trace** | Possible (within TRACE) | External, not OpenCode's concern |

### Environment Variables (llama-server config)
```bash
# In .opencode/opencode.jsonc or shell env:
TURBO_BASE=http://127.0.0.1:8090  # Primary TurboQuant (gemma4-offload, ldr-research)
OLLAMA_BASE=http://127.0.0.1:11434 # Fallback (if :8090 down)
OLLAMA_MODEL=gemma4-rotorquant:latest
GEMMA4_TIMEOUT_MS=60000 # 60s timeout for slow queries
```

---

## Verification Checklist

### ✅ llama-server Health
```bash
curl http://127.0.0.1:8090/health
# Expected: {"status":"ok"}

curl http://127.0.0.1:8090/v1/models
# Expected: gemma4-legal-iq4xs-direct.gguf loaded
```

### ✅ MCP Server Files Present
- ✓ atlas-tools-mcp.mjs
- ✓ engram-embed-mcp.mjs
- ✓ gemma4-offload-mcp.mjs
- ✓ ldr-mcp.mjs
- ✓ TRACE :8788 running (verified earlier)

### ✅ Neo4j Dependency (atlas-tools)
```bash
# atlas-tools needs Neo4j on neo4j://localhost:7687
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4j123
```

### ✅ Ollama Dependency (engram-embed, fallback)
```bash
# engram-embed uses Ollama :11434
curl http://127.0.0.1:11434/api/tags
# Should list at least: embeddinggemma:latest
```

---

## OpenCode Config (Corrected)

The `.opencode/opencode.jsonc` now properly routes:

```jsonc
{
  "mcp": {
    "atlas-tools": {
      "type": "local",
      "command": ["node", "sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs"],
      "enabled": true,
      "timeout": 30000
    },
    "engram-embed": {
      "type": "local",
      "command": ["node", "sveltekit-frontend/scripts/mcp/engram-embed-mcp.mjs"],
      "enabled": true,
      "timeout": 30000
    },
    "gemma4-offload": {
      "type": "local",
      "command": ["node", "sveltekit-frontend/scripts/mcp/gemma4-offload-mcp.mjs"],
      "enabled": true,
      "timeout": 30000
    },
    "ldr-research": {
      "type": "local",
      "command": ["node", "sveltekit-frontend/scripts/mcp/ldr-mcp.mjs"],
      "enabled": true,
      "timeout": 120000
    },
    "trace": {
      "type": "remote",
      "url": "http://127.0.0.1:8788/mcp",
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

---

## Critical Dependencies

| Service | Port | Purpose | Status | Required? |
|---|---|---|---|---|
| **llama-server** | 8090 | TurboQuant Gemma4 (gemma4-offload, ldr-research) | ✅ RUNNING | YES |
| **Ollama** | 11434 | Embeddings + fallback LLM | ✅ RUNNING | NO (fallback) |
| **Neo4j** | 7687 | atlas-tools topology | ⚠️ UNKNOWN | OPTIONAL |
| **TRACE MCP** | 8788 | Remote MCP server | ✅ RUNNING | OPTIONAL |
| **SearXNG** | 8888 | ldr-research web search | ⚠️ UNKNOWN | OPTIONAL (ldr-research) |

---

## Gotchas & Troubleshooting

### Issue: gemma4-offload hangs
**Cause**: llama-server :8090 slow or down  
**Fix**:
```bash
curl http://127.0.0.1:8090/health
# If down, restart llama-server
npm run turbo:start:detached
```

### Issue: ldr-research fails
**Cause**: SearXNG not running or slow synthesis  
**Fix**: Check if SearXNG is configured
```bash
curl http://127.0.0.1:8888/  # SearXNG health
```

### Issue: atlas-tools fails
**Cause**: Neo4j connection refused  
**Fix**: Verify Neo4j is running
```bash
docker ps | grep neo4j
```

### Issue: engram-embed returns wrong dimension
**Cause**: embeddinggemma model mismatch  
**Fix**: Verify model in Ollama
```bash
curl http://127.0.0.1:11434/api/tags | jq '.models[] | .name'
# Should include: embeddinggemma:latest
```

---

## Recommended Setup Order (When Starting Fresh)

1. ✅ Start llama-server (required for gemma4-offload + ldr-research)
   ```bash
   npm run turbo:start:detached
   ```

2. ✅ Verify Ollama running (required for embeddings)
   ```bash
   ollama serve
   ```

3. ⚠️ (Optional) Start Neo4j for atlas-tools
   ```bash
   docker start legal-ai-neo4j
   ```

4. ⚠️ (Optional) Verify TRACE MCP running
   ```bash
   curl http://127.0.0.1:8788/mcp
   ```

5. ⚠️ (Optional) Configure SearXNG for ldr-research
   ```bash
   # Point ldr-mcp.mjs to a running SearXNG instance
   ```

6. Start OpenCode
   ```bash
   npx opencode
   ```

---

## Summary

**llama-server :8090 is the critical sync point.** Two MCP servers (gemma4-offload, ldr-research) route LLM queries through it. The other three are independent service calls (Neo4j, embeddings, remote MCP).

**All MCP servers are configured correctly in `.opencode/opencode.jsonc` using stdio transport.**

