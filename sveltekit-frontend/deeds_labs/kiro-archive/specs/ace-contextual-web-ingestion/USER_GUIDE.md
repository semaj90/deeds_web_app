# ACE Contextual Web Ingestion - User Guide

**Version:** 1.0
**Date:** December 21, 2025
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [How It Works](#how-it-works)
4. [Using the System](#using-the-system)
5. [Understanding Hybrid Scoring](#understanding-hybrid-scoring)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Configuration](#advanced-configuration)
8. [FAQ](#faq)

---

## Overview

The ACE Contextual Web Ingestion system automatically enriches your coding assistant with up-to-date web content. When you ask a question and the system doesn't have enough recent context, it automatically searches the web, ingests relevant pages, and uses that information to provide better answers.

### Key Features

- **Automatic Web Search**: Triggers when context is stale or insufficient
- **Smart Ingestion**: Crawls, cleans, chunks, and indexes web content
- **Hybrid Scoring**: Combines vector similarity, freshness, and knowledge graph
- **Multi-Provider Search**: DuckDuckGo, Brave Search, or mock for testing
- **Knowledge Graph**: Extracts entities and relationships from content
- **LLM Integration**: Works with Gemma3, Claude, and Gemini

### Architecture

```
User Question
     ↓
Context Retrieval (RAG + KAG)
     ↓
Quality Assessment
     ↓
[Insufficient/Stale?] → Web Search → Ingestion → Updated Context
     ↓
Prompt Assembly
     ↓
LLM Response
```

---

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+
- Python 3.10+
- PostgreSQL 17 with pgvector
- 8GB RAM minimum

### Installation

1. **Clone and setup**
   ```bash
   git clone <your-repo>
   cd <your-repo>
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .kiro/specs/ace-contextual-web-ingestion/deployment/.env.ace-web.example .env
   # Edit .env with your settings
   ```

3. **Deploy infrastructure**
   ```powershell
   # PowerShell
   .\.kiro\specs\ace-contextual-web-ingestion\deployment\deploy-ace-web.ps1

   # Or manually:
   docker-compose up -d postgres qdrant minio rabbitmq ollama
   npm run db:migrate
   ```

4. **Start the worker**
   ```bash
   cd backend/workers
   python ace_web_worker.py
   ```

5. **Start the frontend**
   ```bash
   npm run dev
   ```

6. **Verify installation**
   ```powershell
   .\.kiro\specs\ace-contextual-web-ingestion\deployment\verify-ace-web.ps1
   ```

---

## How It Works

### 1. Context Retrieval

When you ask a question, the system:
1. Converts your question to an embedding (384-dimensional vector)
2. Searches Qdrant for similar chunks
3. Applies hybrid scoring (vector + freshness + graph)
4. Returns top N relevant chunks

### 2. Quality Assessment

The system evaluates context quality:

- **Sufficient**: ≥3 relevant chunks (score >0.5), not stale
- **Stale**: All chunks >30 days old
- **Insufficient**: <3 relevant chunks

### 3. Automatic Web Search

If context is stale or insufficient:
1. Generates search query from your question
2. Searches web (DuckDuckGo/Brave)
3. Enqueues top URLs for ingestion
4. Waits for ingestion to complete
5. Retrieves updated context

### 4. Ingestion Pipeline

For each URL:
1. **Crawl**: Fetch HTML (respects robots.txt, rate limits)
2. **Clean**: Remove navigation, scripts, ads → clean markdown
3. **Chunk**: Split into 800-1200 token segments with 200 token overlap
4. **Embed**: Generate 384-dim vectors using embeddinggemma:latest
5. **Extract**: Identify entities (TECH, PERSON, ORG, CONCEPT) and relations
6. **Store**: Save to PostgreSQL, Qdrant, and MinIO

### 5. Prompt Assembly

The system builds a comprehensive prompt:
```
System Rules: <your system rules>
Project Rules: <your project rules>

Retrieved Context:
- Summary: Found 10 chunks from 3 domains
- Relevant Chunks:
  1. [Score: 0.85] <chunk text> (Source: https://..., Fetched: 2025-12-21)
  2. [Score: 0.78] <chunk text> (Source: https://..., Fetched: 2025-12-20)
  ...

Knowledge Graph:
- Entities: Svelte, TypeScript, Runes, Components
- Relations: Svelte uses TypeScript, Runes enable Components

User Request: <your question>
```

---

## Using the System

### Triggering Ingestion Manually

You can manually ingest URLs via the API:

```bash
curl -X POST http://localhost:5173/api/ace/web/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://svelte.dev/docs/introduction",
      "https://kit.svelte.dev/docs/routing"
    ],
    "tags": ["svelte", "documentation"],
    "priority": "high"
  }'
```

**Response:**
```json
{
  "success": true,
  "jobIds": ["uuid-1", "uuid-2"],
  "message": "Enqueued 2 jobs for processing"
}
```

### Querying Context

Query the context API directly:

```bash
curl "http://localhost:5173/api/ace/context?query=Svelte%205%20runes&limit=10"
```

**Response:**
```json
{
  "chunks": [
    {
      "id": "uuid",
      "text": "Svelte 5 introduces runes...",
      "score": 0.85,
      "metadata": {
        "url": "https://svelte.dev/docs/runes",
        "domain": "svelte.dev",
        "fetchedAt": "2025-12-21T10:00:00Z",
        "heading": "Introduction to Runes"
      }
    }
  ],
  "entities": ["Svelte", "Runes", "$state", "$derived"],
  "edges": [
    {"src": "Svelte", "rel": "introduces", "dst": "Runes", "weight": 0.9}
  ],
  "summary": "Found 10 relevant chunks from 2 domains.",
  "totalResults": 15
}
```

### Using with ACE Adapter

The ACE Adapter automatically uses web ingestion:

```typescript
import { AceAdapter } from '$lib/services/ace-web/ace-adapter';

const adapter = new AceAdapter({
  llmConfig: {
    provider: 'gemma3',
    temperature: 0.1,
    maxTokens: 2000
  }
});

const response = await adapter.processRequest({
  userRequest: 'How do I use Svelte 5 runes for reactive state?',
  errorContext: {
    message: "Cannot find name '$state'",
    filePath: 'src/lib/Counter.svelte',
    lineNumber: 5
  },
  systemRules: 'Use Svelte 5 syntax',
  projectRules: 'Follow TypeScript strict mode'
});

console.log(response.response); // LLM answer
console.log(response.metadata.contextQuality); // 'sufficient', 'stale', or 'insufficient'
console.log(response.metadata.webSearchTriggered); // true if web search was used
```

---

## Understanding Hybrid Scoring

The system uses a hybrid scoring formula to rank chunks:

```
score = 0.65 * cosine_similarity + 0.10 * freshness_boost + 0.05 * graph_boost
```

### Cosine Similarity (65% weight)

Vector similarity between query and chunk embeddings:
- 1.0 = perfect match
- 0.0 = no similarity

### Freshness Boost (10% weight)

Recency bonus based on fetch date:
- **<7 days**: +1.0 boost
- **7-30 days**: +0.5 boost
- **>30 days**: +0.0 boost

### Graph Boost (5% weight)

Knowledge graph relevance:
- **Entity match**: +0.5 boost (chunk contains query entities)
- **1-hop neighbor**: +0.25 boost (chunk entities connected to query entities)

### Example Calculation

Query: "Svelte 5 runes"
Chunk: "Svelte 5 introduces runes for reactive state..."

```
Cosine similarity: 0.82
Freshness: 5 days old → +1.0
Graph: Contains "Svelte" and "runes" entities → +0.5

Score = 0.65 * 0.82 + 0.10 * 1.0 + 0.05 * 0.5
      = 0.533 + 0.100 + 0.025
      = 0.658
```

This chunk would rank highly due to:
- Strong semantic match (0.82 cosine)
- Very recent content (5 days)
- Direct entity matches

---

## Troubleshooting

### Worker Not Processing Jobs

**Symptoms**: URLs enqueued but never processed

**Solutions**:
1. Check worker is running: `ps aux | grep ace_web_worker`
2. Check RabbitMQ queue: http://localhost:15672 (admin/admin)
3. Check worker logs: `tail -f worker.log`
4. Restart worker: `python backend/workers/ace_web_worker.py`

### Qdrant Connection Failed

**Symptoms**: "Failed to connect to Qdrant" errors

**Solutions**:
1. Check Qdrant is running: `docker ps | grep qdrant`
2. Check Qdrant health: `curl http://localhost:6333/health`
3. Restart Qdrant: `docker-compose restart qdrant`
4. Check collection: `curl http://localhost:6333/collections/ace_chunks`

### MinIO Access Denied

**Symptoms**: "Access denied" when storing files

**Solutions**:
1. Check MinIO is running: `docker ps | grep minio`
2. Check buckets exist: `mc ls local/`
3. Recreate buckets: `scripts/setup-ace-minio.sh`
4. Check credentials in `.env`

### Embeddings Taking Too Long

**Symptoms**: Ingestion very slow (>1 minute per URL)

**Solutions**:
1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. Check model is pulled: `ollama list | grep embeddinggemma`
3. Pull model if missing: `ollama pull embeddinggemma:latest`
4. Enable caching (Phase 8): Set `ACE_ENABLE_CACHING=true`

### Context Quality Always "Insufficient"

**Symptoms**: Web search triggers on every request

**Solutions**:
1. Check chunks are being created: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM ace_chunks;"`
2. Check embeddings exist: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM ace_chunks WHERE embedding IS NOT NULL;"`
3. Check Qdrant has points: `curl http://localhost:6333/collections/ace_chunks`
4. Lower threshold: Set `ACE_SUFFICIENT_CHUNKS=2` in `.env`

---

## Advanced Configuration

### Adjusting Hybrid Scoring Weights

Edit `.env`:
```bash
ACE_SCORE_COSINE_WEIGHT=0.70      # Increase vector similarity importance
ACE_SCORE_FRESHNESS_WEIGHT=0.20   # Increase recency importance
ACE_SCORE_GRAPH_WEIGHT=0.10       # Increase knowledge graph importance
```

### Changing Freshness Thresholds

```bash
ACE_FRESHNESS_RECENT_DAYS=14      # Extend "recent" period
ACE_FRESHNESS_MEDIUM_DAYS=60      # Extend "medium" period
```

### Tuning Chunking

```bash
ACE_CHUNK_MIN_TOKENS=600          # Smaller chunks (more granular)
ACE_CHUNK_MAX_TOKENS=1000
ACE_CHUNK_OVERLAP_TOKENS=150      # Less overlap (faster ingestion)
```

### Using Different LLM Providers

**Claude:**
```bash
ACE_LLM_PROVIDER=claude
ANTHROPIC_API_KEY=your-key-here
```

**Gemini:**
```bash
ACE_LLM_PROVIDER=gemini
GOOGLE_API_KEY=your-key-here
```

### Enabling Caching (Phase 8)

```bash
ACE_ENABLE_CACHING=true
REDIS_URL=redis://localhost:6379
ACE_CACHE_EMBEDDINGS_TTL=86400    # 24 hours
ACE_CACHE_QDRANT_TTL=300          # 5 minutes
```

---

## FAQ

### Q: How much does web ingestion cost?

**A:** Using DuckDuckGo (free) and local Ollama (free), there's no API cost. Only infrastructure costs (servers, storage). Brave Search requires an API key ($5/month for 2000 queries).

### Q: How long does ingestion take?

**A:** Typically 10-30 seconds per URL, depending on:
- Page size and complexity
- Embedding generation speed
- Network latency
- Rate limiting

### Q: Can I disable automatic web search?

**A:** Yes, set `ACE_AUTO_WEB_SEARCH=false` in `.env`. You can still manually trigger ingestion via the API.

### Q: How much storage does it use?

**A:** Approximately:
- 50-200 KB per page (raw HTML + markdown)
- 10-50 chunks per page
- 1.5 KB per chunk (text + embedding + metadata)
- Total: ~100-300 KB per page

For 1000 pages: ~100-300 MB

### Q: Does it respect robots.txt?

**A:** Yes, by default. Set `ACE_RESPECT_ROBOTS_TXT=false` to disable (not recommended).

### Q: Can I ingest private/authenticated pages?

**A:** Not currently. The worker only supports public URLs. For private content, manually upload documents to MinIO.

### Q: How do I update stale content?

**A:** Re-ingest the URL. The system computes a content hash and only re-processes if content changed.

### Q: Can I search by domain or date?

**A:** Yes, use filters:
```bash
curl "http://localhost:5173/api/ace/context?query=svelte&domain=svelte.dev&date_from=2025-12-01"
```

### Q: How do I monitor the system?

**A:** Use these dashboards:
- RabbitMQ: http://localhost:15672 (queue status)
- MinIO: http://localhost:9001 (storage usage)
- Qdrant: http://localhost:6333/dashboard (vector stats)

### Q: Can I use this for non-coding questions?

**A:** Yes! The system works for any domain. Just ingest relevant URLs and query the context API.

---

## Support

For issues, questions, or contributions:
- **Documentation**: `.kiro/specs/ace-contextual-web-ingestion/`
- **Manual Testing Guide**: `MANUAL_TESTING_GUIDE.md`
- **Deployment Scripts**: `deployment/`
- **Status**: `STATUS.md`

---

**Last Updated:** December 21, 2025
**Version:** 1.0
**Status:** Production Ready
