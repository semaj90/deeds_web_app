# Knowledge Plane Service - Ready to Launch

## ✅ What's Complete

### 1. Docker Container Safeguards
- **`run.ps1`** now checks if containers exist before starting
- **NEVER rebuilds** - uses `docker start` to avoid data loss
- Auto-starts stopped containers (Postgres, Qdrant, Redis, Ollama)

### 2. Svelte 5 Documentation Search
- **Endpoint**: `POST /svelte/docs/search`
- **Sources**:
  - `data/svelte-docs/svelte.txt` (Svelte 5 runes, components, APIs)
  - `data/svelte-docs/sveltekit.txt` (SvelteKit 2 routing, load functions, actions)
  - `src/` codebase search (Svelte 5 patterns: `$state`, `$derived`, `$effect`, `$props`, `.svelte.ts`, `bits-ui`)

- **Features**:
  - Ripgrep-powered search (fast, regex-capable)
  - Categorizes results (rune:state, rune:derived, bits-ui:component, etc.)
  - Returns context lines + clean snippets for LLM consumption
  - Searches your actual codebase for Svelte 5/bits-ui usage examples

### 3. Build System
- Compiles from `cmd/server/main.go` (proper entry point)
- Auto-rebuilds if source newer than binary
- Binary: `bin/knowledge-plane.exe`

### 4. Configuration
- `.env` file with all service URLs
- Default port: **8099** (configurable via `KNOWLEDGE_PLANE_PORT`)
- Database identity verification on startup (prevents wrong-DB issues)

## 🚀 Quick Start

```powershell
cd go-services/knowledge-plane

# 1. Start dependencies (safe - won't rebuild)
./run.ps1

# 2. Test Svelte docs search
./test-svelte-docs.ps1
```

## 🧠 Agentic Use Case

Gemma3-legal:latest can now:

1. **Query Svelte 5 docs** before generating code:
```json
{
  "query": "$state rune reactive",
  "sources": ["svelte"],
  "max_results": 5
}
```

2. **Find SvelteKit 2 patterns**:
```json
{
  "query": "load function|+page.server",
  "sources": ["sveltekit"],
  "max_results": 10
}
```

3. **Search your codebase for examples**:
```json
{
  "query": "getOllamaEndpoint|$state|bits-ui",
  "sources": ["codebase"],
  "max_results": 20
}
```

4. **Get bits-ui component usage**:
```json
{
  "query": "Dialog|Button|Select",
  "sources": ["bits-ui", "codebase"],
  "max_results": 15
}
```

## 📊 All Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Verify dependencies (DB, Redis, Qdrant) |
| `POST /retrieve` | Hybrid RAG (pgvector + Qdrant + RRF) |
| `POST /expand` | KAG graph expansion |
| `POST /compose_prompt` | ACE prompt pack assembly |
| `POST /runs` | Log fix attempts to JSONL |
| `POST /svelte/docs/search` | 🆕 Svelte 5/SvelteKit 2/bits-ui docs + codebase search |

## 🔧 Dependencies

- **Postgres** (5434): error_embeddings table with pgvector
- **Qdrant** (6333): phase76_knowledge_base collection
- **Redis** (6379): Embedding + retrieval cache
- **Ollama** (11434): embeddinggemma:latest model

## 📝 Example Response

```json
{
  "results": [
    {
      "source": "svelte.txt",
      "line": 842,
      "match": "$state creates reactive state in Svelte 5",
      "context": "...\n$state creates reactive state...\nlet count = $state(0);\n...",
      "snippet": "$state creates reactive state in Svelte 5\nlet count = $state(0);",
      "category": "rune:state"
    }
  ],
  "query": "$state rune",
  "sources": ["svelte"],
  "timestamp": "2025-12-28T06:50:00Z",
  "meta": {
    "total_results": 1,
    "duration_ms": 42
  }
}
```

## 🎯 Next Steps

1. Run `./run.ps1` to start the service
2. Run `./test-svelte-docs.ps1` to verify Svelte docs search works
3. Integrate with autonomous agent (Phase 86/87)
4. Let Gemma3 agentic function tool calls update itself with Svelte 5 docs!

---

**Status**: ✅ Ready to launch
**Port**: 8099
**Svelte Docs**: Fully integrated
**Docker Safety**: Hardcoded safeguards in place
