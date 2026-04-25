# Complete Agentic Pipeline Architecture
## OCR/Vision → LangExtract → Auto-Embed → Ranking → XState → Multi-Agent Synthesis

**Last Updated**: 2025-10-18
**Status**: 🚀 Production-Grade Autonomous Legal AI System

---

## 🎯 System Vision

Build a **fully autonomous legal AI pipeline** that:

1. **OCR/Vision**: Extract text from documents, images, PDFs
2. **LangExtract**: Parse structured legal data (parties, dates, clauses)
3. **Auto-Embed**: Generate embeddings with embeddinggemma + cache
4. **Qdrant + pgvector**: Dual vector storage with ANN search
5. **Fuse.js Ranking**: Hybrid search (semantic + fuzzy + BM25)
6. **XState Orchestration**: State machines for workflows
7. **RabbitMQ**: Message queuing for GPU tasks
8. **Multi-Agent (AutoGen/CrewAI)**: Collaborative reasoning
9. **LLM Output Synthesis**: Contextual prompting with memory
10. **Recommendation Engine**: Next-best-action suggestions

---

## 📊 Complete Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  INGESTION TIER (Document Processing)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📄 OCR/Vision Pipeline (Tesseract + PaddleOCR)                │
│  ├─ PDF extraction: pdfjs + pdf2image                          │
│  ├─ Image OCR: Tesseract.js (browser) + PaddleOCR (server)     │
│  ├─ Table detection: Camelot + Tabula                          │
│  ├─ Handwriting: Google Vision API (fallback)                  │
│  └─ Output: Raw text + layout preservation                     │
│                                                                  │
│  🧠 LangExtract Pipeline (Structured Parsing)                  │
│  ├─ Entity extraction: spaCy legal NER                         │
│  ├─ Clause detection: Regex + ML classifier                    │
│  ├─ Party identification: gemma3:270m fine-tuned               │
│  ├─ Date normalization: chrono-node                            │
│  └─ Output: JSON-LD legal document structure                   │
│                                                                  │
│  🔖 Auto-Tagging (Qdrant Integration)                          │
│  ├─ Legal category: contract, evidence, brief, citation        │
│  ├─ Practice area: criminal, civil, corporate, IP              │
│  ├─ Jurisdiction: federal, state, local                        │
│  ├─ Risk level: low, medium, high, critical                    │
│  └─ Custom metadata: client tags, case numbers                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ RabbitMQ Task Queue
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  EMBEDDING TIER (Auto-Embed + Dual Vector Storage)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🧬 Auto-Embedding Service (embeddinggemma + cache)            │
│  ├─ Model: embeddinggemma:latest (768D)                        │
│  ├─ Chunking: RecursiveCharacterTextSplitter (512 tokens)      │
│  ├─ Batch processing: 32 chunks per GPU call                   │
│  ├─ Redis cache: SHA256(text) → embedding (Int8)               │
│  └─ Fallback: nomic-embed-text (384D) if GPU busy              │
│                                                                  │
│  🗄️ Dual Vector Storage (Qdrant + pgvector)                   │
│  ├─ Qdrant: Fast ANN search (HNSW index)                       │
│  │  ├─ Collections: legal_docs, cases, evidence                │
│  │  ├─ Metadata filters: tags, date ranges, jurisdiction       │
│  │  └─ Quantization: Scalar (8x faster, 4x less memory)        │
│  │                                                              │
│  └─ pgvector: PostgreSQL integration (ACID compliance)         │
│     ├─ Tables: documents, cases, evidence                      │
│     ├─ Indexes: HNSW (cosine similarity)                       │
│     ├─ JSONB metadata: {tags, parties, dates, risk}            │
│     └─ Full-text search: tsvector + GIN index                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Search Query
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  RANKING TIER (Hybrid Search with Fuse.js)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🔍 Multi-Stage Ranker                                          │
│  ├─ Stage 1: Semantic Search (Qdrant ANN)                      │
│  │  ├─ Query: embeddinggemma(user_query)                       │
│  │  ├─ Top-K: 100 candidates (cosine similarity > 0.7)         │
│  │  └─ Score: 0.0-1.0 (semantic relevance)                     │
│  │                                                              │
│  ├─ Stage 2: Fuzzy Search (Fuse.js)                            │
│  │  ├─ Keys: title, parties, case_number, summary              │
│  │  ├─ Options: threshold=0.3, distance=100                    │
│  │  └─ Score: 0.0-1.0 (fuzzy match quality)                    │
│  │                                                              │
│  ├─ Stage 3: BM25 Full-Text (PostgreSQL tsvector)              │
│  │  ├─ Query: to_tsquery('legal & contract & breach')          │
│  │  ├─ Ranking: ts_rank_cd(document, query)                    │
│  │  └─ Score: 0.0-1.0 (keyword relevance)                      │
│  │                                                              │
│  └─ Stage 4: Hybrid Fusion (RRF - Reciprocal Rank Fusion)      │
│     ├─ Formula: score = Σ(1 / (k + rank_i))                    │
│     ├─ Weights: semantic=0.5, fuzzy=0.3, bm25=0.2              │
│     └─ Output: Top-20 results with combined scores             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Ranked Results
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  ORCHESTRATION TIER (XState + RabbitMQ)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🎛️ XState Document Processing Machine                        │
│  ├─ States: idle → uploading → ocr → extracting → embedding   │
│  │           → indexing → ready → error                        │
│  ├─ Events: UPLOAD_DOC, OCR_COMPLETE, EMBED_COMPLETE           │
│  ├─ Guards: hasGPU, cacheHit, qualityCheck                     │
│  └─ Actions: queueTask, updateProgress, notifyUser             │
│                                                                  │
│  🐰 RabbitMQ Task Queues (Priority-Based)                      │
│  ├─ Queue 1: ocr_queue (priority: 3)                           │
│  │  └─ Workers: Tesseract + PaddleOCR containers               │
│  ├─ Queue 2: embedding_queue (priority: 2)                     │
│  │  └─ Workers: GPU memory manager (embeddinggemma)            │
│  ├─ Queue 3: langextract_queue (priority: 1)                   │
│  │  └─ Workers: gemma3:270m legal extraction                   │
│  └─ Queue 4: indexing_queue (priority: 4)                      │
│     └─ Workers: Qdrant + pgvector batch indexers               │
│                                                                  │
│  💾 GPU Caching Layer (Redis)                                   │
│  ├─ Embedding cache: text_hash → Int8 vector (768D)            │
│  ├─ LLM output cache: prompt_hash → response (TTL: 1hr)        │
│  ├─ Glyph cache: doc_id → SVG pattern (NES CHR-ROM)            │
│  └─ Eviction: LRU + frequency-based pruning                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ LLM Processing Request
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  AGENTIC TIER (AutoGen + CrewAI Multi-Agent)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🤖 Agent Swarm (Specialized Legal Agents)                     │
│  ├─ Agent 1: Document Analyzer                                 │
│  │  ├─ Role: Extract key facts from legal documents            │
│  │  ├─ Tools: LangExtract, Qdrant search                       │
│  │  └─ Model: gemma3:270m (fast analysis)                      │
│  │                                                              │
│  ├─ Agent 2: Case Law Researcher                               │
│  │  ├─ Role: Find similar precedents                           │
│  │  ├─ Tools: Hybrid search, citation graph                    │
│  │  └─ Model: gemma3:legal-latest (specialized)                │
│  │                                                              │
│  ├─ Agent 3: Risk Assessor                                     │
│  │  ├─ Role: Identify legal risks and liabilities              │
│  │  ├─ Tools: Risk scoring model, clause analysis              │
│  │  └─ Model: gemma3:270m fine-tuned on risk data              │
│  │                                                              │
│  ├─ Agent 4: Contract Drafter                                  │
│  │  ├─ Role: Generate contract clauses                         │
│  │  ├─ Tools: Template library, clause database                │
│  │  └─ Model: gemma3:270m + LoRA adapter                       │
│  │                                                              │
│  └─ Agent 5: Orchestrator (Meta-Agent)                         │
│     ├─ Role: Coordinate agent collaboration                    │
│     ├─ Tools: AutoGen group chat, CrewAI workflow              │
│     └─ Model: gemma3:legal-latest (reasoning)                  │
│                                                                  │
│  🧠 LLM Output Synthesizer (Contextual Memory)                 │
│  ├─ Memory Store: Redis (short-term) + pgvector (long-term)    │
│  ├─ Context Window: 8K tokens (gemma3:270m)                    │
│  ├─ Prompt Engineering: Few-shot + Chain-of-Thought            │
│  ├─ Response Fusion: Combine multi-agent outputs               │
│  └─ Quality Check: Hallucination detection + fact verification │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Synthesized Output
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT TIER (SvelteKit 2 + WebGPU)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🌐 SvelteKit 2 Remote Functions (RPC-style)                   │
│  ├─ Server Actions: $lib/server/actions/                       │
│  │  ├─ uploadDocument.ts: OCR + extract + embed                │
│  │  ├─ searchDocuments.ts: Hybrid search + ranking             │
│  │  ├─ analyzeRisk.ts: Multi-agent risk assessment             │
│  │  └─ generateClause.ts: Contract drafting agent              │
│  │                                                              │
│  └─ Client Bindings: $lib/api/                                 │
│     ├─ import { uploadDocument } from '$lib/api/documents'     │
│     └─ const result = await uploadDocument(file)               │
│                                                                  │
│  🎮 WebGPU Visualization (NES-Style Glyphs + SVG)              │
│  ├─ Glyph Cache: CHR-ROM pattern rendering                     │
│  ├─ LOD Manager: N64-style texture streaming                   │
│  ├─ Shader Buffers: WebGPU compute shaders                     │
│  └─ XState Integration: UI state synchronized with backend     │
│                                                                  │
│  🔄 Real-Time Streaming (SSE + WebTransport)                   │
│  ├─ Token streaming: Display LLM output as generated           │
│  ├─ Progress updates: XState machine events via SSE            │
│  ├─ Agent chat: Multi-agent collaboration visible to user      │
│  └─ Recommendation: Next-best-action suggestions               │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ User Feedback
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  RECOMMENDATION ENGINE (Next-Best-Action)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🎯 Contextual Recommendation System                            │
│  ├─ Input: User history + current document + agent outputs     │
│  ├─ Model: Collaborative filtering + content-based             │
│  ├─ Features: document_type, user_role, time_of_day, urgency   │
│  └─ Output: Top-3 suggested actions with confidence scores     │
│                                                                  │
│  💡 Suggested Actions:                                          │
│  ├─ "Search similar cases" (confidence: 0.92)                  │
│  ├─ "Generate contract clause" (confidence: 0.87)              │
│  ├─ "Assess legal risk" (confidence: 0.79)                     │
│  ├─ "Schedule review meeting" (confidence: 0.65)               │
│  └─ "Export to PDF" (confidence: 0.54)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementation: Part 1 - OCR/Vision + LangExtract

