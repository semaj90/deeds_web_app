# Session 120: .env Helpers & Official Documentation Reference

**Date**: July 6, 2026  
**Purpose**: Quick lookup for environment variables, .env loading, and OpenCode/LangGraph/MCP/dispatcher infrastructure  
**Status**: Complete (cross-referenced with official docs)

---

## TL;DR: Three Files to Know

| File | Purpose | Key Content |
|------|---------|-------------|
| `sveltekit-frontend/.env.example` | Template for all env vars (150+ lines) | Redis, Postgres, Qdrant, Ollama, Gemma4, MCP, Bifrost, SeaweedFS |
| `sveltekit-frontend/src/lib/server/env.server.ts` | Runtime env loader (handles both SvelteKit + tsx scripts) | Fallback defaults (DEV), normalizeRedisUrl helper, Postgres proxy setup |
| `.opencode/opencode.jsonc` | OpenCode config (model, MCP, instructions) | Gemma4 @ :8090, TRACE MCP @ :8788 |

---

## Environment Variables by System

### Redis / Valkey (Cache Layer)

**Purpose**: L1 cache for telemetry stats, exact-match queries, centroids

**Env vars** (priority order):
```bash
REDIS_URL              # Full URL, e.g. redis://password@127.0.0.1:6379
# or component-based:
REDIS_HOST             # Defaults to 127.0.0.1
REDIS_PORT             # Defaults to 6379
REDIS_PASSWORD         # Required (docker container password = "redis")
REDIS_PASS             # Fallback name for REDIS_PASSWORD
VALKEY_PASSWORD        # Fallback name (Valkey 8.1.1 is drop-in for Redis)
VALKEY_PASS            # Another fallback
```

**Helper**: `normalizeRedisUrl()` in `env.server.ts` (lines 33-64)
- Accepts any format: bare hostname, `host:port`, full URL
- Injects password from env vars
- Defaults to `127.0.0.1:6379` if nothing provided
- Used by: `/api/telemetry/`, telemetry emitters, cache layers

**Dev default** (env.server.ts line 70):
```typescript
REDIS_URL: `redis://127.0.0.1:6379`
```

**Docker command to test**:
```bash
docker exec legal-ai-valkey redis-cli -a redis PING
# Expected: PONG
```

---

### Postgres (Canonical Truth)

**Env vars**:
```bash
DATABASE_URL              # Full connection string
# e.g. postgresql://legal_admin:pass@127.0.0.1:5434/legal_ai_db
```

**Important note** (env.server.ts lines 66-69):
- Windows has native Postgres on `:5432` (squatted)
- Docker container exposed on `:5434` (via `deeds-postgres-prod-proxy` socat)
- Always use `:5434` from Node/scripts
- `:5432` hits the wrong database

**Dev default**:
```typescript
DATABASE_URL: `postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db`
```

**Test connection**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets;"
```

---

### Qdrant (Vector Search Mirror)

**Env vars**:
```bash
QDRANT_URL              # Full URL (computed from host/port if not set)
QDRANT_HOST             # Default: 127.0.0.1
QDRANT_PORT             # Default: 6333
```

**Dev default**:
```typescript
QDRANT_URL: `http://127.0.0.1:6333`
```

**Test**:
```bash
curl -s http://127.0.0.1:6333/collections | jq '.result | length'
# Expected: 40+ collections
```

---

### Ollama (Embeddings Only)

**Env vars**:
```bash
OLLAMA_URL              # Default: http://127.0.0.1:11434
EMBEDDING_MODEL         # Default: embeddinggemma:latest
```

**Dev default**:
```typescript
OLLAMA_URL: `http://127.0.0.1:11434`
```

**Important**: Ollama is **embeddings-only** in this workspace. Chat/generation is served by `llama-server` (see below).

**Test**:
```bash
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' | jq '.embedding | length'
# Expected: 384 (dimension)
```

---

### llama-server @ :8090 (Chat/Generation - Gemma4)

**Env vars** (interact with these to control the server):
```bash
LLAMA_SERVER_PATH           # Path to llama-server.exe binary
TURBO_MODEL_PATH            # Path to GGUF file (fallback if ROTORQUANT_MODEL_PATH not set)
ROTORQUANT_MODEL_PATH       # Canonical GGUF path
TURBO_PROFILE               # KV cache profile: stock | turboquant | turboquant-safe
TURBO_CTX                   # Context window (default: 65536)
TURBO_KV_K                  # K-cache type (q8_0, turbo3, etc.)
TURBO_KV_V                  # V-cache type (q8_0, turbo3, turbo4, etc.)
```

**⚠️ CRITICAL**: Don't launch llama-server directly. Use the canonical launcher:

```powershell
# From repo root
.\scripts\launch-turboquant.ps1

