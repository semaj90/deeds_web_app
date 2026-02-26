# Document Ingestion & Indexing Pipeline

## 🎯 Complete Pipeline Architecture

```
Raw Document (PDF/TXT)
    ↓
[1] Parse & Extract Text
    ├─ LangExtract (section detection)
    └─ Store in MinIO
    ↓
[2] Sentence Splitting
    ├─ Split by sentence boundaries
    ├─ Preserve context windows
    └─ Store metadata
    ↓
[3] Chunking (Memory-Optimized)
    ├─ Sliding window (512 tokens, 128 overlap)
    ├─ CUDA-accelerated if available
    └─ Store in PostgreSQL
    ↓
[4] Citation Extraction
    ├─ Regex + ML-based extraction
    ├─ Link to referenced cases/statutes
    └─ Build citation graph
    ↓
[5] Holding Summarization
    ├─ LLM-based extraction
    ├─ Key legal principles
    └─ Store summaries
    ↓
[6] Embedding Generation
    ├─ Gemma3 embeddings (768d)
    ├─ Matryoshka truncation (256d)
    └─ Store in pgvector
    ↓
[7] Indexing
    ├─ Qdrant (semantic search)
    ├─ Elasticsearch (full-text)
    └─ PostgreSQL (metadata)
    ↓
[8] Re-ranking
    ├─ Legal-specific re-ranker
    ├─ Citation frequency boost
    └─ Jurisdiction weighting
    ↓
Searchable Legal Knowledge Base
```

---

## 🔍 Technology Stack Decision Matrix

### Option 1: Sentence Splitter
| Tool | Pros | Cons | Recommendation |
|------|------|------|-----------------|
| NLTK | Simple, fast | Not legal-aware | ✅ Start here |
| spaCy | Better accuracy | Slower | Use after MVP |
| LangExtract | Legal-aware | Requires API | Phase 2 |

**Decision**: Use NLTK for MVP, upgrade to spaCy later

### Option 2: Chunking Strategy
| Approach | Pros | Cons | Recommendation |
|----------|------|------|-----------------|
| Fixed size (512 tokens) | Simple, fast | May split holdings | ✅ Start here |
| Semantic (LLM-based) | Preserves meaning | Slow, expensive | Phase 2 |
| Hierarchical | Best accuracy | Complex | Phase 3 |

**Decision**: Fixed-size sliding window (512 tokens, 128 overlap)

### Option 3: CUDA Acceleration
| Option | Pros | Cons | Recommendation |
|--------|------|------|-----------------|
| CUDA (GPU) | 10-100x faster | Requires GPU | ✅ If available |
| CPU-only | Works everywhere | Slower | Fallback |
| Batch processing | Good compromise | Still slower | Phase 2 |

**Decision**: Detect GPU, use CUDA if available, fallback to CPU

### Option 4: Vector Storage
| Database | Pros | Cons | Recommendation |
|----------|------|------|-----------------|
| pgvector | Integrated with PostgreSQL | Slower than Qdrant | ✅ Use for metadata |
| Qdrant | Fast, specialized | Separate service | ✅ Use for search |
| Both (Dual) | Best of both | More complex | ✅ Recommended |

**Decision**: Use both - pgvector for metadata, Qdrant for search

### Option 5: Re-ranking
| Approach | Pros | Cons | Recommendation |
|----------|------|------|-----------------|
| BM25 + Semantic | Simple, effective | Generic | ✅ Start here |
| Legal-specific model | Better accuracy | Requires training | Phase 2 |
| Citation-based | Highly relevant | Needs citation graph | Phase 2 |

**Decision**: Start with BM25 + semantic, add legal re-ranker in Phase 2

---

## 📍 Geographic Focus Decision

### Option A: California Only
**Pros**:
- Focused dataset (manageable size)
- Strong child abuse/CPS case law
- Restitution precedent
- Faster to MVP

**Cons**:
- Limited scope
- Missing federal precedent
- Immigration cases limited

**Dataset Size**: ~50,000 cases

### Option B: Federal 9th Circuit + California
**Pros**:
- Broader precedent
- Immigration overlap (9th Circuit strength)
- Federal + state integration
- Better for reasoning

**Cons**:
- Larger dataset
- More complex relationships
- Longer ingestion time

**Dataset Size**: ~150,000 cases

---

## 🎯 RECOMMENDATION: Start with Option A (California Only)

### Why California First?

1. **Focused Domain**
   - Strong child abuse/CPS case law
   - Clear restitution precedent
   - Manageable dataset size

2. **Faster MVP**
   - ~50,000 cases vs 150,000
   - Easier to validate accuracy
   - Quicker to production

3. **Better for Fine-tuning**
   - Concentrated legal domain
   - Consistent terminology
   - Easier to train legal reasoner

4. **Expansion Path**
   - Add 9th Circuit later
   - Add other states incrementally
   - Build federation model

---

## 📋 Implementation Plan (California Focus)

### Phase 1: Document Ingestion (Week 1-2)

**Step 1: Scrape California Cases**
```python
# Scrape from:
# - Google Scholar (free)
# - California Courts (official)
# - Justia (free)
# - FindLaw (free)

# Target: ~50,000 cases
# Focus: Child abuse, CPS, restitution
```

**Step 2: Parse & Extract**
```typescript
// Use LangExtract for section detection
// Extract: holding, facts, reasoning, citations
// Store in MinIO: raw/parsed/chunked
```