### **1. OCR Pipeline (Tesseract.js + PaddleOCR)**

```typescript
// src/lib/server/ocr/ocr-pipeline.ts
import Tesseract from 'tesseract.js';
import { PaddleOCRClient } from './paddleocr-client';
import * as pdfjs from 'pdfjs-dist';

export interface OCRResult {
  text: string;
  confidence: number;
  layout: LayoutInfo;
  language: string;
}

export class OCRPipeline {
  private tesseract = Tesseract;
  private paddle = new PaddleOCRClient('http://localhost:8866');

  async extractFromPDF(pdfBuffer: Buffer): Promise<OCRResult[]> {
    // Convert PDF pages to images
    const images = await this.pdfToImages(pdfBuffer);

    // OCR each page
    const results = await Promise.all(
      images.map(img => this.ocrImage(img))
    );

    return results;
  }

  async extractFromImage(imageBuffer: Buffer): Promise<OCRResult> {
    // Try Tesseract first (fast, browser-compatible)
    try {
      const tesseractResult = await this.tesseract.recognize(imageBuffer, 'eng');

      if (tesseractResult.data.confidence > 70) {
        return {
          text: tesseractResult.data.text,
          confidence: tesseractResult.data.confidence / 100,
          layout: this.extractLayout(tesseractResult.data),
          language: 'en'
        };
      }
    } catch (err) {
      console.warn('Tesseract failed, trying PaddleOCR');
    }

    // Fallback to PaddleOCR (slower, more accurate)
    const paddleResult = await this.paddle.ocr(imageBuffer);

    return {
      text: paddleResult.text,
      confidence: paddleResult.confidence,
      layout: paddleResult.layout,
      language: paddleResult.language
    };
  }

  private async pdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
    const loadingTask = pdfjs.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;

    const images: Buffer[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = new OffscreenCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d')!;

      await page.render({ canvasContext: context, viewport }).promise;

      // Convert canvas to buffer
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const arrayBuffer = await blob.arrayBuffer();
      images.push(Buffer.from(arrayBuffer));
    }

    return images;
  }

  private extractLayout(tesseractData: any): LayoutInfo {
    const { blocks, lines, words } = tesseractData;

    return {
      blocks: blocks.map((b: any) => ({
        bbox: b.bbox,
        text: b.text,
        confidence: b.confidence
      })),
      tables: this.detectTables(lines),
      headers: this.detectHeaders(words)
    };
  }
}
```

