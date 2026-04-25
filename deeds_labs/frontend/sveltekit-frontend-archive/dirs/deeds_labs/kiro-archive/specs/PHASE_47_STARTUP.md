# Phase 47 - Document Ingestion Pipeline Startup Guide

## 🚀 You're Starting Phase 47

This is the beginning of the **Legal Reasoner + Citation Engine** implementation.

### What You Have Ready

✅ **Document Scraper** (`scripts/legal-document-scraper.py`)
- Scrapes California cases from Google Scholar, Justia, FindLaw
- Stores in SQLite database
- Focuses on child abuse, CPS, restitution cases

✅ **Document Processor** (`src/lib/server/services/ingestion/document-processor.ts`)
- Sentence splitting (legal-aware)
- Chunking (512 tokens, 128 overlap)
- Citation extraction (case + statute)
- Holding extraction
- Metadata extraction

✅ **Complete Pipeline Architecture** (documented)
- 8-stage ingestion pipeline
- Technology decisions made
- Performance targets set

---

## 📋 Week 1-2: Document Ingestion

### Day 1-2: Scrape California Cases

**Step 1: Install dependencies**
```bash
pip install requests beautifulsoup4 sqlite3
```

**Step 2: Run scraper**
```bash
python scripts/legal-document-scraper.py
```

**Expected output**:
- `california_cases.db` - SQLite database with cases
- `scraper_summary.json` - Scraping statistics
- ~5,000-10,000 cases from initial run

**Queries focused on**:
- Child abuse cases
- CPS cases
- Restitution cases
- Family law cases
- Dependency cases
- Juvenile delinquency
- Victim restitution
- Child endangerment

### Day 3-4: Parse & Extract Text

**Step 1: Create document loader**
```typescript
// Load cases from SQLite
// Extract full text from URLs
// Store parsed text in PostgreSQL
```

**Step 2: Process documents**
```typescript
import { processDocument } from '$lib/server/services/ingestion/document-processor';

const processed = await processDocument(
  'case-123',
  'People v. Smith',
  caseText,
  'google_scholar'
);

// Result includes:
// - chunks (512 tokens each)
// - citations (extracted)
// - holding (extracted)
// - metadata (year, court, keywords)
```

### Day 5: Sentence Splitting & Chunking

**Already implemented in document-processor.ts**:
- `splitSentences()` - Legal-aware sentence splitting
- `chunkDocument()` - 512 token chunks with 128 overlap
- `tokenize()` - Word-based tokenization
- `countTokens()` - Token counting

**Usage**:
```typescript
const chunks = chunkDocument(
  'case-123',
  caseText,
  512,  // chunk size
  128   // overlap
);

// Returns array of DocumentChunk objects
// Each chunk ready for embedding
```

---

## 📌 Week 2-3: Citation Extraction & Holding Summarization

### Day 1-2: Extract Citations

**Already implemented**:
- `extractCitations()` - Regex-based citation extraction
- Supports: California cases, Federal cases, Supreme Court, Statutes
- Returns: Citation objects with type and confidence

**Usage**:
```typescript
const citations = extractCitations(caseText);

// Returns:
// [
//   { text: "123 Cal.App.4th 456", type: "case", confidence: 0.9 },
//   { text: "Cal. Penal Code § 123", type: "statute", confidence: 0.85 }
// ]
```

### Day 3-4: Extract Holdings

**Already implemented**:
- `extractHolding()` - Holding extraction
- Looks for "held", "the court held", "we hold", "holding"
- Fallback to first paragraph

**Usage**:
```typescript
const holding = extractHolding(caseText);

// Returns: "The court held that..."
```

### Day 5: Extract Metadata

**Already implemented**:
- `extractMetadata()` - Year, court, keywords
- `extractKeywords()` - Legal keyword extraction

**Usage**:
```typescript
const metadata = extractMetadata(caseText, title);

// Returns:
// {
//   year: 2023,
//   court: "Court of Appeal",
//   keywords: ["child abuse", "restitution", "custody"]
// }
```

---

## 📌 Week 3-4: Embedding & Indexing

### Day 1-2: Generate Embeddings

