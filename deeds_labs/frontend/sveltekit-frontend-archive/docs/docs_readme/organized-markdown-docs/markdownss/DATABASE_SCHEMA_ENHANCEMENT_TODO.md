# Database Schema Enhancement TODO

## Overview
This document details the specific enhancements needed for the simplified database schema files that were created to resolve TypeScript errors.

---

## 🗄️ VECTOR SCHEMA SIMPLE (`vector-schema-simple.ts`)

### Current State
Basic table definitions without advanced Drizzle ORM features:
- Simple column types (uuid, varchar, text, jsonb, timestamp)
- No advanced constraints or relationships
- Missing pgvector column types
- No performance indexes
- Basic type inference

### 🔧 ENHANCEMENTS TO IMPLEMENT

#### 1. Advanced Column Types & Constraints
```typescript
// CURRENT (simplified):
export const documentEmbeddings = pgTable("document_embeddings_simple", {
  evidenceId: uuid("evidence_id").notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding").notNull(),
});

// ENHANCED (to implement):
export const documentEmbeddings = pgTable(
  "document_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { 
      onDelete: 'cascade' 
    }),
    documentType: varchar("document_type", { length: 50 }).notNull(),
    chunkText: text("chunk_text").notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    embedding: vector("embedding", { dimensions: 1536 }), // pgvector type
    titleEmbedding: vector("title_embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata").default({}),
    isActive: boolean("is_active").default(true),
  },
  (table) => ({
    // Performance indexes
    documentIdx: index("document_id_idx").on(table.documentId),
    embeddingGistIdx: index("embedding_gist_idx").on(table.embedding).using("gist"),
    typeIdx: index("document_type_idx").on(table.documentType),
    createdAtIdx: index("created_at_idx").on(table.createdAt),
    
    // Composite indexes for common queries
    docTypeCreatedIdx: index("doc_type_created_idx").on(table.documentType, table.createdAt),
    
    // Unique constraints
    chunkUniqueIdx: unique("document_chunk_unique").on(table.documentId, table.chunkIndex),
  })
);
```

#### 2. Advanced Relationships & Foreign Keys
```typescript
// WIRING: Proper table relationships
export const documentEmbeddingRelations = relations(documentEmbeddings, ({ one, many }) => ({
  document: one(documents, {
    fields: [documentEmbeddings.documentId],
    references: [documents.id],
  }),
  similarities: many(vectorSimilarities),
  searchResults: many(searchQueries),
}));

// Cross-reference tables
export const vectorSimilarities = pgTable(
  "vector_similarities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceEmbeddingId: uuid("source_embedding_id").notNull(),
    targetEmbeddingId: uuid("target_embedding_id").notNull(),
    similarity: real("similarity").notNull(),
    calculatedAt: timestamp("calculated_at").defaultNow(),
  },
  (table) => ({
    sourceIdx: index("similarity_source_idx").on(table.sourceEmbeddingId),
    targetIdx: index("similarity_target_idx").on(table.targetEmbeddingId),
    similarityIdx: index("similarity_score_idx").on(table.similarity),
  })
);
```

#### 3. Vector-Specific Enhancements
```typescript
// PGVECTOR INTEGRATION
import { vector } from 'drizzle-orm/pg-core'; // Custom pgvector type

// Enhanced embedding columns with proper vector types
embedding: vector("embedding", { 
  dimensions: 1536,
  distanceFunction: 'cosine' // or 'euclidean', 'manhattan'
}),

// Vector operation helpers
export const vectorOperations = {
  cosineDistance: (a: PgColumn, b: number[]) => 
    sql<number>`${a} <=> ARRAY[${sql.raw(b.join(','))}]::vector`,
  
  euclideanDistance: (a: PgColumn, b: number[]) => 
    sql<number>`${a} <-> ARRAY[${sql.raw(b.join(','))}]::vector`,
  
  innerProduct: (a: PgColumn, b: number[]) => 
    sql<number>`${a} <#> ARRAY[${sql.raw(b.join(','))}]::vector`,
};
```

#### 4. Performance Optimization
```typescript
// MATERIALIZED VIEWS for common queries
export const popularSearches = pgMaterializedView("popular_searches")
  .as((qb) => 
    qb.select({
      query: searchQueries.query,
      count: sql<number>`count(*)`.as('search_count'),
      avgSimilarity: sql<number>`avg(similarity)`.as('avg_similarity'),
    })
    .from(searchQueries)
    .groupBy(searchQueries.query)
    .having(sql`count(*) > 10`)
  );