### **2. LangExtract Pipeline (Legal Entity Extraction)**

```typescript
// src/lib/server/langextract/legal-parser.ts
import nlp from 'compromise';
import dates from 'compromise-dates';
import { OllamaClient } from '$lib/ai/ollama-client';

nlp.extend(dates);

export interface LegalDocument {
  parties: Party[];
  dates: LegalDate[];
  clauses: Clause[];
  jurisdiction: string;
  document_type: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

export class LegalParser {
  private ollama = new OllamaClient();

  async parse(text: string): Promise<LegalDocument> {
    // Extract entities with compromise.js (fast, rule-based)
    const doc = nlp(text);

    const parties = await this.extractParties(text, doc);
    const dates = this.extractDates(doc);
    const clauses = await this.extractClauses(text);

    // Classify with gemma3:270m (LLM-based)
    const classification = await this.classifyDocument(text);

    return {
      parties,
      dates,
      clauses,
      jurisdiction: classification.jurisdiction,
      document_type: classification.type,
      risk_level: classification.risk
    };
  }

  private async extractParties(text: string, doc: any): Promise<Party[]> {
    // Rule-based extraction
    const organizations = doc.organizations().out('array');
    const people = doc.people().out('array');

    // LLM-enhanced extraction with gemma3:270m
    const prompt = `Extract all parties from this legal document.