# Or detached (background)
.\scripts\launch-turboquant.ps1 -Detached

# Or with custom profile
$env:TURBO_PROFILE = 'turboquant'
.\scripts\launch-turboquant.ps1
```

**Why**: The launcher reads `.env` and resolves context, KV cache, and model paths correctly. Direct exe invocation skips `.env` loading.

**Verify after restart**:
```powershell
# Check actual running context (should be 65536)
curl http://127.0.0.1:8090/slots | ConvertFrom-Json | Select-Object n_ctx
```

**Test**:
```bash
curl -s http://127.0.0.1:8090/v1/models | jq '.data[0] | {id, context_length: .context_length}'
# Expected: id = "gemma4-legal-iq4xs-direct.gguf"
```

---

### SeaweedFS S3 (Object Store - canonical, replaces MinIO)

**Env vars**:
```bash
SEAWEED_ENDPOINT            # Default: localhost
SEAWEED_S3_PORT             # Default: 8333 (S3 API gateway)
SEAWEED_ACCESS_KEY          # Default: minio (compatible with old MinIO keys)
SEAWEED_SECRET_KEY          # Default: minio123
SEAWEED_MASTER_PORT         # Default: 9333 (metadata master)
SEAWEED_FILER_PORT          # Default: 8382 (POSIX file API)
```

**Dev defaults**:
```typescript
MINIO_ENDPOINT: "localhost",
MINIO_PORT: 9000,           // ← This is wrong in older dev configs
MINIO_ACCESS_KEY: "minio",
MINIO_SECRET_KEY: "minio123",
```

**⚠️ Note**: Old code references `MINIO_PORT: 9000`. SeaweedFS S3 gateway is at `:8333`, not `:9000`. Use `SEAWEED_S3_PORT` instead.

**Test**:
```bash
curl -s http://127.0.0.1:9333/cluster/status | jq '.status'
# Expected: "ok"
```

---

### RabbitMQ (Message Broker)

**Env vars**:
```bash
RABBITMQ_URL                # Full URL
RABBITMQ_USER               # Default: guest
RABBITMQ_PASSWORD           # Default: guest
```

**Dev defaults**:
```typescript
RABBITMQ_URL: `amqp://guest:guest@127.0.0.1:5672`
```

**Test**:
```bash
curl -s -u guest:guest http://127.0.0.1:15672/api/overview | jq '.queue_totals | {messages, messages_ready}'
# Expected: non-zero queue stats
```

---

### Bifrost (Go AI Gateway - Semantic Cache)

**Env vars**:
```bash
BIFROST_ENABLED             # true/false (default: true)
BIFROST_URL                 # Default: http://127.0.0.1:3040
```

**Dev default**:
```typescript
// Not explicitly in DEV object, but used when called
BIFROST_URL: `http://127.0.0.1:3040`
```

**Purpose**: 50× faster, semantic cache backend for Ollama embeddings and chat.

**Test**:
```bash
curl -s http://127.0.0.1:3040/health | jq '.ok'
# Expected: true
```

---

### MCP (Model Context Protocol @ :8788)

**Env vars** (in `.opencode/opencode.jsonc`, not `.env`):
```jsonc
"mcp": {
  "trace": {
    "type": "remote",
    "url": "http://127.0.0.1:8788/mcp",
    "enabled": true,
    "headers": { "Accept": "application/json, text/event-stream" }
  }
}
```

**Purpose**: TRACE MCP server (localhost streaming, stateless, 42+ tools registered)

**Test**:
```bash
curl -s http://127.0.0.1:8788/tools/list | jq '.tools | length'
# Expected: 42+
```

---

## OpenCode Config (`.opencode/opencode.jsonc`)

**Current config** (Session 120 fixed):
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "llama.cpp": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "llama-server (local)",
      "options": {
        "baseURL": "http://127.0.0.1:8090/v1"
      },
      "models": {
        "gemma4-legal-iq4xs-direct.gguf": {
          "name": "Gemma4 Legal IQ4_XS",
          "limit": {
            "context": 65536,
            "output": 4096
          }
        }
      }
    }
  },
  "model": "llama.cpp/gemma4-legal-iq4xs-direct.gguf",
  "instructions": [
    ".opencode/system.md",
    "AGENTS.md"
  ],
  "mcp": {
    "trace": {
      "type": "remote",
      "url": "http://127.0.0.1:8788/mcp",
      "enabled": true,
      "headers": {
        "Accept": "application/json, text/event-stream"
      }
    }
  }
}
```

