# Legal Search System - Design Document

## Overview

The Legal Search System is a full-stack platform for semantic and keyword search across statutes and criminal case law. It ingests PDFs, chunks them using LangExtract section boundaries, stores embeddings in Qdrant with crime-aware metadata, and exposes hybrid search via a Go microservice. The SvelteKit 2 frontend provides a browsable law library by state, and the LLM can invoke agentic search functions.

### Key Design Principles

1. **Section-Aware Chunking**: Use LangExtract to identify logical sections (facts, motions, bibliography, etc.) and apply sliding windows for long sections.
2. **Crime-Aware Metadata**: Extract and store crime code, category, classification, and sentencing for precise filtering.
3. **Hybrid Search**: Combine Qdrant (semantic) and Elasticsearch (keyword) with RRF ranking.
4. **Microservice Architecture**: Go microservice handles search orchestration and merging.
5. **Agentic Integration**: Expose search functions to LLM for autonomous retrieval.

## Architecture

### High-Level Data Flow

```
PDF Ingestion (MinIO: minio_bucket_laws)
    ↓
LangExtract (section identification)
    ↓
Chunking (sliding window per section)
    ↓
Embedding Generation (Gemma3 embeddings)
    ↓
Parallel Storage:
    ├─ PostgreSQL (cases, crimes, laws, lawSections, pgvector embeddings)
    ├─ MinIO (parsed text, metadata JSON)
    ├─ Qdrant (case chunks with crime metadata, HNSW indexing)
    ├─ Elasticsearch (full-text index)
    └─ Redis (echo cache: top-k hits, popular searches)
    ↓
RabbitMQ Clustering Job (NEW_DATA event)
    ↓
XState v5 Orchestration (waiting → queue → clustering → tagging → indexing → complete)
    ↓
SOM + K-Means Clustering (emergent categories + crisp labels)
    ↓
Qdrant Update (store cluster labels in payloads)
    ↓
IndexedDB Sync (browser-side cache: metadata, keywords, echo hits, labels)
    ↓
Go Microservice (hybrid search orchestration with echo ranking)
    ↓
SvelteKit 2 Frontend (/laws routes with autocomplete)
    ↓
Browser ONNX Agents (offline inference: category suggestions, embeddings)
    ↓
Agentic Function Calls (LLM search with cluster filters)
```

### Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    SvelteKit 2 Frontend                           │
│  (/laws, /laws/[state], /laws/[state]/[sectionId])               │
│  - Browse statutes by state                                       │
│  - View related cases                                             │
│  - Search with filters + autocomplete                             │
│  - IndexedDB cache + ONNX offline inference                       │
└────────────────────┬─────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ↓                         ↓
┌──────────────────┐    ┌──────────────────────┐
│   IndexedDB      │    │  Browser ONNX Agents │
│  (Metadata,      │    │  (gemma-3-270m-onnx) │
│   Keywords,      │    │  (embeddinggemma)    │
│   Echo Hits,     │    │  (offline inference) │
│   Labels)        │    └──────────────────────┘
└──────────────────┘
        ↑
        │
        ↓
┌─────────────────────────────────────────────────────────────┐
│              Go Microservice (gRPC + REST)                   │
│  - /search/cases (hybrid search + echo ranking)              │
│  - /search/laws (statute search + cluster filters)           │
│  - Orchestrates Qdrant + ES queries                          │
│  - Merges results via RRF                                    │
│  - Applies Redis echo cache boost                            │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬────────────┐
        ↓            ↓            ↓            ↓
    ┌────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐
    │ Qdrant │  │Elasticsearch│ PostgreSQL │ │ Redis  │
    │(Cosine)│  │(Full-text) │ (Metadata) │ │(Echo)  │
    │(HNSW)  │  │(BM25)      │ (pgvector) │ │(Cache) │
    │(Labels)│  │(Labels)    │            │ │        │
    └────────┘  └──────────┘  └──────────┘  └────────┘
        ↑            ↑            ↑
        └────────────┼────────────┘
                     │
        ┌────────────┴────────────┐
        ↓                         ↓