Document:
${text.slice(0, 2000)}

Return JSON array of parties with format:
[
  {"name": "Party A", "role": "plaintiff", "type": "individual"},
  {"name": "Party B", "role": "defendant", "type": "corporation"}
]`;

    const llmResult = await this.ollama.generate(prompt, {
      temperature: 0.1,
      maxTokens: 512
    });

    try {
      const llmParties = JSON.parse(llmResult.response);
      return llmParties;
    } catch {
      // Fallback to rule-based
      return [
        ...organizations.map(name => ({ name, type: 'organization', role: 'unknown' })),
        ...people.map(name => ({ name, type: 'individual', role: 'unknown' }))
      ];
    }
  }

  private extractDates(doc: any): LegalDate[] {
    const dates = doc.dates().json();

    return dates.map((d: any) => ({
      text: d.text,
      normalized: d.dates?.[0]?.start || null,
      type: this.classifyDateType(d.text)
    }));
  }

  private async extractClauses(text: string): Promise<Clause[]> {
    // Split into potential clauses (numbered or headings)
    const clausePattern = /(?:^|\n)(\d+\.?\s+|[A-Z][^.!?]*:)/gm;
    const matches = text.matchAll(clausePattern);

    const clauses: Clause[] = [];
    let lastIndex = 0;

    for (const match of matches) {
      const startIndex = match.index!;

      if (lastIndex > 0) {
        const clauseText = text.slice(lastIndex, startIndex).trim();

        if (clauseText.length > 50) {
          clauses.push({
            number: clauses.length + 1,
            heading: match[0].trim(),
            text: clauseText,
            type: await this.classifyClause(clauseText)
          });
        }
      }

      lastIndex = startIndex;
    }

    return clauses;
  }

  private async classifyDocument(text: string): Promise<{
    jurisdiction: string;
    type: string;
    risk: 'low' | 'medium' | 'high' | 'critical';
  }> {
    const prompt = `Classify this legal document.

Document (first 1000 chars):
${text.slice(0, 1000)}

Return JSON:
{
  "jurisdiction": "federal|state|local",
  "type": "contract|evidence|brief|citation",
  "risk": "low|medium|high|critical"
}`;

    const result = await this.ollama.generate(prompt, {
      temperature: 0.1,
      maxTokens: 128
    });

    try {
      return JSON.parse(result.response);
    } catch {
      return {
        jurisdiction: 'unknown',
        type: 'contract',
        risk: 'medium'
      };
    }
  }
}
```

---

## 🔧 Implementation: Part 2 - Auto-Embed + Dual Vector Storage

### **3. Auto-Embedding Service (embeddinggemma + Cache)**