**Key decisions**:
- **Single provider**: Gemma4 @ :8090 (local, no API cost, context warm)
- **No fallback**: OpenCode tool execution routes via LangGraph dispatcher, not Gemma4 tool-calls
- **MCP**: TRACE @ :8788 (stateless, streaming, 42+ tools)
- **Instructions**: System prompt + AGENTS.md (both clean, no card contamination)

---

## Official Documentation Files

| File | Topic | Key Takeaway |
|------|-------|--------------|
| `docs/ai-os/opencode-context-window.md` | Context window caps | Two layers: server `-c` flag + client `limit.context`; both must match |
| `docs/ai-os/opencode-skill-routing.md` | Auto-skill hints | Keywords → skill mapping (trace-mcp-tooling, error-inference-research, ace-recovery) |
| `docs/architecture/retrieval-boundary-and-langgraph.md` | LangGraph rules | Read-only planning, no direct mutations; all writes go through promotion queue |
| `docs/SESSION-120-OPENCODE-DISPATCHER-STRATEGY.md` | Dual-model workflow | Gemma4 planner + LangGraph dispatcher + telemetry proof (Phases 1-3) |

---

## Helper Functions in `env.server.ts`

### `normalizeRedisUrl(rawValue?: string): string` (lines 33-64)

**Purpose**: Accept any Redis URL format and auto-inject password from env vars

**Inputs**:
- `"127.0.0.1:6379"` → Returns `redis://127.0.0.1:6379` (or with auth if password set)
- `"redis://127.0.0.1:6379"` → Injected password, returns full URL
- `"localhost"` → Returns `redis://localhost:6379` (with auth)
- Empty/undefined → Returns `redis://127.0.0.1:6379` (fallback)

**Used by**: Redis client initialization in all server-side code

**Example**:
```typescript
const redis = new Redis(normalizeRedisUrl(process.env.REDIS_URL));
```

### `qdrantUrlFromParts(): string | undefined` (lines 91-96)

**Purpose**: Build Qdrant URL from `QDRANT_HOST` + `QDRANT_PORT` env vars

**Example**:
```typescript
const qdrantUrl = qdrantUrlFromParts() ?? 'http://127.0.0.1:6333';
```

### `goRetrievalHttpUrl(): string` (lines 98-99)

**Purpose**: Resolve Go Retrieval HTTP endpoint (primary + fallback + default)

**Resolution order**:
1. `GO_RETRIEVAL_HTTP_URL` (explicit)
2. `RETRIEVAL_HTTP_URL` (fallback name)
3. `http://127.0.0.1:8100` (hardcoded default)

---

## Env Loading Order

**File: `env.server.ts` (lines 9-24)**

```
1. Read .env (project root)
2. Read .env.local (project root, overrides .env)
3. CLI inline env (highest priority)
```

**Important**: `.env.local` is **gitignored** (never committed). Use it for local secrets.

**Example** (set a local override):
```bash
# In sveltekit-frontend/.env.local
REDIS_HOST=192.168.1.100
TURBO_PROFILE=turboquant
```