┌──────────────────┐    ┌──────────────────────┐
│ Ingestion Worker │    │  RabbitMQ + XState   │
│ (LangExtract)    │    │  Clustering Pipeline │
│ (Chunking)       │    │  (SOM + K-Means)     │
│ (Embedding)      │    │  (Label Assignment)  │
│ (MinIO Storage)  │    │  (Qdrant Update)     │
└──────────────────┘    └──────────────────────┘
        ↑                         ↑
        │                         │
        └─────────────┬───────────┘
                      ↓
            ┌──────────────────┐
            │  LLM Agentic     │
            │  Function Calls  │
            │  (search_cases)  │
            │  (search_laws)   │
            └──────────────────┘
```

## Components and Interfaces

### 1. PostgreSQL Schema (Drizzle ORM)

#### Cases Table
```typescript
cases {
  id: uuid (PK)
  externalId: text (unique case identifier, e.g., docket)
  caseName: text (e.g., "People v. Smith")
  jurisdiction: text (e.g., "CA", "US")
  courtName: text (e.g., "Cal. Ct. App., 2nd Dist.")
  decisionDate: timestamp
  rawDocMinioKey: text (path to original PDF in MinIO)
  langextractJsonMinioKey: text (path to LangExtract JSON)
  langextractHtmlMinioKey: text (path to LangExtract HTML)
  langextractSummary: jsonb (extracted metadata)
  createdAt: timestamp
}
```

#### Crimes Table
```typescript
crimes {
  id: uuid (PK)
  caseId: uuid (FK → cases.id)
  crimeCode: text (e.g., "PC 211")
  crimeCategory: text (e.g., "robbery", "drug", "homicide")
  crimeClassification: text (felony | misdemeanor | infraction | wobbler)
  attempted: boolean
  sentencingYear: integer
  sentenceLengthMonths: integer
  enhancements: jsonb (array of enhancement strings)
}
```

#### Laws Table
```typescript
laws {
  id: uuid (PK)
  jurisdiction: text (e.g., "CA", "NY", "US")
  codeTitle: text (e.g., "Penal Code")
  codeAbbrev: text (e.g., "PC")
  codeEdition: text (e.g., "2024")
  createdAt: timestamp
}
```

#### LawSections Table
```typescript
lawSections {
  id: uuid (PK)
  lawId: uuid (FK → laws.id)
  sectionNumber: text (e.g., "211")
  fullCitation: text (e.g., "PC § 211")
  heading: text (e.g., "Robbery")
  text: text (full statute text)
  embedding: vector(768) (pgvector column)
  langextractSummary: jsonb
  createdAt: timestamp
}
```

#### CaseChunks Table (for tracking)
```typescript
caseChunks {
  id: uuid (PK)
  caseId: uuid (FK → cases.id)
  chunkIndex: integer
  sectionType: text (facts | issues | reasoning | holding | citations | parties | motions | bibliography | procedural_history | sentencing | judgment)
  sectionSubtype: text (optional, e.g., "motion_to_suppress")
  text: text (chunk content)
  embedding: vector(768) (pgvector column)
  tokenStart: integer
  tokenEnd: integer
  createdAt: timestamp
}
```

### 2. Qdrant Collection Schema

#### Collection: case_chunks
```json
{
  "name": "case_chunks",
  "vector_size": 768,
  "distance": "Cosine",
  "hnsw_config": {
    "m": 16,
    "ef_construct": 200,
    "ef_search": 100
  },
  "payload_schema": {
    "doc_id": { "type": "keyword" },
    "case_id": { "type": "keyword" },
    "chunk_id": { "type": "keyword" },
    "jurisdiction": { "type": "keyword" },
    "court_name": { "type": "keyword" },
    "decision_year": { "type": "integer" },
    "section_type": { "type": "keyword" },
    "section_subtype": { "type": "keyword" },
    "crime_code": { "type": "keyword" },
    "crime_category": { "type": "keyword" },
    "crime_classification": { "type": "keyword" },
    "sentencing_year": { "type": "integer" },
    "sentence_length_months": { "type": "integer" },
    "entities": {
      "type": "object",
      "properties": {
        "party": { "type": "array" },
        "statute": { "type": "array" },
        "judge": { "type": "array" }
      }
    }
  }
}
```

#### Collection: law_sections
```json
{
  "name": "law_sections",
  "vector_size": 768,
  "distance": "Cosine",
  "hnsw_config": { "m": 16, "ef_construct": 200, "ef_search": 100 },
  "payload_schema": {
    "law_id": { "type": "keyword" },
    "section_id": { "type": "keyword" },
    "jurisdiction": { "type": "keyword" },
    "code_abbrev": { "type": "keyword" },
    "section_number": { "type": "keyword" },
    "full_citation": { "type": "keyword" }
  }
}
```

### 3. Elasticsearch Index Schema

#### Index: case_chunks
```json
{
  "mappings": {
    "properties": {
      "text": { "type": "text", "analyzer": "standard" },
      "section_type": { "type": "keyword" },
      "section_subtype": { "type": "keyword" },
      "crime_code": { "type": "keyword" },
      "crime_category": { "type": "keyword" },
      "crime_classification": { "type": "keyword" },
      "jurisdiction": { "type": "keyword" },
      "court_name": { "type": "keyword" },
      "decision_year": { "type": "integer" },
      "sentencing_year": { "type": "integer" },
      "sentence_length_months": { "type": "integer" },
      "entities": {
        "type": "object",
        "properties": {
          "party": { "type": "keyword" },
          "statute": { "type": "keyword" },
          "judge": { "type": "keyword" }
        }
      }
    }
  }
}
```

#### Index: law_sections
```json
{
  "mappings": {
    "properties": {
      "text": { "type": "text", "analyzer": "standard" },
      "jurisdiction": { "type": "keyword" },
      "code_abbrev": { "type": "keyword" },
      "section_number": { "type": "keyword" },
      "full_citation": { "type": "keyword" },
      "heading": { "type": "text" }
    }
  }
}
```

### 4. Go Microservice Interfaces

#### gRPC Protobuffer Schema (search.proto)
```protobuf
syntax = "proto3";

