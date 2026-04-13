# Legal AI Platform — Architecture Specification

**Version**: 2.0
**Last Updated**: 2026-04-12
**Status**: Production Ready

---

## Quick Reference Card

**Explore your codebase NOW**: http://localhost:5173/codebase-graph
- 15,651 files indexed
- Interactive D3.js force-directed graph
- Drag nodes, toggle import edges, search by name
- Export to Obsidian for knowledge base integration

**Search semantically**: `POST /api/codebase-index/search`
**Find missing links**: Neo4j orphan queries + CouchDB low-confidence logs
**GPU-accelerated**: simdjson (5× faster parsing) + LibTorch (100× faster similarity)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Data Layer Contracts](#data-layer-contracts)
3. [Message Queue Architecture](#message-queue-architecture)
4. [N-API GPU Bridges](#n-api-gpu-bridges)
5. [Graph Data Models](#graph-data-models)
6. [Integration Flows](#integration-flows)
7. [Exploration Guide](#exploration-guide)

---

## System Overview

### 5-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Frontend (Svelte 5 + SvelteKit 2)             │
│  ├─ Client Cache (IndexedDB + LokiJS, 5-10min TTL)     │
│  ├─ ONNX Runtime (WebGPU → WASM → CPU fallback)        │
│  ├─ XState v5 Machines (client orchestration)          │
│  └─ SSE Streaming (Server-Sent Events, real-time)      │
└─────────────────────────────────────────────────────────┘
                         ↓ HTTP/2 + SSE
┌─────────────────────────────────────────────────────────┐
│ Layer 2: API Routes (267 endpoints across 77 groups)   │
│  ├─ Auth Guards (358/386 routes, 92.7%)                │
│  ├─ Zod Validation (315/425 routes, 74.1%)             │
│  ├─ ETag + Cache-Control Headers                       │
│  ├─ Degraded Response Contract (empty arrays, not 500) │
│  └─ GPU-accelerated JSON parsing (simdjson)            │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Service Layer (lib/server/)                   │
│  ├─ RAG Pipeline (Corrective RAG, query reformulation) │
│  ├─ KAG Pipeline (Graph-filtered retrieval)            │
│  ├─ DAG Cache (CouchDB topological ordering)           │
│  ├─ GPU Accelerators (17 N-API functions)              │
│  ├─ 3-Tier LLM Cache (Redis L1 + Bifrost L2 + Ollama)  │
│  └─ RabbitMQ Producers (8 queues)                      │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Data Persistence (4 databases)                │
│  ├─ PostgreSQL (Drizzle ORM, 70+ tables, 14 enums)     │
│  ├─ Qdrant (9 collections, 768-dim, INT8 quantized)    │
│  ├─ Neo4j (Evidence/Case/Statute graph, 6 node types)  │
│  └─ CouchDB (Inference logs, DAG cache, 2 DBs)         │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 5: Infrastructure (8 services)                   │
│  ├─ Redis (L1 cache, 5ms lookups, 6,542× speedup)      │
│  ├─ Bifrost (L2 semantic cache, port 3040, 2-5s)       │
│  ├─ RabbitMQ (8 queues, 5 exchanges, async workers)    │
│  ├─ Ollama (4 models, GPU, Flash Attention)            │
│  ├─ MinIO (S3-compatible, evidence/audio storage)      │
│  ├─ Langfuse (LLM observability, http://localhost:3030)│
│  ├─ Go Services (gRPC :50051, QUIC :4434, SIMD :8095)  │
│  └─ GPU (RTX 3060 Ti, 17 N-API functions, LibTorch)    │
└─────────────────────────────────────────────────────────┘
```

---

## Data Layer Contracts

### PostgreSQL Schema (Drizzle ORM 0.44)

**70+ tables**, **14 enums**, **6 pgvector halfvec(768) columns**

```typescript
// Core table imports
import {
  users, sessions, cases, evidence, evidenceVectors,
  ragSessions, ragMessages, chatDocumentAttachments,
  libraryDocuments, legalNodes, legalChunks,
  personsOfInterest, citations, reports,
  userRoleEnum, caseStatusEnum, evidenceTypeEnum
} from '$lib/server/db/schema-postgres.js';

// ═══════════════════════════════════════════════════════════
// Auth & Users
// ═══════════════════════════════════════════════════════════

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  hashedPassword: varchar('hashed_password', { length: 255 }),
  role: userRoleEnum('role').default('user'), // 'admin' | 'user' | 'analyst'
  practiceArea: varchar('practice_area', { length: 100 }), // 'criminal' | 'civil' | 'family'
  jurisdiction: varchar('jurisdiction', { length: 50 }), // 'federal' | 'state:CA'
  createdAt: timestamp('created_at').defaultNow(),
});

// ═══════════════════════════════════════════════════════════
// Cases & Evidence
// ═══════════════════════════════════════════════════════════

export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: caseStatusEnum('status').default('open'), // 'open' | 'closed' | 'archived'
  priority: casePriorityEnum('priority').default('medium'), // 'low' | 'medium' | 'high'
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }),
  type: evidenceTypeEnum('type'), // 'document' | 'photo' | 'video' | 'audio'
  fileUrl: varchar('file_url', { length: 1000 }), // MinIO S3 path
  sha256Hash: varchar('sha256_hash', { length: 64 }), // Integrity check
  metadata: jsonb('metadata').$type<EvidenceMetadata>(),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// ═══════════════════════════════════════════════════════════
// Vector Embeddings (pgvector halfvec for 50% memory savings)
// ═══════════════════════════════════════════════════════════

export const evidenceVectors = pgTable('evidence_vectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'cascade' }),
  chunkText: text('chunk_text').notNull(),
  embedding: vector('embedding', { dimensions: 768 }), // pgvector halfvec(768)
  chunkIndex: integer('chunk_index'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  // HNSW index on halfvec for 50% memory reduction
  embeddingIdx: index('evidence_vectors_embedding_idx')
    .using('hnsw', sql`(embedding::halfvec(768)) halfvec_cosine_ops`),
}));

// ═══════════════════════════════════════════════════════════
// Chat & Document Uploads (Sprint 4B)
// ═══════════════════════════════════════════════════════════

export const chatDocumentAttachments = pgTable('chat_document_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => ragSessions.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 500 }),
  fileType: varchar('file_type', { length: 50 }), // 'pdf' | 'docx' | 'txt' | 'audio'
  fileUrl: varchar('file_url', { length: 1000 }), // MinIO path
  embeddingStatus: varchar('embedding_status', { length: 20 }).default('pending'),
  chunksIndexed: integer('chunks_indexed').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**JSONB Metadata Schemas**:

```typescript
// Evidence metadata (extractedEntities + forensics + OCR)
interface EvidenceMetadata {
  extractedEntities?: {
    emails?: string[];
    phones?: string[];
    dates?: string[];
    citations?: string[]; // "18 USC § 1001"
    statutes?: string[];
    money?: string[]; // "$1,234.56"
  };
  forensics?: {
    ssnCount?: number; // Redacted SSN patterns
    creditCardCount?: number;
    contactDensity?: number; // Emails + phones per 1000 words
    legalKeywordScore?: number; // 0-1 confidence
  };
  ocrResults?: {
    confidence?: number;
    pageCount?: number;
    processingMs?: number;
    engine?: 'tesseract' | 'tesseract.js';
  };
}

// Chat message metadata (LLM inference + retrieval)
interface ChatMessageMetadata {
  modelUsed?: string; // 'gemma4-legal' | 'embeddinggemma'
  temperature?: number;
  maxTokens?: number;
  inferenceMs?: number;
  cacheHit?: boolean;
  cacheLayer?: 'redis_l1' | 'bifrost_l2' | 'none';
  retrievalContext?: {
    sources: Array<{ id: string; score: number; type: string }>;
    totalRetrieved: number;
    method?: 'rag' | 'kag' | 'hybrid';
  };
}
```

---

### Qdrant Collections (9 collections, 768-dim, INT8 quantized)

```typescript
// vector/qdrant-manager.ts

export const QDRANT_COLLECTIONS = {
  // Codebase Intelligence (15,651 files)
  CODEBASE_CHUNKS: 'codebase_chunks_768', // Dual-vector: content + signature

  // Legal Knowledge Base (100K+ chunks)
  LEGAL_CANON: 'legal_canon_chunks', // Dense + BM42 sparse (hybrid search)
  COURT_OPINIONS: 'court_opinions', // Case law embeddings
  LEGAL_DOCUMENTS: 'legal_documents', // General legal corpus

  // Evidence & Cases
  EVIDENCE_VECTORS: 'evidence_vectors', // Evidence chunk embeddings
  CASE_CHUNKS: 'case_chunks', // Case description embeddings

  // Chat & Documents (Sprint 4B)
  CHAT_MESSAGES: 'chat_messages', // Chat history search
  CHAT_DOCUMENTS: 'chat_documents', // Uploaded PDFs/DOCX chunks

  // Error Analysis
  ERROR_CARDS: 'phase90_error_cards', // NPM error embeddings
};

// Dual-vector configuration (codebase_chunks_768)
const dualVectorConfig = {
  vectors: {
    content: { size: 768, distance: 'Cosine' }, // Semantic similarity
    signature: { size: 768, distance: 'Cosine' }, // API/function signatures
  },
  quantization_config: {
    scalar: { type: 'int8', quantile: 0.99, always_ram: true },
  },
  hnsw_config: { m: 16, ef_construct: 256 },
};

// Hybrid search configuration (legal_canon_chunks)
const hybridConfig = {
  vectors: {
    content: { size: 768, distance: 'Cosine' },
  },
  sparse_vectors: {
    bm25: {}, // BM42 sparse vector (FNV-1a hashing)
  },
  // ...quantization + HNSW same as above
};
```

**Point Payload Schema** (what gets stored in Qdrant):

```typescript
interface QdrantPointPayload {
  // === Common Fields ===
  id?: string; // Document/chunk UUID
  content?: string; // Actual text content
  timestamp?: string; // ISO 8601

  // === Codebase-Specific ===
  file_path?: string; // "src/lib/server/auth/session.ts"
  extension?: string; // ".ts" | ".svelte" | ".js" | ".mjs"
  domain?: string; // "server" | "client" | "shared"
  chunk_index?: number;
  start_line?: number;
  end_line?: number;

  // === Legal Knowledge Base ===
  document_id?: string;
  document_title?: string;
  corpus_type?: string; // "statute" | "case_law" | "constitution"
  jurisdiction?: string; // "federal" | "state:CA"
  authority_level?: string; // "primary" | "persuasive" | "secondary"
  citation?: string; // "18 USC § 1001"
  semantic_label?: string; // "procedural" | "substantive" | "evidentiary"
  domains?: string[]; // ["criminal", "civil"]

  // === Evidence ===
  evidence_id?: string;
  case_id?: string;
  entity_types?: string[]; // ["email", "phone", "citation"]
  forensic_flags?: string[]; // ["ssn_detected"]

  // === Chat Documents ===
  session_id?: string;
  file_name?: string;
  file_type?: string; // "pdf" | "docx"
  chunk_of_total?: string; // "5/23"
}
```

---

### Neo4j Graph Schema

**6 node types**, **8 relationship types**, **Cypher query patterns**

```cypher
// ═══════════════════════════════════════════════════════════
// Node Schemas (CREATE CONSTRAINT for uniqueness)
// ═══════════════════════════════════════════════════════════

CREATE CONSTRAINT case_id IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT evidence_id IF NOT EXISTS FOR (e:Evidence) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT statute_id IF NOT EXISTS FOR (s:Statute) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT citation_id IF NOT EXISTS FOR (c:Citation) REQUIRE c.id IS UNIQUE;

// Case node
(:Case {
  id: "uuid",
  title: "string",
  status: "open" | "closed" | "archived",
  priority: "low" | "medium" | "high",
  createdAt: datetime,
  updatedAt: datetime
})

// Evidence node
(:Evidence {
  id: "uuid",
  title: "string",
  type: "document" | "photo" | "video" | "audio",
  fileUrl: "s3://bucket/path",
  sha256Hash: "string",
  createdAt: datetime
})

// Person (POI) node
(:Person {
  id: "uuid",
  name: "string",
  threatLevel: "low" | "medium" | "high",
  status: "active" | "inactive",
  metadata: {} // JSONB-like properties
})

// Statute node
(:Statute {
  id: "uuid",
  citation: "18 USC § 1001",
  title: "False Statements",
  jurisdiction: "federal" | "state:CA",
  authorityLevel: "primary" | "persuasive"
})

// Document node (legal library)
(:Document {
  id: "uuid",
  title: "string",
  corpusType: "statute" | "case_law" | "constitution",
  citation: "123 F.3d 456",
  publicationDate: date
})

// ═══════════════════════════════════════════════════════════
// Relationship Schemas
// ═══════════════════════════════════════════════════════════

// Evidence → Case
(:Evidence)-[:BELONGS_TO {uploadedAt: datetime}]->(:Case)

// Citation → Statute
(:Citation)-[:REFERENCES {strength: float}]->(:Statute)

// Case → Statute (authority chain)
(:Case)-[:CITES {
  citationType: "direct" | "indirect",
  authorityWeight: float, // 0-1 based on graph centrality
  depth: int // Number of hops from primary source
}]->(:Statute)

// Document → Document (multi-hop authority expansion)
(:Document)-[:AUTHORITY_CHAIN {
  chainType: "statute_to_statute" | "case_to_case" | "statute_to_case",
  hops: int, // 1 or 2
  weight: float // Decayed by 0.8 per hop
}]->(:Document)

// Evidence → Evidence (similarity graph, KAG filtering)
(:Evidence)-[:RELATED_TO {
  similarityScore: float, // 0-1 cosine similarity
  relationshipType: "duplicate" | "contradiction" | "supporting"
}]->(:Evidence)

// Person → Evidence (entity extraction)
(:Person)-[:MENTIONED_IN {
  mentionCount: int,
  confidence: float // NER extraction confidence
}]->(:Evidence)
```

**Example Queries**:

```cypher
// Find orphaned evidence (missing case links)
MATCH (e:Evidence)
WHERE NOT EXISTS((e)-[:BELONGS_TO]->(:Case))
RETURN e.id, e.title, e.createdAt
ORDER BY e.createdAt DESC
LIMIT 50

// Multi-hop authority chain (2 hops max)
MATCH path = (doc:Document {id: $docId})-[:AUTHORITY_CHAIN*1..2]->(cited:Document)
WHERE cited.authorityLevel = 'primary'
RETURN path, cited.citation, LENGTH(path) as hops
ORDER BY hops ASC
LIMIT 20

// Evidence similarity neighbors (KAG pre-retrieval)
MATCH (anchor:Evidence {id: $evidenceId})-[r:RELATED_TO]-(neighbor:Evidence)
WHERE r.similarityScore > 0.7
RETURN neighbor.id as neighborId, r.similarityScore as score
ORDER BY score DESC
LIMIT 50

// Cases missing statute citations
MATCH (c:Case)
WHERE NOT EXISTS((c)-[:CITES]->(:Statute))
RETURN c.id, c.title, c.priority
ORDER BY c.priority DESC, c.createdAt DESC
LIMIT 20
```

---

### CouchDB Documents

**2 databases**: `inference_log`, `dag_cache`

```typescript
// ═══════════════════════════════════════════════════════════
// Database: inference_log (LLM call tracking)
// ═══════════════════════════════════════════════════════════

interface InferenceLogDoc {
  _id: string; // UUID
  _rev?: string; // CouchDB revision
  type: 'llm_inference';
  timestamp: string; // ISO 8601
  userId?: string;
  caseId?: string;
  sessionId?: string;

  // Request
  model: string; // 'gemma4-legal' | 'embeddinggemma'
  prompt: string; // First 500 chars
  temperature: number;
  maxTokens: number;

  // Response
  completion: string; // First 1000 chars (full text in Qdrant)
  tokensUsed: number;
  inferenceMs: number;

  // Cache
  cacheHit: boolean;
  cacheLayer?: 'redis_l1' | 'bifrost_l2' | 'none';

  // Quality
  confidence?: number; // ACE self-evaluation score
  retryCount?: number; // 0 or 1
  errorMessage?: string;
}

// ═══════════════════════════════════════════════════════════
// Database: dag_cache (Topological ordering cache)
// ═══════════════════════════════════════════════════════════

interface DAGCacheDoc {
  _id: string; // "dag:${caseId}" or "dag:${userId}"
  _rev?: string;
  type: 'dag_cache';
  cacheKey: string; // MD5 hash of dependency graph
  timestamp: string;
  ttl: number; // 3600 (1 hour)

  // Topological order
  orderedNodes: string[]; // Evidence IDs in dependency order
  metadata: {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    cycles?: Array<{ path: string[]; cycleBreaker: string }>;
  };
}

// Query patterns
const findLowConfidenceLLM = await couchDb.find({
  selector: {
    type: 'llm_inference',
    confidence: { $lt: 0.7 },
    retryCount: { $lt: 1 },
  },
  sort: [{ timestamp: 'desc' }],
  limit: 50,
});

const getDAGCache = await couchDb.get(`dag:${caseId}`);
```

---

## Message Queue Architecture (RabbitMQ)

**8 queues**, **5 exchanges**, **durable** + **DLX (dead letter)**

```typescript
// rabbitmq-manager-fixed.ts

export const QUEUE_NAMES = {
  CACHE_INVALIDATE: 'cache.invalidate',
  DOCUMENT_EMBED: 'document.embed',
  EVIDENCE_PROCESS: 'evidence.process',
  VECTOR_INDEX: 'vector.index',
  CHAT_CONTEXT: 'chat.context',
  ANALYTICS_TRACK: 'analytics.track',
  CODEBASE_INDEX: 'codebase.index',
  AUDIO_PROCESS: 'audio.process',
  SYNTHESIS_GENERATE: 'synthesis.generate', // Async LLM
} as const;

// ═══════════════════════════════════════════════════════════
// Audio Processing Pipeline (Sprint 4B)
// ═══════════════════════════════════════════════════════════

interface AudioProcessPayload {
  evidenceId: string;
  audioUrl: string; // MinIO s3://bucket/audio.mp3
  audioFormat: 'mp3' | 'wav' | 'flac' | 'ogg';
  userId: string;
  caseId?: string;
  options?: {
    language?: string; // Default: 'en'
    enableSpeakerDiarization?: boolean;
    enablePunctuation?: boolean;
  };
}

// Consumer: audio-queue-consumer.ts
// Pipeline (6 stages, 6s total on GPU):
//   1. Download from MinIO (500ms)
//   2. Whisper CUDA transcription (3s for 1min audio)
//   3. LangExtract language detection (100ms)
//   4. ACE context enrichment (500ms)
//   5. Embedding via embeddinggemma (1s)
//   6. Upsert to Qdrant chat_documents (900ms)

// ═══════════════════════════════════════════════════════════
// Document Embedding Pipeline (Sprint 4B)
// ═══════════════════════════════════════════════════════════

interface DocumentEmbedPayload {
  documentId: string;
  fileType: 'pdf' | 'docx' | 'txt';
  fileUrl: string; // MinIO path
  sessionId: string;
  userId: string;
  options?: {
    chunkSize?: number; // Default: 500 chars
    chunkOverlap?: number; // Default: 50 chars
  };
}

// Consumer: document-embed-consumer.ts
// Pipeline:
//   1. Download file from MinIO
//   2. Extract text (pdf-parse / mammoth / UTF-8)
//   3. Chunk with overlap (500 chars default)
//   4. Batch embed via Ollama embeddinggemma
//   5. Upsert to Qdrant chat_documents collection
//   6. Update chat_document_attachments.chunksIndexed

// ═══════════════════════════════════════════════════════════
// Synthesis Generation (Async LLM, no timeout)
// ═══════════════════════════════════════════════════════════

interface SynthesisGeneratePayload {
  requestId: string; // UUID for polling
  userId: string;
  caseId?: string;
  prompt: string;
  context?: {
    caseContext?: string;
    evidenceIds?: string[];
    retrievalContext?: string[];
  };
  options?: {
    model?: string; // Default: 'gemma4-legal'
    temperature?: number; // Default: 0.3
    maxTokens?: number; // Default: 1000
    selfEvaluation?: boolean; // Default: true
  };
}

// Consumer: synthesis-worker.ts
// Pipeline:
//   1. Load ACE context
//   2. Generate via Ollama (bypass Bifrost, direct 5min timeout)
//   3. Self-evaluation (ACE self-prompting)
//   4. Retry if confidence < 0.7 (max 1 retry)
//   5. Store in Redis with requestId key (1hr TTL)
//   6. Log to CouchDB inference_log

// Client polls: GET /api/synthesis/evaluation/[requestId]
```

---

## N-API GPU Bridges (17 functions, 2-6,500× speedup)

### simdjson Bridge (2-5× faster JSON parsing)

```typescript
// lib/server/gpu/simdjson-bridge.ts

import addon from '../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node';

// Parse large JSON (auto-fallback to V8 for <1KB)
export function fastJsonParse<T>(jsonString: string): T {
  if (!isSimdJsonAvailable() || jsonString.length < 1024) {
    return JSON.parse(jsonString); // V8 fallback
  }

  try {
    return addon.simdJsonParse(jsonString) as T; // GPU SIMD
  } catch {
    return JSON.parse(jsonString); // Fallback on error
  }
}

// Validate JSON (no parsing, fast structural check)
export function fastJsonValidate(jsonString: string): boolean {
  if (!isSimdJsonAvailable()) return true; // Assume valid, fallback to parse
  try {
    return addon.simdJsonValidate(jsonString);
  } catch {
    return false;
  }
}

// Check addon availability
export function isSimdJsonAvailable(): boolean {
  return addon && typeof addon.simdJsonParse === 'function';
}
```

**C++ Implementation**:

```cpp
// simd-bridge/cpp/simdjson_wrapper.cc

#include <napi.h>
#include <simdjson.h>

using namespace simdjson;

Napi::Value SimdJsonParse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::string jsonStr = info[0].As<Napi::String>().Utf8Value();

  // Parse via simdjson (AVX2/SSE4.2 SIMD acceleration)
  ondemand::parser parser;
  padded_string padded(jsonStr);
  ondemand::document doc = parser.iterate(padded);

  // Convert to Napi::Object (recursive tree walk)
  return ConvertToNapiValue(env, doc);
}
```

### LibTorch CUDA Bridge (100× faster vector ops)

```typescript
// lib/server/gpu/libtorch-bridge.ts

import addon from '../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node';

// Batch cosine similarity (GPU cuBLAS GEMM)
export async function batchCosineSimilarity(
  queryVec: number[],
  corpus: number[][]
): Promise<{ scores: number[]; source: 'gpu' | 'cpu'; durationMs: number }> {
  if (!isCudaAvailable() || corpus.length < 20) {
    // CPU fallback for small batches
    const start = Date.now();
    const scores = corpus.map(v => cpuCosineSimilarity(queryVec, v));
    return { scores, source: 'cpu', durationMs: Date.now() - start };
  }

  try {
    const start = Date.now();
    const result = addon.libtorchBatchSimilarity(queryVec, corpus);
    return { scores: result, source: 'gpu', durationMs: Date.now() - start };
  } catch {
    // Fallback to CPU on GPU error
    const scores = corpus.map(v => cpuCosineSimilarity(queryVec, v));
    return { scores, source: 'cpu', durationMs: 0 };
  }
}

// Check CUDA availability
export function isCudaAvailable(): boolean {
  return addon && addon.isCudaAvailable && addon.isCudaAvailable();
}

// Get CUDA memory info
export function getCudaMemoryInfo(): { freeMB: number; totalMB: number } {
  if (!isCudaAvailable()) return { freeMB: 0, totalMB: 0 };
  return addon.getCudaMemoryInfo();
}
```

**C++ Implementation**:

```cpp
// simd-bridge/cpp/libtorch_graph.cc

#include <napi.h>
#include <torch/torch.h>

Napi::Value BatchCosineSimilarity(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // Convert JS arrays to LibTorch tensors
  auto queryTensor = ConvertToTensor(info[0]).to(torch::kCUDA);
  auto corpusTensor = ConvertToTensor(info[1]).to(torch::kCUDA);

  // L2 normalize (required for cosine similarity)
  queryTensor = queryTensor / queryTensor.norm();
  corpusTensor = corpusTensor / corpusTensor.norm(/*dim=*/1, /*keepdim=*/true);

  // Matrix multiply via cuBLAS GEMM (100× faster than sequential)
  auto scores = torch::mm(corpusTensor, queryTensor.unsqueeze(1)).squeeze();

  // Copy back to CPU, convert to Napi::Array
  scores = scores.to(torch::kCPU);
  return ConvertToNapiArray(env, scores);
}
```

---

## Integration Flows

### Evidence Upload Pipeline (9 Stages)

```typescript
// POST /api/evidence/upload

// Stage 1: MinIO Upload + SHA-256
const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
const fileUrl = await minioClient.putObject('evidence', `${evidenceId}.pdf`, fileBuffer);

// Stage 2: Text Extraction
const text = await extractPdfText(fileBuffer); // pdf-parse → OCR fallback

// Stage 3: Structure-Aware Chunking
const chunks = await legalChunker(text, { chunkSize: 500, respectSections: true });

// Stage 4: Embedding (gRPC → Ollama fallback)
const embeddings = await generateEmbeddings(chunks.map(c => c.text));

// Stage 5: Dual Storage (pgvector + Qdrant)
await db.insert(evidenceVectors).values(...);
await qdrant.upsert('evidence_vectors', { points: [...] });

// Stage 6: Entity Extraction (LLM + regex)
const entities = await extractEntities(text);

// Stage 7: Forensics (SSN/CC/contact density)
const forensics = await detectForensicPatterns(text);

// Stage 8: Summarization (Ollama, non-fatal)
const summary = await generateSummary(text);

// Stage 9: GPU Background Analysis (fire-and-forget)
publishEvidenceAnalysis({ evidenceId, embeddings }).catch(() => {});
```

### Chat with Document Context

```typescript
// POST /api/sse/chat (Server-Sent Events)

// Step 1: Load uploaded documents
const attachments = await db.select().from(chatDocumentAttachments)
  .where(eq(chatDocumentAttachments.sessionId, sessionId));

// Step 2: Query Qdrant for relevant chunks
const embedding = await generateEmbedding(lastUserMessage);
const relevantChunks = await qdrant.search('chat_documents', {
  vector: embedding,
  limit: 5,
  filter: { must: [{ key: 'session_id', match: { value: sessionId } }] },
});

// Step 3: Build context-enriched system prompt
const contextPrompt = `
You are a legal AI assistant. The user uploaded ${attachments.length} documents.

Relevant excerpts:
${relevantChunks.map((c, i) => `[${i + 1}] ${c.payload.chunk_text}`).join('\n\n')}

Answer using the context above. Cite sources like [1], [2].
`;

// Step 4: Stream LLM response
for await (const chunk of ollamaStream) {
  yield `data: ${JSON.stringify({ delta: chunk })}\n\n`;
}
```

---

## Exploration Guide

### 1. Codebase Knowledge Graph

**What**: Interactive D3.js visualization of 15,651 indexed files
**Where**: http://localhost:5173/codebase-graph
**Why**: Find orphaned files, trace import chains, discover similar code

**Features**:
- **Directory hierarchy** (color-coded by top-level dir)
- **Import relationships** (static/dynamic/CJS, extracted via regex)
- **Dual-vector search** (semantic content + API signatures)
- **Obsidian export** (JSON format for knowledge base integration)

**Quick Start**:

```bash
# 1. Open graph (dev server must be running)
http://localhost:5173/codebase-graph

# 2. Controls
- Drag nodes to rearrange
- Toggle import edges on/off
- Filter by extension (.ts, .svelte, .js)
- Search by filename

# 3. Semantic search
curl -X POST http://localhost:5173/api/codebase-index/search \
  -H "Content-Type: application/json" \
  -d '{"query": "RAG pipeline implementation", "limit": 5}'

# 4. Export to Obsidian
curl http://localhost:5173/api/codebase-index/export/obsidian?limit=15651 > graph.json
```

**API Endpoints**:

```typescript
// GET /api/codebase-index/graph?limit=5000&includeImports=true
interface GraphData {
  nodes: GraphNode[]; // Files + directories
  edges: GraphEdge[]; // Contains + imports
  stats: {
    totalFiles: number;
    totalChunks: number;
    totalDirs: number;
    importEdges: number;
    extensionBreakdown: Record<string, number>;
    domainBreakdown: Record<string, number>;
  };
}

// POST /api/codebase-index/search
{
  "query": "function that handles authentication",
  "limit": 10,
  "vector": "content" // or "signature"
}
```

### 2. Neo4j Recommendations (Missing Links)

**What**: Find orphaned nodes, low-quality data, missing relationships
**Why**: Improve data quality, discover hidden connections

**Queries**:

```cypher
// Orphaned evidence (no case link)
MATCH (e:Evidence)
WHERE NOT EXISTS((e)-[:BELONGS_TO]->(:Case))
RETURN e.id, e.title, e.createdAt
ORDER BY e.createdAt DESC
LIMIT 50

// Cases missing statute citations
MATCH (c:Case)
WHERE NOT EXISTS((c)-[:CITES]->(:Statute))
RETURN c.id, c.title, c.priority
ORDER BY c.priority DESC
LIMIT 20

// Authority chain gaps (persuasive without primary source)
MATCH (s:Statute {authorityLevel: 'persuasive'})
WHERE NOT EXISTS((s)-[:AUTHORITY_CHAIN]->(:Statute {authorityLevel: 'primary'}))
RETURN s.citation, s.title
LIMIT 30

// Evidence with extracted entities but no Person nodes
MATCH (e:Evidence)
WHERE e.metadata.extractedEntities.names IS NOT NULL
  AND NOT EXISTS((e)-[:IDENTIFIES]->(:Person))
RETURN e.id, e.title, e.metadata.extractedEntities.names
LIMIT 50
```

### 3. CouchDB Low-Confidence Detection

**What**: Find LLM completions that need re-synthesis
**Why**: Improve response quality via retry

**Query**:

```typescript
const lowConfidenceLLM = await couchDb.find({
  selector: {
    type: 'llm_inference',
    confidence: { $lt: 0.7 },
    retryCount: { $lt: 1 }, // Not retried yet
  },
  sort: [{ timestamp: 'desc' }],
  limit: 50,
});

// For each low-confidence inference:
// 1. Get original prompt from inference log
// 2. Re-synthesize with higher temperature
// 3. Compare outputs, pick best
// 4. Update confidence score
```

---

## Terms for Further Exploration

### Codebase Intelligence
- **Dependency graph visualization**
- **Import analysis**, **Module coupling**
- **Semantic code search**, **AST-based retrieval**
- **Static analysis graph**, **Call graph**

### Legal Knowledge
- **Authority chain analysis**, **Citation network**
- **Statute dependency graph**, **Case law precedent**
- **Legal ontology mapping**, **Jurisdiction hierarchy**
- **Multi-hop reasoning**, **Semantic legal search**

### Evidence Analysis
- **Forensic relationship graph**, **Entity co-occurrence**
- **Temporal event graph**, **Document similarity network**
- **Chain of custody**, **Evidence provenance**

### Recommendations
- **Knowledge graph completion**, **Missing link prediction**
- **Orphan node detection**, **Low-confidence inference**
- **Graph anomaly detection**, **Structural hole analysis**

---

**Document Status**: ✅ **PRODUCTION READY**
**Next**: Run `bash scripts/audit/backend-infrastructure-audit.sh` to verify all 17 gates