// PARTITIONING for large tables
export const embeddingsByMonth = pgTable(
  "embeddings_partitioned",
  {
    // ... columns
  },
  (table) => ({
    partitionByMonth: sql`PARTITION BY RANGE (EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at))`,
  })
);
```

#### 5. Advanced Types & Validation
```typescript
// ENHANCED TYPE DEFINITIONS
export type DocumentEmbeddingInsert = typeof documentEmbeddings.$inferInsert & {
  embedding: number[]; // Ensure proper array type
  chunkText: string; // Required field validation
};

export type DocumentEmbeddingSelect = typeof documentEmbeddings.$inferSelect & {
  similarity?: number; // Added during queries
  relevanceScore?: number; // Calculated field
};

// VALIDATION SCHEMAS
import { z } from 'zod';

export const embeddingInsertSchema = z.object({
  documentId: z.string().uuid(),
  documentType: z.enum(['evidence', 'case', 'report', 'note']),
  chunkText: z.string().min(1).max(8000),
  embedding: z.array(z.number()).length(1536),
  metadata: z.record(z.any()).optional(),
});
```

#### 6. Migration Scripts
```sql
-- REQUIRED POSTGRESQL SETUP
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- PERFORMANCE INDEXES
CREATE INDEX CONCURRENTLY embedding_cosine_idx ON document_embeddings 
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX CONCURRENTLY embedding_euclidean_idx ON document_embeddings 
USING hnsw (embedding vector_l2_ops);

-- PARTIAL INDEXES for active records
CREATE INDEX CONCURRENTLY active_embeddings_idx ON document_embeddings (created_at) 
WHERE is_active = true;
```

---

## 🚀 IMPLEMENTATION PRIORITIES

### Phase 1: Core Schema (Week 1)
- ✅ Add pgvector column types
- ✅ Implement proper foreign keys and relationships
- ✅ Add basic performance indexes

### Phase 2: Advanced Features (Week 2)
- 🔄 Vector operation helpers
- 🔄 Materialized views for performance
- 🔄 Validation schemas

### Phase 3: Optimization (Week 3)
- 🔄 Partitioning strategy
- 🔄 Advanced indexes (HNSW, GiST)
- 🔄 Query optimization

### Phase 4: Production Ready (Week 4)
- 🔄 Monitoring and metrics
- 🔄 Backup and recovery procedures
- 🔄 Load testing and tuning

---

## 📋 WIRING CHECKLIST

### Dependencies to Install
```bash
npm install @types/pg
npm install drizzle-orm
npm install postgres
```

### Environment Setup
```bash
# PostgreSQL with pgvector
docker run -d \
  --name postgres-vector \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=prosecutor_db \
  -p 5432:5432 \
  pgvector/pgvector:pg15
```

### Migration Commands
```bash
# Generate migrations
npx drizzle-kit generate:pg

# Apply migrations
npx drizzle-kit push:pg

# Seed with test data
npm run db:seed
```

---

## 🧪 TESTING STRATEGY

### Unit Tests
```typescript
describe('Vector Schema', () => {
  test('embedding insertion with validation');
  test('similarity query performance');
  test('index usage optimization');
});
```

### Performance Tests
```typescript
describe('Vector Performance', () => {
  test('1M+ embedding similarity search < 100ms');
  test('bulk insertion performance');
  test('concurrent query handling');
});
```

### Integration Tests
```typescript
describe('Schema Integration', () => {
  test('foreign key constraints');
  test('cascade deletions');
  test('index effectiveness');
});
```

---

**Status**: 📝 Ready for phased implementation
**Timeline**: 4-week enhancement roadmap
**Dependencies**: PostgreSQL 15+, pgvector extension, Drizzle ORM latest