```typescript
// src/lib/server/embeddings/auto-embed-service.ts
import { OllamaClient } from '$lib/ai/ollama-client';
import { createHash } from 'crypto';
import type { Redis } from 'ioredis';

export class AutoEmbedService {
  private ollama = new OllamaClient();
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async embedText(text: string, model: string = 'embeddinggemma:latest'): Promise<number[]> {
    // Check cache first
    const cacheKey = this.getCacheKey(text, model);
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      console.log('✅ Embedding cache hit');
      return JSON.parse(cached);
    }

    // Generate embedding
    const embedding = await this.ollama.embed(text, model);

    // Cache with TTL (1 week)
    await this.redis.setex(
      cacheKey,
      604800,
      JSON.stringify(embedding)
    );

    return embedding;
  }

  async embedBatch(
    texts: string[],
    model: string = 'embeddinggemma:latest',
    batchSize: number = 32
  ): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const batchEmbeddings = await Promise.all(
        batch.map(text => this.embedText(text, model))
      );

      embeddings.push(...batchEmbeddings);

      console.log(`Embedded ${i + batch.length}/${texts.length} chunks`);
    }

    return embeddings;
  }

  private getCacheKey(text: string, model: string): string {
    const hash = createHash('sha256').update(text).digest('hex');
    return `embedding:${model}:${hash}`;
  }
}
```

### **4. Dual Vector Storage (Qdrant + pgvector)**

```typescript
// src/lib/server/vectordb/dual-vector-store.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import type { Drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

export class DualVectorStore {
  private qdrant: QdrantClient;
  private db: Drizzle;

  constructor(qdrant: QdrantClient, db: Drizzle) {
    this.qdrant = qdrant;
    this.db = db;
  }

  async indexDocument(doc: {
    id: string;
    text: string;
    embedding: number[];
    metadata: {
      tags: string[];
      document_type: string;
      risk_level: string;
      parties: Party[];
      dates: LegalDate[];
    };
  }): Promise<void> {
    // Index in Qdrant (fast ANN search)
    await this.qdrant.upsert('legal_documents', {
      wait: true,
      points: [
        {
          id: doc.id,
          vector: doc.embedding,
          payload: {
            text: doc.text.slice(0, 1000), // First 1K chars
            ...doc.metadata
          }
        }
      ]
    });

    // Index in pgvector (ACID compliance + JSONB metadata)
    await this.db.execute(sql`
      INSERT INTO legal_documents (id, content, embedding_768, metadata)
      VALUES (
        ${doc.id},
        ${doc.text},
        ${sql`ARRAY[${doc.embedding.join(',')}]::vector(768)`},
        ${sql`${JSON.stringify(doc.metadata)}::jsonb`}
      )
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        embedding_768 = EXCLUDED.embedding_768,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `);

    console.log(`✅ Indexed document ${doc.id} in Qdrant + pgvector`);
  }

  async search(query: {
    embedding: number[];
    filters?: {
      tags?: string[];
      document_type?: string;
      risk_level?: string;
    };
    limit?: number;
  }): Promise<SearchResult[]> {
    const limit = query.limit || 20;

    // Search Qdrant (fast ANN)
    const qdrantResults = await this.qdrant.search('legal_documents', {
      vector: query.embedding,
      limit: limit * 2, // Over-fetch for re-ranking
      filter: query.filters ? this.buildQdrantFilter(query.filters) : undefined
    });

    // Re-rank with pgvector (exact cosine similarity)
    const qdrantIds = qdrantResults.map(r => r.id);

    const pgResults = await this.db.execute(sql`
      SELECT
        id,
        content,
        metadata,
        1 - (embedding_768 <=> ${sql`ARRAY[${query.embedding.join(',')}]::vector(768)`}) AS similarity
      FROM legal_documents
      WHERE id = ANY(${qdrantIds})
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);

    return pgResults.rows.map(row => ({
      id: row.id,
      text: row.content,
      similarity: row.similarity,
      metadata: row.metadata
    }));
  }
}
```

---

## 🔧 Implementation: Part 3 - Hybrid Ranking (Fuse.js + BM25)

```typescript
// src/lib/server/ranking/hybrid-ranker.ts
import Fuse from 'fuse.js';
import { sql } from 'drizzle-orm';