package legal.search;

service SearchService {
  rpc SearchCases(SearchCasesRequest) returns (SearchCasesResponse);
  rpc SearchLaws(SearchLawsRequest) returns (SearchLawsResponse);
}

message SearchCasesRequest {
  string query = 1;
  string jurisdiction = 2;
  string crime_category = 3;
  string crime_classification = 4;
  string section_type = 5;
  int32 limit = 6;
}

message CaseChunk {
  string chunk_id = 1;
  string case_id = 2;
  string case_name = 3;
  string text = 4;
  string section_type = 5;
  string crime_code = 6;
  string crime_category = 7;
  float score = 8;
  map<string, string> metadata = 9;
}

message SearchCasesResponse {
  repeated CaseChunk chunks = 1;
  int32 total = 2;
}

message SearchLawsRequest {
  string query = 1;
  string state = 2;
  string code_abbrev = 3;
  int32 limit = 4;
}

message LawSection {
  string section_id = 1;
  string full_citation = 2;
  string heading = 3;
  string text = 4;
  float score = 5;
}

message SearchLawsResponse {
  repeated LawSection sections = 1;
  int32 total = 2;
}
```

#### REST Endpoints
- `POST /search/cases` → SearchCasesRequest → SearchCasesResponse
- `POST /search/laws` → SearchLawsRequest → SearchLawsResponse
- `GET /health` → health check

### 5. SvelteKit 2 Routes

#### `/laws` (Browse all states)
- Load jurisdictions from PostgreSQL
- Display state cards with statute counts

#### `/laws/[state]` (Browse statutes by state)
- Load all codes for the state
- Display code cards with section counts
- Search/filter UI

#### `/laws/[state]/[sectionId]` (View statute details)
- Display statute text
- Show related cases (query Go microservice with crime_code filter)
- Display similar statutes (semantic search)

#### `/api/search/cases` (SvelteKit API route)
- Proxy to Go microservice
- Handle authentication/rate limiting

#### `/api/search/laws` (SvelteKit API route)
- Proxy to Go microservice

### 6. MinIO Bucket Structure

```
minio_bucket_laws/
  ├─ CA/PC/211.pdf                    (raw statute PDF)
  ├─ CA/PC/459.pdf
  ├─ US/USC/18/1201.pdf
  └─ cases/CA/2024-001/chunk_0.pdf    (case file chunks)