---

## Dev Defaults (When Env Vars Are Empty)

**File: `env.server.ts` (lines 65-89)**

```typescript
const DEV = {
  DATABASE_URL: `postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db`,
  REDIS_URL: `redis://127.0.0.1:6379`,
  QDRANT_URL: `http://127.0.0.1:6333`,
  RABBITMQ_URL: `amqp://guest:guest@127.0.0.1:5672`,
  OLLAMA_URL: `http://127.0.0.1:11434`,
  PUBLIC_API_URL: `http://127.0.0.1:5173`,
  MINIO_ENDPOINT: "127.0.0.1",
  MINIO_PORT: "9000",
  MINIO_ACCESS_KEY: "minio",
  MINIO_SECRET_KEY: "minio123",
  JWT_SECRET: "dev-only-jwt-secret-change-in-production",
  SERVICE_AUTH_TOKEN: "dev-only-service-token",
};
```

**⚠️ These are used when env vars are explicitly empty.** If you don't set an env var, the DEV default is used.

---

## OpenCode .env Requirements

OpenCode does NOT read `.env` files directly. Configuration is in `.opencode/opencode.jsonc` only.

**Exception**: If OpenCode needs to invoke MCP tools that read env vars (like `rg` searching or `git` commands), those tools run in the Node.js context where `process.env` **is** populated from `.env`.

**Example**:
```json
{
  "mcp": {
    "trace": {
      "url": "http://127.0.0.1:8788/mcp"
      // The TRACE MCP server reads NODE_ENV, REDIS_URL, etc. from process.env
      // Those are populated from .env by env.server.ts
    }
  }
}
```

---

## Quick Validation Checklist

Run this before Session 120 Phase 1 (OpenCode dispatcher):

```bash
# 1. Postgres canonical truth
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) FROM atlas_packets;" | grep -E '[0-9]+'

# 2. Redis cache
docker exec legal-ai-valkey redis-cli -a redis KEYS "telemetry:*" | wc -l

# 3. Qdrant vector store
curl -s http://127.0.0.1:6333/collections | jq '.result | length'

# 4. Ollama embeddings
curl -s http://127.0.0.1:11434/api/tags | jq '.models[] | .name'

# 5. llama-server chat (Gemma4)
curl -s http://127.0.0.1:8090/v1/models | jq '.data[0].id'

# 6. RabbitMQ message queue
curl -s -u guest:guest http://127.0.0.1:15672/api/overview | jq '.queue_totals'

# 7. TRACE MCP tools
curl -s http://127.0.0.1:8788/tools/list | jq '.tools | length'

# 8. Dev server
curl -s http://localhost:5173/api/health | jq '.status'
```

**Expected results**:
- Postgres: `58,365` packets
- Redis: `0` (empty for now; Phase 2 fills it)
- Qdrant: `40+` collections
- Ollama: `embeddinggemma:latest`
- llama-server: `gemma4-legal-iq4xs-direct.gguf`
- RabbitMQ: `{ messages: X, messages_ready: Y }`
- MCP: `42+` tools
- Dev server: `{ status: "UP" }`

---

## References

**Official docs** (cross-referenced):
- `docs/ai-os/opencode-context-window.md` — Context window configuration
- `docs/ai-os/opencode-skill-routing.md` — Skill routing keywords
- `docs/architecture/retrieval-boundary-and-langgraph.md` — LangGraph mutation rules
- `docs/SESSION-120-OPENCODE-DISPATCHER-STRATEGY.md` — Dual-model workflow

**Env file references**:
- `sveltekit-frontend/.env.example` — Full template (150+ lines)
- `sveltekit-frontend/.env.local` — Local secrets (gitignored)
- `sveltekit-frontend/src/lib/server/env.server.ts` — Runtime loader

**Config files**:
- `.opencode/opencode.jsonc` — OpenCode provider + MCP + instructions
- `.opencode/system.md` — OpenCode system prompt
- `AGENTS.md` — Repository code patterns (referenced by OpenCode)

---

**Ready for Phase 1**: OpenCode dispatcher bridge (`POST /api/opencode-dispatch`)