export class HybridRanker {
  async rank(query: {
    text: string;
    embedding: number[];
    candidates: SearchResult[];
  }): Promise<RankedResult[]> {
    const { text, embedding, candidates } = query;

    // Stage 1: Semantic scores (already from vector search)
    const semanticScores = new Map(
      candidates.map(c => [c.id, c.similarity])
    );

    // Stage 2: Fuzzy search with Fuse.js
    const fuse = new Fuse(candidates, {
      keys: ['metadata.title', 'metadata.parties', 'metadata.case_number'],
      threshold: 0.3,
      distance: 100,
      includeScore: true
    });

    const fuzzyResults = fuse.search(text);
    const fuzzyScores = new Map(
      fuzzyResults.map(r => [r.item.id, 1 - (r.score || 0)])
    );

    // Stage 3: BM25 full-text search (PostgreSQL)
    const bm25Scores = await this.getBM25Scores(text, candidates);

    // Stage 4: Reciprocal Rank Fusion (RRF)
    const finalScores = candidates.map(candidate => {
      const semanticScore = semanticScores.get(candidate.id) || 0;
      const fuzzyScore = fuzzyScores.get(candidate.id) || 0;
      const bm25Score = bm25Scores.get(candidate.id) || 0;

      // Weighted combination
      const combinedScore =
        semanticScore * 0.5 +
        fuzzyScore * 0.3 +
        bm25Score * 0.2;

      return {
        ...candidate,
        score: combinedScore,
        scores: {
          semantic: semanticScore,
          fuzzy: fuzzyScore,
          bm25: bm25Score
        }
      };
    });

    // Sort by combined score
    return finalScores.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  private async getBM25Scores(
    query: string,
    candidates: SearchResult[]
  ): Promise<Map<string, number>> {
    const candidateIds = candidates.map(c => c.id);

    const results = await this.db.execute(sql`
      SELECT
        id,
        ts_rank_cd(
          to_tsvector('english', content),
          to_tsquery('english', ${query})
        ) AS bm25_score
      FROM legal_documents
      WHERE id = ANY(${candidateIds})
    `);

    return new Map(
      results.rows.map(row => [row.id, row.bm25_score])
    );
  }
}
```

---

## 🔧 Implementation: Part 4 - XState + RabbitMQ Orchestration

```typescript
// src/lib/machines/document-processing-machine.ts
import { createMachine, assign } from 'xstate';
import type { RabbitMQClient } from '$lib/server/queue/rabbitmq-client';

export const documentProcessingMachine = createMachine({
  id: 'documentProcessing',
  initial: 'idle',

  context: {
    documentId: null,
    file: null,
    ocrResult: null,
    parsedData: null,
    embeddings: null,
    indexingComplete: false,
    error: null,
    progress: 0
  },

  states: {
    idle: {
      on: {
        UPLOAD_DOCUMENT: {
          target: 'uploading',
          actions: assign({
            file: ({ event }) => event.file,
            documentId: ({ event }) => event.documentId
          })
        }
      }
    },

    uploading: {
      entry: 'uploadToStorage',
      on: {
        UPLOAD_COMPLETE: 'queueing_ocr',
        UPLOAD_FAILED: 'error'
      }
    },

    queueing_ocr: {
      entry: 'queueOCRTask',
      on: {
        OCR_QUEUED: 'processing_ocr'
      }
    },

    processing_ocr: {
      entry: 'updateProgress',
      on: {
        OCR_COMPLETE: {
          target: 'extracting',
          actions: assign({
            ocrResult: ({ event }) => event.result,
            progress: 25
          })
        },
        OCR_FAILED: 'error'
      }
    },

    extracting: {
      entry: 'queueExtractTask',
      on: {
        EXTRACT_COMPLETE: {
          target: 'embedding',
          actions: assign({
            parsedData: ({ event }) => event.data,
            progress: 50
          })
        }
      }
    },

    embedding: {
      entry: 'queueEmbedTask',
      on: {
        EMBED_COMPLETE: {
          target: 'indexing',
          actions: assign({
            embeddings: ({ event }) => event.embeddings,
            progress: 75
          })
        }
      }
    },

    indexing: {
      entry: 'queueIndexTask',
      on: {
        INDEX_COMPLETE: {
          target: 'ready',
          actions: assign({
            indexingComplete: true,
            progress: 100
          })
        }
      }
    },

    ready: {
      entry: 'notifyComplete',
      on: {
        RESET: 'idle'
      }
    },

    error: {
      entry: assign({
        error: ({ event }) => event.error
      }),
      on: {
        RETRY: 'uploading',
        RESET: 'idle'
      }
    }
  }
}, {
  actions: {
    queueOCRTask: async ({ context }, event, { self }) => {
      const rabbitmq = getRabbitMQClient();

      await rabbitmq.publish('ocr_queue', {
        documentId: context.documentId,
        file: context.file
      });

      self.send({ type: 'OCR_QUEUED' });
    },

    queueExtractTask: async ({ context }, event, { self }) => {
      const rabbitmq = getRabbitMQClient();

      await rabbitmq.publish('langextract_queue', {
        documentId: context.documentId,
        text: context.ocrResult.text
      });
    },

    queueEmbedTask: async ({ context }, event, { self }) => {
      const rabbitmq = getRabbitMQClient();

      await rabbitmq.publish('embedding_queue', {
        documentId: context.documentId,
        chunks: context.parsedData.chunks
      });
    },

    queueIndexTask: async ({ context }, event, { self }) => {
      const rabbitmq = getRabbitMQClient();

      await rabbitmq.publish('indexing_queue', {
        documentId: context.documentId,
        embeddings: context.embeddings,
        metadata: context.parsedData.metadata
      });
    }
  }
});
```

---

## 🔧 Implementation: Part 5 - Multi-Agent System (AutoGen/CrewAI)

```typescript
// src/lib/server/agents/legal-agent-swarm.ts
import { OllamaClient } from '$lib/ai/ollama-client';

export class LegalAgentSwarm {
  private ollama = new OllamaClient();

