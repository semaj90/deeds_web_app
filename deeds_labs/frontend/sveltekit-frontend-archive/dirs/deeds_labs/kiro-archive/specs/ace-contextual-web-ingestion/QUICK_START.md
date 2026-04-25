# ACE Contextual Web Ingestion - Quick Start Guide

## 📋 Overview

This spec implements a complete web ingestion and contextual retrieval system for ACE (Autonomous Coding Engine) with RAG+KAG hybrid retrieval.

**Pipeline:** web_search → crawl → extract → summarize → store → retrieve (RAG+KAG) → prompt assembly

---

## 📚 Documentation Structure

| Document | Purpose | Status |
|----------|---------|--------|
| **requirements.md** | 20 EARS-format requirements with acceptance criteria | ✅ Complete |
| **design.md** | Complete technical design with code examples | ✅ Complete |
| **tasks.md** | 24 implementation tasks across 8 phases (75 hours) | ✅ Complete |
| **STATUS.md** | Progress tracker for implementation | ✅ Ready |
| **QUICK_START.md** | This document | ✅ Complete |

---

## 🚀 Getting Started

### 1. Read the Requirements (15 minutes)

```bash
# Open requirements document
code .kiro/specs/ace-contextual-web-ingestion/requirements.md
```

**Key Concepts:**
- **RAG**: Vector similarity search for relevant context
- **KAG**: Knowledge graph with entities and relations
- **Hybrid Scoring**: 0.65*cosine + 0.10*freshness + 0.05*graph
- **Storage**: MinIO (objects) + Postgres (metadata) + Qdrant (vectors)

### 2. Review the Design (30 minutes)

```bash
# Open design document
code .kiro/specs/ace-contextual-web-ingestion/design.md
```

**Key Sections:**
- Architecture diagrams
- Database schemas (Drizzle ORM)
- API endpoints (SvelteKit routes)
- Worker implementation (Python + RabbitMQ)
- ACE adapter integration

### 3. Check the Implementation Plan (10 minutes)

```bash
# Open tasks document
code .kiro/specs/ace-contextual-web-ingestion/tasks.md
```

**8 Phases:**
1. Infrastructure Setup (6 hours)
2. Core Services (13 hours)
3. API Endpoints (7 hours)
4. Worker Implementation (17 hours)
5. ACE Integration (7 hours)
6. Testing (13 hours)
7. Documentation (6 hours)
8. Optimization (9 hours)

---

## 🏗️ Architecture at a Glance

### Storage Layer

```
MinIO Buckets:
├── ace-web-raw/          # Raw HTML, cleaned markdown
├── ace-web-derived/      # Summaries, chunks
└── ace-eval-logs/        # Error logs, rate limits

Postgres Tables:
├── ace_sources           # Discovered URLs
├── ace_docs              # Document metadata
├── ace_chunks            # Text chunks with embeddings
├── ace_entities          # Extracted entities (KAG)
└── ace_edges             # Entity relationships (KAG)

Qdrant Collection:
└── ace_chunks            # 384-dim vectors (fast ANN)
```

### Ingestion Flow

```
1. POST /api/ace/web/ingest
   ↓
2. RabbitMQ Queue (ace_web_ingest)
   ↓
3. Python Worker:
   - Crawl (fetch HTML)
   - Clean (HTML → markdown)
   - Chunk (800-1200 tokens)
   - Embed (nomic-embed-text 384d)
   - Store (MinIO + Postgres + Qdrant)
   - Summarize (Gemma3)
   - Extract (entities + relations)
```

### Retrieval Flow

```
1. GET /api/ace/context?query=...
   ↓
2. Generate query embedding
   ↓
3. Search Qdrant (top 40 candidates)
   ↓
4. Apply hybrid scoring:
   - Cosine similarity (0.65)
   - Freshness boost (0.10)
   - Graph boost (0.05)
   ↓
5. Return top 10 chunks + entities + edges
```

---

## 🔧 Key Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | SvelteKit + TypeScript | API endpoints |
| **Worker** | Python + RabbitMQ | Async ingestion |
| **Database** | PostgreSQL 17 + pgvector | Metadata + vectors |
| **Vector Store** | Qdrant | Fast ANN search |
| **Object Storage** | MinIO | Raw/derived content |
| **Embeddings** | Ollama (nomic-embed-text) | 384-dim vectors |
| **ORM** | Drizzle | Type-safe queries |
| **Queue** | RabbitMQ | Job processing |

---

## 📝 Implementation Checklist

### Phase 1: Infrastructure (Start Here!)

