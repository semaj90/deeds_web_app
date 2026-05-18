# Phase 76 Level 2: Production-Grade Agentic System

## Overview

Phase 76 Level 2 transforms your system from a "Smart Prototype" to a **Production-Grade Agentic System** with persistent, structured memory. It integrates your existing Docker containers (Postgres, SeaweedFS S3, Redis) into a unified Node.js agent with:

- **Deep Storage**: SeaweedFS S3 for full document text
- **Structured Memory**: Postgres with pgvector for error patterns and document references
- **Semantic Cache**: Redis for fast repeated queries
- **Agentic Detection**: Automatic detection of legacy code patterns (Svelte 4 → Svelte 5)
- **Contextual Engineering**: Learning from past fixes to prevent repeated errors

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Phase 76 Level 2                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Node.js Agent (ACE)                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │ │
│  │  │   Agentic    │  │  Knowledge   │  │   Prompt     │  │ │
│  │  │  Detection   │  │   Builder    │  │  Engineer    │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│         │                   │                   │            │
│         ▼                   ▼                   ▼            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Unified Storage Layer                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │ │
│  │  │ SeaweedFS │  │ Postgres │  │  Redis   │              │ │
│  │  │  (Deep)  │  │ (Vector) │  │ (Cache)  │              │ │
│  │  └──────────┘  └──────────┘  └──────────┘              │ │
│  └────────────────────────────────────────────────────────┘ │
│         │                   │                   │            │
│         ▼                   ▼                   ▼            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Ollama (LLM + Embeddings)                  │ │
│  │  ┌──────────────────┐  ┌──────────────────┐            │ │
│  │  │ gemma3-legal     │  │ embeddinggemma   │            │ │
│  │  │ (Synthesis)      │  │ (768-dim)        │            │ │
│  │  └──────────────────┘  └──────────────────┘            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Database Migration

First, set up the Postgres schema with pgvector extension:

```bash
# From Windows PowerShell (if using WSL Postgres container)
npm run phase76:setup

# Or directly with psql
psql $DATABASE_URL -f scripts/setup-pgvector.sql
```

This creates:
- `error_patterns` table - Stores error signatures with embeddings
- `doc_references` table - Links URLs to SeaweedFS S3 keys with embeddings
- HNSW indexes for fast vector similarity search

### 2. Verify Docker Containers

Ensure your containers are running:

```bash
docker ps | grep -E "(postgres|minio|redis)"
```

Expected output:
```
postgres-vector    postgres:17-alpine    5432->5432
minio              minio/minio           9000->9000
redis              redis:alpine          6379->6379
```

### 3. Environment Variables

Create or update `.env` with:

```env
# Postgres
DATABASE_URL=postgresql://postgres:password@localhost:5432/phase76

# SeaweedFS S3 (MinIO-compatible env vars)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Qdrant
QDRANT_URL=http://localhost:6333

# Ollama
OLLAMA_URL=http://localhost:11434
```

## Usage

### Knowledge Builder: Crawl Documentation

Index documentation into the knowledge base:

```bash
# Crawl Svelte 5 migration guide
npm run phase76:kb:crawl "https://svelte.dev/docs/svelte/v5-migration-guide"

# Crawl multiple URLs
npm run phase76:kb:crawl \
  "https://svelte.dev/docs/svelte/v5-migration-guide" \
  "https://svelte.dev/docs/svelte/legacy-mode" \
  "https://kit.svelte.dev/docs/migrating-to-sveltekit-2"
```

**What it does:**
1. Fetches HTML content
2. Extracts text and generates summary (gemma3-legal)
3. Generates 768-dim embedding (embeddinggemma)
4. Stores in Qdrant (search layer)
5. Stores full text in SeaweedFS S3 (deep storage)
6. Stores reference + vector in Postgres (structured memory)

### ACE Prompt Engineer: Agentic Task Execution

Execute tasks with automatic context injection:

```bash
# Fix legacy Svelte 4 code
npm run phase76:ace --task="Fix the on:change event handler in my input component"

# Get help with Svelte 5 runes
npm run phase76:ace --task="Convert my export let props to Svelte 5 $props"
```

**What it does:**
1. **Agentic Detection**: Detects legacy patterns (on:event, export let)
2. **Semantic Search**: Finds relevant docs in Qdrant
3. **Deep Context**: Fetches full text from SeaweedFS S3
4. **Context Injection**: Builds enhanced prompt with docs + instructions
5. **LLM Synthesis**: Generates response with gemma3-legal
6. **Caching**: Caches results in Redis (1hr TTL)

## Example Workflow

### 1. Index Svelte 5 Documentation

```bash
npm run phase76:kb:crawl \
  "https://svelte.dev/docs/svelte/v5-migration-guide" \
  "https://svelte.dev/docs/svelte/runes" \
  "https://svelte.dev/docs/svelte/event-attributes"
```