  async analyzeDocument(documentText: string): Promise<AgentSwarmResult> {
    // Agent 1: Document Analyzer
    const analysisAgent = await this.runAgent({
      role: 'Document Analyzer',
      task: `Extract key facts from this legal document:\n\n${documentText.slice(0, 2000)}`,
      model: 'gemma3:270m'
    });

    // Agent 2: Case Law Researcher
    const researchAgent = await this.runAgent({
      role: 'Case Law Researcher',
      task: `Based on these facts:\n${analysisAgent.output}\n\nFind similar legal precedents and cite relevant cases.`,
      model: 'gemma3:legal-latest'
    });

    // Agent 3: Risk Assessor
    const riskAgent = await this.runAgent({
      role: 'Risk Assessor',
      task: `Given this analysis:\n${analysisAgent.output}\n\nAnd these precedents:\n${researchAgent.output}\n\nIdentify legal risks and assign a risk level (low/medium/high/critical).`,
      model: 'gemma3:270m'
    });

    // Agent 4: Synthesizer (Meta-Agent)
    const synthesis = await this.synthesizeOutputs([
      analysisAgent,
      researchAgent,
      riskAgent
    ]);

    return {
      agents: [analysisAgent, researchAgent, riskAgent],
      synthesis,
      recommendations: await this.generateRecommendations(synthesis)
    };
  }

  private async runAgent(config: {
    role: string;
    task: string;
    model: string;
  }): Promise<AgentOutput> {
    const prompt = `You are a ${config.role}.

Task: ${config.task}

Provide a detailed response in JSON format:
{
  "findings": [...],
  "confidence": 0.0-1.0,
  "next_steps": [...]
}`;

    const result = await this.ollama.generate(prompt, {
      model: config.model,
      temperature: 0.3,
      maxTokens: 1024
    });

    try {
      return {
        role: config.role,
        output: result.response,
        structured: JSON.parse(result.response)
      };
    } catch {
      return {
        role: config.role,
        output: result.response,
        structured: null
      };
    }
  }

  private async synthesizeOutputs(agents: AgentOutput[]): Promise<string> {
    const combinedOutputs = agents.map(a =>
      `${a.role}:\n${a.output}`
    ).join('\n\n---\n\n');

    const synthesisPrompt = `Synthesize these agent outputs into a coherent legal analysis:

${combinedOutputs}

Provide a unified summary highlighting:
1. Key findings
2. Risk assessment
3. Recommended actions`;

    const result = await this.ollama.generate(synthesisPrompt, {
      model: 'gemma3:legal-latest',
      temperature: 0.5,
      maxTokens: 512
    });

    return result.response;
  }