**Use existing service**:
```typescript
import { getDualQdrantStrategy } from '$lib/server/services/qdrant/dual-collection-strategy';

const qdrant = await getDualQdrantStrategy();

// For each chunk:
const embedding768 = await getEmbedding(chunk.text); // Gemma3
const dual = DualQdrantStrategy.createDualEmbedding(embedding768);

// Upsert to Qdrant
await qdrant.upsertPoint(chunk.id, dual, {
  statute_id: chunk.id,
  text: chunk.text,
  holding: holding,
  citations: citations,
  // ... other metadata
});
```

### Day 3-4: Index in Elasticsearch

**Use existing service**:
```typescript
// Index chunks in Elasticsearch
// Full-text search on: title, holding, facts, reasoning
```

### Day 5: Store in PostgreSQL

**Use pgvector**:
```typescript
// Store embeddings in pgvector columns
// Store metadata in PostgreSQL tables
// Link citations via foreign keys
```

---

## 📌 Week 4-5: Re-ranking & Search

### Day 1-2: Implement Hybrid Search

**Use existing RRF**:
```typescript
// Combine:
// - Qdrant semantic search (768d)
// - Elasticsearch full-text
// - RRF ranking
```

### Day 3-4: Add Citation Boosting

**Boost highly-cited cases**:
```typescript
// Weight by citation frequency
// Boost recent cases
// Jurisdiction preference
```

### Day 5: Test & Validate

**Performance targets**:
- Search latency: <100ms
- Accuracy: >90%
- Throughput: 50-100 queries/second

---

## 🔧 Implementation Checklist

### Week 1-2: Scraping & Parsing
- [ ] Install Python dependencies
- [ ] Run document scraper
- [ ] Verify SQLite database created
- [ ] Load cases from database
- [ ] Extract full text from URLs
- [ ] Store parsed text in PostgreSQL

### Week 2-3: Processing
- [ ] Implement sentence splitting
- [ ] Implement chunking (512 tokens, 128 overlap)
- [ ] Extract citations
- [ ] Extract holdings
- [ ] Extract metadata
- [ ] Batch process all documents

### Week 3-4: Embedding & Indexing
- [ ] Generate embeddings (768d + 256d)
- [ ] Upsert to Qdrant (both collections)
- [ ] Index in Elasticsearch
- [ ] Store in PostgreSQL
- [ ] Verify all indices created

### Week 4-5: Search & Ranking
- [ ] Implement hybrid search
- [ ] Add citation boosting
- [ ] Test search accuracy
- [ ] Benchmark performance
- [ ] Validate results

---

## 📊 Expected Results

### After Week 1-2
- ✅ 50,000 California cases scraped
- ✅ All cases parsed and stored
- ✅ Metadata extracted

### After Week 2-3
- ✅ All documents chunked (512 tokens)
- ✅ Citations extracted
- ✅ Holdings summarized
- ✅ Metadata complete

### After Week 3-4
- ✅ All chunks embedded (768d + 256d)
- ✅ Qdrant indexed (both collections)
- ✅ Elasticsearch indexed
- ✅ PostgreSQL populated

### After Week 4-5
- ✅ Hybrid search working
- ✅ Citation boosting active
- ✅ Search latency <100ms
- ✅ Accuracy >90%

---

## 🚀 Next Steps

1. **Install dependencies**
   ```bash
   pip install requests beautifulsoup4
   ```

2. **Run scraper**
   ```bash
   python scripts/legal-document-scraper.py
   ```

3. **Verify database**
   ```bash
   sqlite3 california_cases.db "SELECT COUNT(*) FROM cases;"
   ```

4. **Start processing**
   - Load cases from database
   - Process with document-processor.ts
   - Generate embeddings
   - Index in Qdrant + Elasticsearch

---

## 📞 Resources

- `DOCUMENT_INGESTION_PIPELINE.md` - Complete architecture
- `scripts/legal-document-scraper.py` - Scraper implementation
- `src/lib/server/services/ingestion/document-processor.ts` - Processing pipeline
- Existing services: Qdrant, Elasticsearch, PostgreSQL

---

**Status**: ✅ PHASE 47 READY TO START
**Timeline**: 5 weeks to production-ready search
**Focus**: California cases (child abuse, CPS, restitution)

Let's build the legal reasoning engine! 🚀