- [ ] Task 1.1: Create database schema (Drizzle + migration)
- [ ] Task 1.2: Setup MinIO buckets (3 buckets)
- [ ] Task 1.3: Setup Qdrant collection (384d Cosine)
- [ ] Task 1.4: Setup RabbitMQ queue (durable)

**Estimated Time:** 6 hours

### Phase 2: Core Services

- [ ] Task 2.1: Implement MinIO service
- [ ] Task 2.2: Implement Qdrant service
- [ ] Task 2.3: Implement ACE Context Service (hybrid scoring)

**Estimated Time:** 13 hours

### Phase 3-8: See tasks.md for full breakdown

---

## 🧪 Testing Strategy

### Unit Tests (>80% coverage target)

```typescript
// Example: ACE Context Service test
import { AceContextService } from '$lib/services/ace-web/ace-context-service';
import { setupTest, cleanupTest } from '$lib/test-utils/setup';

describe('AceContextService', () => {
  let service: AceContextService;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupTest();
    cleanup = setup.cleanup;
    service = new AceContextService();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should apply hybrid scoring correctly', async () => {
    const bundle = await service.buildContextBundle({
      query: 'Svelte 5 runes',
      limit: 10,
    });

    // Verify scores in valid range
    for (const chunk of bundle.chunks) {
      expect(chunk.score).toBeGreaterThanOrEqual(0);
      expect(chunk.score).toBeLessThanOrEqual(1);
    }

    // Verify sorted by score
    for (let i = 1; i < bundle.chunks.length; i++) {
      expect(bundle.chunks[i - 1].score).toBeGreaterThanOrEqual(
        bundle.chunks[i].score
      );
    }
  });
});
```

### Integration Tests

```typescript
// Example: End-to-end ingestion test
it('should ingest URL and create chunks', async () => {
  // Trigger ingestion
  const response = await fetch('/api/ace/web/ingest', {
    method: 'POST',
    body: JSON.stringify({
      urls: ['https://svelte.dev/docs'],
      tags: ['test'],
    }),
  });

  expect(response.ok).toBe(true);

  // Wait for processing
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Verify chunks created
  const chunks = await db.select().from(aceChunks).limit(1);
  expect(chunks.length).toBeGreaterThan(0);
});
```

---

## 🎯 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Context Retrieval Latency | <2s p95 | Monitor API response times |
| Ingestion Throughput | 10 concurrent | Worker concurrency setting |
| Hybrid Scoring Accuracy | >85% relevance | User feedback + A/B testing |
| Test Coverage | >80% | `npm run test:coverage` |
| Vector Search Speed | <100ms | Qdrant query timing |

---

## 🚦 Next Steps

### Immediate (Today)

1. ✅ Review requirements.md (confirm architecture)
2. ✅ Review design.md (understand implementation)
3. ⬜ Assign Phase 1 tasks to developer(s)

### Short-Term (This Week)

1. ⬜ Complete Phase 1: Infrastructure Setup
2. ⬜ Complete Phase 2: Core Services
3. ⬜ Begin Phase 3: API Endpoints

### Medium-Term (Next 2 Weeks)

1. ⬜ Complete Phases 3-6 (API + Worker + Integration + Testing)
2. ⬜ Deploy to staging environment
3. ⬜ Conduct user acceptance testing

### Long-Term (Next Month)

1. ⬜ Complete Phases 7-8 (Documentation + Optimization)
2. ⬜ Deploy to production
3. ⬜ Monitor performance and iterate

---

## 📞 Support

**Questions about the spec?**
- Read design.md for detailed technical information
- Check tasks.md for implementation guidance
- Review STATUS.md for progress tracking

**Ready to implement?**
- Start with Phase 1, Task 1.1 (Database Schema)
- Follow the 24-task checklist in tasks.md
- Use code examples from design.md

**Need help?**
- All patterns follow existing codebase conventions
- Test infrastructure already in place (test-utils/setup.ts)
- Drizzle ORM examples throughout codebase

---

## 🎉 What You Get

After implementing this spec, you'll have:

✅ **Complete web ingestion pipeline** - Crawl, clean, chunk, embed, store
✅ **Hybrid RAG+KAG retrieval** - Vector similarity + knowledge graph
✅ **Contextual prompt assembly** - Evidence + citations + action plan
✅ **Production-ready system** - Error handling, retries, monitoring
✅ **Comprehensive tests** - Unit + integration with >80% coverage
✅ **Performance optimized** - Caching, batching, parallel processing

---

**Last Updated:** December 20, 2025
**Status:** Ready for Implementation
**Estimated Effort:** 75 hours (~2 weeks for 1 developer)