  private async generateRecommendations(synthesis: string): Promise<Recommendation[]> {
    const prompt = `Based on this legal analysis:

${synthesis}

Generate 3-5 recommended next actions in JSON format:
[
  {
    "action": "Search similar cases",
    "rationale": "...",
    "confidence": 0.92,
    "priority": "high"
  }
]`;

    const result = await this.ollama.generate(prompt, {
      model: 'gemma3:270m',
      temperature: 0.2,
      maxTokens: 512
    });

    try {
      return JSON.parse(result.response);
    } catch {
      return [];
    }
  }
}
```

---

## 📊 Complete Data Flow Example

```typescript
// Example: User uploads contract PDF
const workflow = async (pdfFile: File) => {
  // 1. OCR/Vision
  const ocrPipeline = new OCRPipeline();
  const ocrResult = await ocrPipeline.extractFromPDF(pdfFile);
  // Result: "THIS AGREEMENT made this 15th day of January, 2024..."

  // 2. LangExtract
  const parser = new LegalParser();
  const parsed = await parser.parse(ocrResult.text);
  // Result: {
  //   parties: [{name: "ABC Corp", role: "seller"}],
  //   dates: [{text: "January 15, 2024", type: "execution_date"}],
  //   clauses: [{heading: "1. Purchase Price", text: "..."}],
  //   risk_level: "medium"
  // }

  // 3. Auto-Embed
  const embedder = new AutoEmbedService(redis);
  const chunks = splitText(ocrResult.text, 512);
  const embeddings = await embedder.embedBatch(chunks);
  // Result: [[0.12, -0.45, ...], ...] (768D vectors)

  // 4. Index in Qdrant + pgvector
  const vectorStore = new DualVectorStore(qdrant, db);
  await vectorStore.indexDocument({
    id: 'contract_2024_001',
    text: ocrResult.text,
    embedding: embeddings[0],
    metadata: {
      tags: ['contract', 'purchase_agreement'],
      document_type: 'contract',
      risk_level: parsed.risk_level,
      parties: parsed.parties,
      dates: parsed.dates
    }
  });

  // 5. Multi-Agent Analysis
  const swarm = new LegalAgentSwarm();
  const analysis = await swarm.analyzeDocument(ocrResult.text);
  // Result: {
  //   synthesis: "This is a high-value purchase agreement...",
  //   recommendations: [
  //     {action: "Review indemnification clause", confidence: 0.89},
  //     {action: "Check jurisdiction laws", confidence: 0.76}
  //   ]
  // }

  // 6. Cache LLM outputs
  await redis.setex(
    `llm_output:contract_2024_001`,
    3600,
    JSON.stringify(analysis)
  );

  // 7. Return to client
  return {
    documentId: 'contract_2024_001',
    parsed,
    analysis,
    recommendations: analysis.recommendations
  };
};
```

---

## 🎯 SvelteKit 2 Integration (Remote Functions)

```typescript
// src/lib/server/actions/legal-actions.ts
import { OllamaClient } from '$lib/ai/ollama-client';
import { DualVectorStore } from '$lib/server/vectordb/dual-vector-store';

export const uploadAndAnalyze = async (file: File) => {
  'use server'; // SvelteKit 2 server action

  const ocrPipeline = new OCRPipeline();
  const parser = new LegalParser();
  const embedder = new AutoEmbedService(redis);
  const vectorStore = new DualVectorStore(qdrant, db);
  const agentSwarm = new LegalAgentSwarm();

  // XState machine for progress tracking
  const machine = interpret(documentProcessingMachine);
  machine.start();

  machine.send({ type: 'UPLOAD_DOCUMENT', file, documentId: generateId() });

  // Process document
  const ocrResult = await ocrPipeline.extractFromPDF(file);
  machine.send({ type: 'OCR_COMPLETE', result: ocrResult });

  const parsed = await parser.parse(ocrResult.text);
  machine.send({ type: 'EXTRACT_COMPLETE', data: parsed });

  const embeddings = await embedder.embedBatch(splitText(ocrResult.text));
  machine.send({ type: 'EMBED_COMPLETE', embeddings });

  await vectorStore.indexDocument({
    id: machine.getSnapshot().context.documentId,
    text: ocrResult.text,
    embedding: embeddings[0],
    metadata: parsed
  });
  machine.send({ type: 'INDEX_COMPLETE' });

  const analysis = await agentSwarm.analyzeDocument(ocrResult.text);

  return {
    documentId: machine.getSnapshot().context.documentId,
    parsed,
    analysis
  };
};
```

**Client Usage**:
```svelte
<script lang="ts">
  import { uploadAndAnalyze } from '$lib/server/actions/legal-actions';

  let file: File;
  let result = $state(null);

  async function handleUpload() {
    result = await uploadAndAnalyze(file);
  }
</script>

<input type="file" bind:files={file} />
<button onclick={handleUpload}>Analyze Document</button>

{#if result}
  <div>
    <h3>Analysis Complete</h3>
    <p>Risk Level: {result.parsed.risk_level}</p>
    <ul>
      {#each result.analysis.recommendations as rec}
        <li>{rec.action} (confidence: {rec.confidence})</li>
      {/each}
    </ul>
  </div>
{/if}
```

---

This is your **complete agentic pipeline**! 🚀

**Status**: ✅ All components documented and ready to implement
**Complexity**: 🔴 Very High (multi-week project)
**Impact**: 🟢 Revolutionary autonomous legal AI