minio_bucket_laws_parsed/
  ├─ CA/PC/211.txt                    (extracted text)
  ├─ CA/PC/459.txt
  └─ cases/CA/2024-001/chunk_0.txt

minio_bucket_laws_metadata/
  ├─ CA/PC/211.json                   (LangExtract output + crime metadata)
  ├─ CA/PC/459.json
  └─ cases/CA/2024-001/chunk_0.json
```

### 7. Redis Echo Cache Schema

```
statute:echo:18:1201 → { hits: 28, last: 1700000123, score_boost: 4.2 }
statute:echo:18:1202 → { hits: 15, last: 1700000100, score_boost: 2.25 }
case:echo:CA-2024-001 → { hits: 42, last: 1700000150, score_boost: 6.3 }

Ranking formula: semantic_score + (echo_hits * 0.15)
TTL: 5 minutes (configurable)
```

### 8. RabbitMQ Clustering Job Schema

```json
{
  "event": "NEW_DATA",
  "chunkCount": 150,
  "timestamp": "2024-11-21T10:30:00Z",
  "jobId": "uuid",
  "payload": {
    "chunkIds": ["chunk_1", "chunk_2", ...],
    "embeddingDim": 768,
    "somGridSize": 10,
    "kmeansK": 8
  }
}
```

### 9. XState v5 Clustering Machine

```typescript
const clusterMachine = createMachine({
  id: "statuteCluster",
  initial: "waiting",
  states: {
    waiting: {
      on: { NEW_DATA: "queue" }
    },
    queue: {
      invoke: {
        src: "enqueueJob",
        onDone: { target: "clustering" },
        onError: { target: "error" }
      }
    },
    clustering: {
      invoke: {
        src: "runSOMandKMeans",
        onDone: { target: "tagging" },
        onError: { target: "error" }
      }
    },
    tagging: {
      invoke: {
        src: "updateQdrantLabels",
        onDone: { target: "indexing" },
        onError: { target: "error" }
      }
    },
    indexing: {
      invoke: {
        src: "exportIndexedDB",
        onDone: { target: "complete" },
        onError: { target: "error" }
      }
    },
    complete: {
      type: "final",
      entry: "emitClusteringComplete"
    },
    error: {
      on: { RETRY: "queue" },
      entry: "logError"
    }
  }
});
```

### 10. IndexedDB Schema

```typescript
// Store: statute_index
{
  keyPath: "id",
  indexes: [
    { name: "slug", keyPath: "slug" },
    { name: "category", keyPath: "category" },
    { name: "jurisdiction", keyPath: "jurisdiction" }
  ]
}