Output:
```
🚀 Phase 76 Knowledge Builder
📊 Processing 3 URL(s)...

🔍 Processing: https://svelte.dev/docs/svelte/v5-migration-guide
   📥 Fetching content...
   🤖 Generating summary...
   🧠 Generating embedding...
   💾 Storing in Qdrant...
  💾 Storing in SeaweedFS S3 + Postgres...
   ✅ Ingested: https://svelte.dev/docs/svelte/v5-migration-guide

✅ Knowledge building complete!
📊 Indexed 3 documents
💾 Stored in: Qdrant + SeaweedFS S3 + Postgres
```

### 2. Execute Agentic Task

```bash
npm run phase76:ace --task="Fix the on:change event handler in my input component"
```

Output:
```
🚀 Phase 76 ACE Prompt Engineer
📝 Task: Fix the on:change event handler in my input component

🤔 [Agent] Analyzing task: "Fix the on:change event handler..."
🚨 [Agent] Detected Legacy Svelte 4 Syntax. Activating Migration Protocols...
🧠 [Agent] Generating query embedding...
🔍 [Agent] Searching knowledge base...
📦 [Agent] Hydrating deep context from SeaweedFS S3: svelte_dev_docs_svelte_v5_migration_guide.json
🤖 [Agent] Generating LLM response...

✅ LLM Response:

To fix the on:change event handler in Svelte 5, you need to use the new event
attribute syntax. Replace:

  <input on:change={handleChange} />

With:

  <input onchange={handleChange} />

Additionally, if you're using export let for props, convert to $props():

  // Old (Svelte 4)
  export let value;

  // New (Svelte 5)
  let { value } = $props();

✅ Task complete!
```

## Storage Layer Details

### SeaweedFS S3 (Deep Storage)

- **Bucket**: `phase76-summaries`
- **Key Format**: `{url_sanitized}.json`
- **Content**: Full document text + metadata
- **Purpose**: Store heavy text content separately from vectors

### Postgres (Structured Memory)

**Tables:**

1. `doc_references` - Document metadata with vectors
   ```sql
   id | url | minio_key | embedding (vector 768)
   ```

2. `error_patterns` - Error signatures with fixes
   ```sql
   id | signature | file_path | fix_summary | embedding (vector 768)
   ```

**Indexes:**
- HNSW indexes on embeddings for fast cosine similarity search
- B-tree indexes on signature and file_path for filtering

### Redis (Semantic Cache)

**Key Patterns:**
- `ace:prompt:{hash}` - Cached enhanced prompts (1hr TTL)
- `kb:search:{hash}` - Cached search results (1hr TTL)

## Agentic Detection Patterns

The system automatically detects legacy code patterns:

| Pattern | Detection | Action |
|---------|-----------|--------|
| `on:event=` | Svelte 4 event handler | Inject Svelte 5 migration docs |
| `export let` | Svelte 4 props | Inject $props() rune docs |
| `$:` | Svelte 4 reactive | Inject $derived() rune docs |

## Troubleshooting

### Postgres Connection Failed

```bash
# Check if container is running
docker ps | grep postgres

# Check connection
psql $DATABASE_URL -c "SELECT version();"
```

### SeaweedFS S3 Connection Failed

```bash
# Check if container is running
docker ps | grep minio

# Test connection
curl http://localhost:9000/minio/health/live
```

### Ollama Not Responding

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Pull required models
ollama pull gemma3-legal:latest
ollama pull embeddinggemma:latest
```

### Qdrant Collection Not Found

```bash
# Check collections
curl http://localhost:6333/collections | jq

# The knowledge builder will auto-create the collection
npm run phase76:kb:crawl "https://example.com"
```

## Next Steps

1. **Index More Documentation**: Crawl TypeScript, SvelteKit, and other relevant docs
2. **Error Pattern Learning**: Implement error pattern storage when fixes are applied
3. **Contextual Engineering**: Build proactive warning system for known error patterns
4. **HMM Route Inference**: Integrate with ts-morph AST analysis for route detection

## Files Created

- `scripts/setup-pgvector.sql` - Database schema migration
- `scripts/phase76-storage-layer.mjs` - Unified storage interface
- `scripts/phase76-knowledge-builder.mjs` - Documentation crawler
- `scripts/phase76-ace-prompt-engineer.mjs` - Agentic task executor
- `scripts/PHASE76_README.md` - This file

## Integration with Knowledge Search Engine

Phase 76 Level 2 integrates seamlessly with the Knowledge Search Engine (Phase 3):

- **KnowledgeSearcher** uses the same Qdrant collection
- **MinioKnowledgeStore** uses the same SeaweedFS-backed S3 bucket
- **RedisCacheService** uses the same Redis instance
- **PostgresKnowledgeStore** uses the same Postgres database

The Phase 76 scripts provide the **ingestion pipeline**, while the Knowledge Search Engine provides the **query interface**.