**Step 3: Sentence Splitting**
```typescript
// Use NLTK for sentence boundaries
// Preserve legal terminology
// Store metadata (case_id, section_type)
```

**Step 4: Chunking**
```typescript
// Fixed-size: 512 tokens
// Overlap: 128 tokens
// CUDA-accelerated if available
// Store in PostgreSQL
```

### Phase 2: Citation Extraction (Week 2-3)

**Step 1: Extract Citations**
```python
# Regex patterns for:
# - Case citations (123 Cal.App.4th 456)
# - Statute citations (Cal. Penal Code § 123)
# - Federal citations (123 F.3d 456)
```

**Step 2: Build Citation Graph**
```typescript
// Link citations to referenced cases
// Build precedent relationships
// Store in PostgreSQL
```

**Step 3: Holding Summarization**
```typescript
// Use LLM to extract key holdings
// Summarize legal principles
// Store summaries in PostgreSQL
```

### Phase 3: Embedding & Indexing (Week 3-4)

**Step 1: Generate Embeddings**
```typescript
// Use Gemma3 embeddings
// 768d full embeddings
// 256d Matryoshka truncated
// Batch process with CUDA
```

**Step 2: Index in Qdrant**
```typescript
// Create collection: california_cases_768
// Create collection: california_cases_256
// Store payloads: case_id, holding, citations
```

**Step 3: Index in Elasticsearch**
```typescript
// Full-text index
// Store: case_name, holding, facts
// Enable fuzzy matching
```

**Step 4: Store in PostgreSQL**
```typescript
// Metadata: case_id, title, year, court
// Embeddings: pgvector columns
// Citations: foreign keys
```

### Phase 4: Re-ranking & Search (Week 4-5)

**Step 1: Implement BM25 + Semantic**
```typescript
// Hybrid search combining:
// - Qdrant semantic (768d)
// - Elasticsearch full-text
// - RRF ranking
```

**Step 2: Add Citation Boosting**
```typescript
// Boost highly-cited cases
// Weight by recency
// Jurisdiction preference
```

**Step 3: Legal Re-ranker (Phase 2)**
```typescript
// Train legal-specific model
// Fine-tune on California cases
// Improve accuracy
```

---

## 🔧 Technology Stack (California Focus)

### Document Processing
- **Parser**: LangExtract (section detection)
- **Sentence Splitter**: NLTK (fast, simple)
- **Chunker**: Custom (512 tokens, 128 overlap)
- **Acceleration**: CUDA (if available)

### Storage
- **Raw Documents**: MinIO
- **Parsed Text**: PostgreSQL (text column)
- **Chunks**: PostgreSQL (chunk table)
- **Embeddings**: pgvector + Qdrant

### Indexing
- **Semantic**: Qdrant (768d + 256d)
- **Full-Text**: Elasticsearch
- **Metadata**: PostgreSQL

### Embedding
- **Model**: Gemma3 (768d)
- **Truncation**: Matryoshka (256d)
- **Acceleration**: CUDA

### Re-ranking
- **Initial**: BM25 + Semantic (RRF)
- **Phase 2**: Legal-specific model
- **Boosting**: Citation frequency, recency

---

## 📊 Expected Performance

### Ingestion Pipeline
| Stage | Time | Throughput |
|-------|------|-----------|
| Parse | 2-5s/doc | 200-500 docs/hour |
| Chunk | 1-2s/doc | 500-1000 docs/hour |
| Embed | 5-10s/doc | 100-200 docs/hour |
| Index | 1-2s/doc | 500-1000 docs/hour |

**Total**: ~50,000 cases in 50-100 hours (2-4 days)

### Search Performance
| Query Type | Latency | Accuracy |
|-----------|---------|----------|
| Semantic (Qdrant) | 25-50ms | 85-90% |
| Full-text (ES) | 10-25ms | 70-80% |
| Hybrid (RRF) | 50-100ms | 90-95% |

---

## 🎯 Focus Priority (California Only)

### Week 1-2: Document Ingestion
1. ✅ Scrape California cases
2. ✅ Parse & extract text
3. ✅ Sentence splitting
4. ✅ Chunking (CUDA-accelerated)

### Week 2-3: Citation Extraction
1. ✅ Extract citations
2. ✅ Build citation graph
3. ✅ Summarize holdings

### Week 3-4: Embedding & Indexing
1. ✅ Generate embeddings
2. ✅ Index in Qdrant
3. ✅ Index in Elasticsearch
4. ✅ Store in PostgreSQL

### Week 4-5: Re-ranking & Search
1. ✅ Implement hybrid search
2. ✅ Add citation boosting
3. ✅ Test accuracy

---

## ✅ Success Criteria

- [ ] 50,000 California cases ingested
- [ ] All chunks embedded (768d + 256d)
- [ ] Qdrant + Elasticsearch indexed
- [ ] Hybrid search working
- [ ] Search latency <100ms
- [ ] Accuracy >90%

---

## 🚀 Next Steps

**Choose your focus**:
- **Option A**: California only (recommended for MVP)
- **Option B**: Federal 9th Circuit + California (broader scope)

**Then execute**:
1. Scrape cases
2. Parse & chunk
3. Extract citations
4. Generate embeddings
5. Index & search

---

**Recommendation**: Start with **Option A (California Only)**
- Faster MVP
- Better accuracy
- Easier to expand later
- Perfect for fine-tuning legal reasoner

Ready to begin? 🚀