// Record structure
{
  id: "CA-PC-211",
  titleNumber: 18,
  section: "211",
  slug: "kidnapping",
  fullCitation: "PC § 211",
  heading: "Robbery",
  keywords: ["ransom", "victim", "transport", "interstate"],
  category: "violent crime",
  som_cluster_id: 3,
  kmeans_label: "violent_crime",
  cluster_confidence: 0.92,
  echo_hits: 28,
  embedding_quantized: [0.1, 0.2, ...], // 8-bit quantized
  lastUpdated: 1700000123
}
```

### 11. LangExtract Integration

#### Chunking Pipeline
```typescript
interface LangExtractOutput {
  doc_id: string;
  sections: Array<{
    section_type: SectionType;
    section_subtype?: string;
    text: string;
    start_offset: number;
    end_offset: number;
  }>;
  metadata: {
    crime_code?: string;
    crime_category?: string;
    crime_classification?: string;
    sentencing_year?: number;
    sentence_length_months?: number;
    enhancements?: string[];
  };
}

function chunkSection(
  sectionText: string,
  sectionType: SectionType,
  tokenizer: Tokenizer,
  maxTokens: number = 1024,
  overlapTokens: number = 128
): Chunk[] {
  const tokens = tokenizer.encode(sectionText);
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < tokens.length) {
    const end = Math.min(start + maxTokens, tokens.length);
    const chunkTokens = tokens.slice(start, end);
    const chunkText = tokenizer.decode(chunkTokens);

    chunks.push({
      section_type: sectionType,
      text: chunkText,
      token_start: start,
      token_end: end,
    });

    if (end === tokens.length) break;
    start = end - overlapTokens;
  }

  return chunks;
}
```

## Data Models

### Chunk Model
```typescript
interface Chunk {
  id: string;
  caseId: string;
  chunkIndex: number;
  sectionType: SectionType;
  sectionSubtype?: string;
  text: string;
  embedding: number[]; // 768-dim
  tokenStart: number;
  tokenEnd: number;
  metadata: {
    crimeCode?: string;
    crimeCategory?: string;
    crimeClassification?: string;
    sentencingYear?: number;
    sentenceLengthMonths?: number;
    entities?: {
      party?: string[];
      statute?: string[];
      judge?: string[];
    };
  };
}
```

### Search Result Model
```typescript
interface SearchResult {
  chunkId: string;
  caseId: string;
  caseName: string;
  text: string;
  sectionType: SectionType;
  crimeCode: string;
  crimeCategory: string;
  score: number; // RRF-merged score
  source: "qdrant" | "elasticsearch" | "merged";
  metadata: Record<string, any>;
}
```

## Error Handling

### Ingestion Errors
- **LangExtract Failure**: Log error, fall back to heuristic section detection.
- **Embedding Generation Failure**: Retry with exponential backoff; skip chunk if max retries exceeded.
- **Database Write Failure**: Log error, alert operator; do not proceed to Qdrant/ES indexing.

### Search Errors
- **Qdrant Unavailable**: Fall back to Elasticsearch only.
- **Elasticsearch Unavailable**: Fall back to Qdrant only.
- **Both Unavailable**: Return error to client; suggest retry.

### Consistency Errors
- **Qdrant/ES Out of Sync**: Implement periodic reconciliation job to detect and fix mismatches.
- **Stale Embeddings**: Implement versioning; invalidate old embeddings on model updates.

## Testing Strategy

### Unit Tests
- **Chunking Logic**: Test sliding window with various token counts and overlaps.
- **Metadata Extraction**: Test LangExtract output parsing and crime code extraction.
- **RRF Ranking**: Test merging and ranking of Qdrant and ES results.

### Integration Tests
- **End-to-End Ingestion**: Upload PDF → LangExtract → Chunk → Embed → Store in PostgreSQL/Qdrant/ES.
- **Search Pipeline**: Query → Go microservice → Qdrant + ES → Merge → Return results.
- **SvelteKit Routes**: Load `/laws` → `/laws/[state]` → `/laws/[state]/[sectionId]` → verify data.

### Performance Tests
- **Chunking Throughput**: Measure chunks/second for 1,000 PDFs.
- **Search Latency**: Measure p50/p95/p99 latency for Qdrant + ES queries.
- **Embedding Generation**: Measure embeddings/second with Gemma3.

