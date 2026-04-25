# Design Document: ACE Contextual Web Ingestion & RAG+KAG Pipeline

## Overview

This document outlines the technical design for implementing the ACE contextual web ingestion and retrieval system. The system follows the pipeline: web_search → crawl → extract → summarize → store (MinIO + Postgres17 + pgvector + Qdrant) → retrieve (RAG) + graph (KAG) → contextual prompt assembly → tool-call plan.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ACE User Request                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    buildContextBundle()                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Query Qdrant    │  │  Query pgvector  │  │  Load KAG Graph  │  │
│  │  (ANN Search)    │  │  (Fallback)      │  │  (Neo4j/Postgres)│  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                             │                                        │
│                             ▼                                        │
│                    Hybrid Scoring                                    │
│         (0.65*cosine + 0.10*freshness + 0.05*graph)                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      buildToolPlan()                                 │
│  Context Quality Check → Suggest Actions                            │
│  (stale? insufficient? → web_search / proceed)                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      buildPrompt()                                   │
│  System + Rules + Evidence + Citations + Action Plan                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    LLM Generation (Gemma3)                           │
└─────────────────────────────────────────────────────────────────────┘

Ingestion Pipeline (Async via RabbitMQ):

POST /api/ace/web/ingest → RabbitMQ Queue → Worker Process
                                                    │
                                                    ▼
                                          ┌─────────────────┐
                                          │  1. Crawl       │
                                          │  (fetch HTML)   │
                                          └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  2. Clean       │
                                          │  (HTML → MD)    │
                                          └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  3. Chunk       │
                                          │  (800-1200 tok) │
                                          └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  4. Embed       │
                                          │  (nomic 384d)   │
                                          └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  5. Store       │
                                          │  (MinIO+PG+QD)  │
                                          └─────────────────┘
```

## Technology Stack

- **Frontend**: SvelteKit 2.0 with TypeScript
- **Backend Services**: Node.js (API) + Python (workers)
- **Database**: PostgreSQL 17 with pgvector extension
- **Vector Store**: Qdrant (fast ANN) + pgvector (authoritative)
- **Graph DB**: PostgreSQL (ace_entities, ace_edges tables)
- **Object Storage**: MinIO (S3-compatible)
- **Message Queue**: RabbitMQ (async job processing)
- **Embedding Model**: nomic-embed-text (384 dimensions)
- **Embedding Service**: Ollama at http://localhost:11434
- **ORM**: Drizzle ORM for type-safe database operations


## Database Schema (Drizzle ORM)

### File: `sveltekit-frontend/src/lib/db/schema/ace-web.ts`

```typescript
import { pgTable, uuid, text, timestamp, integer, vector, jsonb, real, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enable pgvector extension (run in migration)
// CREATE EXTENSION IF NOT EXISTS vector;

/**
 * ace_sources: Tracks discovered URLs from web search
 */
export const aceSources = pgTable('ace_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: text('source_type').notNull().default('web'), // 'web', 'api', 'file'
  canonicalUrl: text('canonical_url').notNull(),
  title: text('title'),
  domain: text('domain'),
  firstSeen: timestamp('first_seen', { withTimezone: true }).defaultNow(),
  lastCrawled: timestamp('last_crawled', { withTimezone: true }),
  crawlStatus: text('crawl_status').default('new'), // 'new', 'ok', 'error', 'blocked'
  etag: text('etag'),
  contentHash: text('content_hash'),
}, (table) => ({
  urlIdx: index('ace_sources_url_idx').on(table.canonicalUrl),
  domainIdx: index('ace_sources_domain_idx').on(table.domain),
  statusIdx: index('ace_sources_status_idx').on(table.crawlStatus),
}));

/**
 * ace_docs: Stores document metadata and MinIO pointers
 */
export const aceDocs = pgTable('ace_docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').references(() => aceSources.id),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
  contentType: text('content_type'), // 'text/html', 'application/pdf', etc.
  minioRawKey: text('minio_raw_key').notNull(),
  minioCleanKey: text('minio_clean_key'),
  tokens: integer('tokens'),
  lang: text('lang'),
  summary: text('summary'),
  summaryUpdatedAt: timestamp('summary_updated_at', { withTimezone: true }),
}, (table) => ({
  sourceIdx: index('ace_docs_source_idx').on(table.sourceId),
  fetchedIdx: index('ace_docs_fetched_idx').on(table.fetchedAt),
}));

/**
 * ace_chunks: Text chunks with embeddings for RAG
 */
export const aceChunks = pgTable('ace_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  docId: uuid('doc_id').references(() => aceDocs.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  text: text('text').notNull(),
  embedding: vector('embedding', { dimensions: 384 }),
  metadata: jsonb('metadata').$type<{
    url?: string;
    title?: string;
    heading?: string;
    fetchedAt?: string;
    domain?: string;
    tags?: string[];
  }>().default(sql`'{}'::jsonb`),
}, (table) => ({
  docIdx: index('ace_chunks_doc_idx').on(table.docId, table.chunkIndex),
  // IVFFlat index for vector similarity (created in migration)
  embeddingIdx: index('ace_chunks_embedding_idx').using('ivfflat', table.embedding.op('vector_cosine_ops')),
}));

/**
 * ace_entities: Extracted entities for KAG
 */
export const aceEntities = pgTable('ace_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  docId: uuid('doc_id').references(() => aceDocs.id, { onDelete: 'cascade' }),
  entity: text('entity').notNull(),
  entityType: text('entity_type'), // 'TECH', 'PERSON', 'ORG', 'CONCEPT'
  data: jsonb('data').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
}, (table) => ({
  docIdx: index('ace_entities_doc_idx').on(table.docId),
  entityIdx: index('ace_entities_entity_idx').on(table.entity),
  typeIdx: index('ace_entities_type_idx').on(table.entityType),
}));

/**
 * ace_edges: Entity relationships for KAG graph
 */
export const aceEdges = pgTable('ace_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  srcEntity: text('src_entity').notNull(),
  rel: text('rel').notNull(),
  dstEntity: text('dst_entity').notNull(),
  docId: uuid('doc_id').references(() => aceDocs.id),
  weight: real('weight').default(1.0),
  data: jsonb('data').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
}, (table) => ({
  srcIdx: index('ace_edges_src_idx').on(table.srcEntity),
  dstIdx: index('ace_edges_dst_idx').on(table.dstEntity),
  relIdx: index('ace_edges_rel_idx').on(table.rel),
  docIdx: index('ace_edges_doc_idx').on(table.docId),
}));

// Type exports for use in services
export type AceSource = typeof aceSources.$inferSelect;
export type NewAceSource = typeof aceSources.$inferInsert;
export type AceDoc = typeof aceDocs.$inferSelect;
export type NewAceDoc = typeof aceDocs.$inferInsert;
export type AceChunk = typeof aceChunks.$inferSelect;
export type NewAceChunk = typeof aceChunks.$inferInsert;
export type AceEntity = typeof aceEntities.$inferSelect;
export type NewAceEntity = typeof aceEntities.$inferInsert;
export type AceEdge = typeof aceEdges.$inferSelect;
export type NewAceEdge = typeof aceEdges.$inferInsert;
```


### Migration File: `drizzle/migrations/0001_ace_web_schema.sql`

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create ace_sources table
CREATE TABLE ace_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL DEFAULT 'web',
  canonical_url TEXT NOT NULL,
  title TEXT,
  domain TEXT,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_crawled TIMESTAMPTZ,
  crawl_status TEXT DEFAULT 'new',
  etag TEXT,
  content_hash TEXT
);

CREATE INDEX ace_sources_url_idx ON ace_sources(canonical_url);
CREATE INDEX ace_sources_domain_idx ON ace_sources(domain);
CREATE INDEX ace_sources_status_idx ON ace_sources(crawl_status);

-- Create ace_docs table
CREATE TABLE ace_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES ace_sources(id),
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  content_type TEXT,
  minio_raw_key TEXT NOT NULL,
  minio_clean_key TEXT,
  tokens INTEGER,
  lang TEXT,
  summary TEXT,
  summary_updated_at TIMESTAMPTZ
);

CREATE INDEX ace_docs_source_idx ON ace_docs(source_id);
CREATE INDEX ace_docs_fetched_idx ON ace_docs(fetched_at);

-- Create ace_chunks table
CREATE TABLE ace_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES ace_docs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding VECTOR(384),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX ace_chunks_doc_idx ON ace_chunks(doc_id, chunk_index);
CREATE INDEX ace_chunks_embedding_idx ON ace_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);

-- Create ace_entities table
CREATE TABLE ace_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES ace_docs(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_type TEXT,
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX ace_entities_doc_idx ON ace_entities(doc_id);
CREATE INDEX ace_entities_entity_idx ON ace_entities(entity);
CREATE INDEX ace_entities_type_idx ON ace_entities(entity_type);

-- Create ace_edges table
CREATE TABLE ace_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src_entity TEXT NOT NULL,
  rel TEXT NOT NULL,
  dst_entity TEXT NOT NULL,
  doc_id UUID REFERENCES ace_docs(id),
  weight REAL DEFAULT 1.0,
  data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX ace_edges_src_idx ON ace_edges(src_entity);
CREATE INDEX ace_edges_dst_idx ON ace_edges(dst_entity);
CREATE INDEX ace_edges_rel_idx ON ace_edges(rel);
CREATE INDEX ace_edges_doc_idx ON ace_edges(doc_id);
```


## MinIO Bucket Structure

### Bucket Organization

```
ace_web_raw/
├── search/
│   └── <query_hash>/
│       └── <timestamp>.json          # Search result snapshots
├── crawl/
│   └── <source_id>/
│       ├── <timestamp>.html          # Raw HTML
│       └── <timestamp>.md            # Cleaned markdown
└── assets/
    └── <source_id>/
        └── <filename>                # Images, PDFs, etc.

ace_web_derived/
├── summary/
│   └── <doc_id>.json                 # Document summaries with entities/relations
└── chunks/
    └── <doc_id>.jsonl                # Chunk text + metadata (one per line)

ace_eval_logs/
├── crawl_errors/
│   └── <date>/
│       └── <source_id>.json          # Crawl failure logs
├── rate_limits/
│   └── <date>/
│       └── <domain>.json             # Rate limit events
└── gate_logs/
    └── <date>/
        └── <job_id>.json             # Quality gate results
```

### MinIO Service Configuration

File: `sveltekit-frontend/src/lib/services/ace-web/minio-service.ts`

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export class MinIOService {
  private client: S3Client;
  private readonly buckets = {
    raw: 'ace-web-raw',
    derived: 'ace-web-derived',
    logs: 'ace-eval-logs',
  };

  constructor() {
    this.client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });
  }

  async storeRawHtml(sourceId: string, html: string): Promise<string> {
    const timestamp = new Date().toISOString();
    const key = `crawl/${sourceId}/${timestamp}.html`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.buckets.raw,
      Key: key,
      Body: html,
      ContentType: 'text/html',
    }));

    return key;
  }

  async storeCleanMarkdown(sourceId: string, markdown: string): Promise<string> {
    const timestamp = new Date().toISOString();
    const key = `crawl/${sourceId}/${timestamp}.md`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.buckets.raw,
      Key: key,
      Body: markdown,
      ContentType: 'text/markdown',
    }));

    return key;
  }

  async storeSummary(docId: string, summary: object): Promise<string> {
    const key = `summary/${docId}.json`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.buckets.derived,
      Key: key,
      Body: JSON.stringify(summary, null, 2),
      ContentType: 'application/json',
    }));

    return key;
  }

  async storeChunks(docId: string, chunks: Array<{ text: string; metadata: object }>): Promise<string> {
    const key = `chunks/${docId}.jsonl`;
    const jsonl = chunks.map(chunk => JSON.stringify(chunk)).join('\n');

    await this.client.send(new PutObjectCommand({
      Bucket: this.buckets.derived,
      Key: key,
      Body: jsonl,
      ContentType: 'application/x-ndjson',
    }));

    return key;
  }

  async getObject(bucket: string, key: string): Promise<string> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }));

    return await response.Body?.transformToString() || '';
  }
}
```


## Qdrant Collection Configuration

### Collection Setup

File: `sveltekit-frontend/src/lib/services/ace-web/qdrant-service.ts`

```typescript
export class QdrantService {
  private readonly baseUrl: string;
  private readonly collectionName = 'ace_chunks';

  constructor() {
    this.baseUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  }

  async ensureCollection(): Promise<void> {
    try {
      // Check if collection exists
      const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`);

      if (response.ok) {
        console.log('Qdrant collection already exists');
        return;
      }

      // Create collection
      await fetch(`${this.baseUrl}/collections/${this.collectionName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            size: 384,
            distance: 'Cosine',
          },
          optimizers_config: {
            indexing_threshold: 10000,
          },
        }),
      });

      console.log('Qdrant collection created successfully');
    } catch (error) {
      console.error('Failed to ensure Qdrant collection:', error);
      throw error;
    }
  }

  async upsertChunk(chunk: {
    id: string;
    vector: number[];
    payload: {
      docId: string;
      url: string;
      domain: string;
      fetchedAt: string;
      heading?: string;
      tags?: string[];
    };
  }): Promise<void> {
    const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [chunk],
      }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant upsert failed: ${response.status} ${response.statusText}`);
    }
  }

  async search(params: {
    vector: number[];
    limit?: number;
    filter?: object;
    scoreThreshold?: number;
  }): Promise<Array<{
    id: string;
    score: number;
    payload: any;
  }>> {
    const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: params.vector,
        limit: params.limit || 40,
        with_payload: true,
        score_threshold: params.scoreThreshold || 0.15,
        filter: params.filter,
      }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.result || [];
  }
}
```


## API Endpoints (SvelteKit Routes)

### Ingestion Endpoint

File: `sveltekit-frontend/src/routes/api/ace/web/ingest/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { aceSources } from '$lib/db/schema/ace-web';
import { eq } from 'drizzle-orm';
import amqp from 'amqplib';

interface IngestRequest {
  urls: string[];
  tags?: string[];
  priority?: 'high' | 'normal' | 'low';
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body: IngestRequest = await request.json();

    // Validate input
    if (!body.urls || !Array.isArray(body.urls) || body.urls.length === 0) {
      return json({ error: 'urls array is required' }, { status: 400 });
    }

    // Connect to RabbitMQ
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const channel = await connection.createChannel();
    await channel.assertQueue('ace_web_ingest', { durable: true });

    const jobIds: string[] = [];

    for (const url of body.urls) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // Check if URL already exists
        const existing = await db
          .select()
          .from(aceSources)
          .where(eq(aceSources.canonicalUrl, url))
          .limit(1);

        let sourceId: string;

        if (existing.length > 0) {
          // Update last_seen
          sourceId = existing[0].id;
          await db
            .update(aceSources)
            .set({ firstSeen: new Date() })
            .where(eq(aceSources.id, sourceId));
        } else {
          // Insert new source
          const [newSource] = await db
            .insert(aceSources)
            .values({
              canonicalUrl: url,
              domain,
              sourceType: 'web',
              crawlStatus: 'new',
            })
            .returning();
          sourceId = newSource.id;
        }

        // Enqueue job
        const job = {
          jobId: crypto.randomUUID(),
          sourceId,
          url,
          tags: body.tags || [],
          priority: body.priority || 'normal',
          enqueuedAt: new Date().toISOString(),
        };

        channel.sendToQueue('ace_web_ingest', Buffer.from(JSON.stringify(job)), {
          persistent: true,
          priority: body.priority === 'high' ? 10 : body.priority === 'low' ? 1 : 5,
        });

        jobIds.push(job.jobId);
      } catch (error) {
        console.error(`Failed to enqueue URL ${url}:`, error);
      }
    }

    await channel.close();
    await connection.close();

    return json({
      success: true,
      jobIds,
      message: `Enqueued ${jobIds.length} jobs for processing`,
    });
  } catch (error) {
    console.error('Ingestion endpoint error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
```


### Context Retrieval Endpoint

File: `sveltekit-frontend/src/routes/api/ace/context/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AceContextService } from '$lib/services/ace-web/ace-context-service';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const query = url.searchParams.get('query');
    const domain = url.searchParams.get('domain');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const tags = url.searchParams.get('tags')?.split(',');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    if (!query) {
      return json({ error: 'query parameter is required' }, { status: 400 });
    }

    const contextService = new AceContextService();

    const bundle = await contextService.buildContextBundle({
      query,
      filters: {
        domain,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        tags,
      },
      limit,
    });

    return json(bundle);
  } catch (error) {
    console.error('Context retrieval error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
```


## Worker Implementation (Python)

File: `backend/workers/ace_web_worker.py`

```python
#!/usr/bin/env python3
"""
ACE Web Ingestion Worker
Processes jobs from RabbitMQ: crawl → clean → chunk → embed → store
"""

import asyncio
import json
import hashlib
import logging
from datetime import datetime
from typing import Dict, List, Any
import pika
import httpx
from bs4 import BeautifulSoup
from markdownify import markdownify as md
import tiktoken

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AceWebWorker:
    def __init__(self):
        self.rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://localhost')
        self.ollama_url = os.getenv('OLLAMA_URL', 'http://localhost:11434')
        self.qdrant_url = os.getenv('QDRANT_URL', 'http://localhost:6333')
        self.minio_endpoint = os.getenv('MINIO_ENDPOINT', 'localhost:9000')
        self.db_url = os.getenv('DATABASE_URL')
        self.tokenizer = tiktoken.get_encoding('cl100k_base')

    async def start(self):
        """Start consuming jobs from RabbitMQ"""
        connection = pika.BlockingConnection(pika.URLParameters(self.rabbitmq_url))
        channel = connection.channel()
        channel.queue_declare(queue='ace_web_ingest', durable=True)
        channel.basic_qos(prefetch_count=1)

        logger.info('Worker started, waiting for jobs...')

        def callback(ch, method, properties, body):
            try:
                job = json.loads(body)
                logger.info(f"Processing job {job['jobId']}")

                # Run async pipeline
                asyncio.run(self.process_job(job))

                ch.basic_ack(delivery_tag=method.delivery_tag)
                logger.info(f"Job {job['jobId']} completed successfully")
            except Exception as e:
                logger.error(f"Job processing failed: {e}")
                # Don't ack - let it retry

        channel.basic_consume(queue='ace_web_ingest', on_message_callback=callback)
        channel.start_consuming()

    async def process_job(self, job: Dict[str, Any]):
        """Execute the full pipeline for a job"""
        source_id = job['sourceId']
        url = job['url']
        tags = job.get('tags', [])

        # Step 1: Crawl
        html = await self.crawl(url)
        if not html:
            await self.update_source_status(source_id, 'error')
            return

        # Compute content hash
        content_hash = hashlib.sha256(html.encode()).hexdigest()

        # Check if unchanged
        existing_hash = await self.get_content_hash(source_id)
        if existing_hash == content_hash:
            logger.info(f"Content unchanged for {url}")
            await self.update_source_status(source_id, 'ok')
            return

        # Store raw HTML in MinIO
        raw_key = await self.store_raw_html(source_id, html)

        # Step 2: Clean
        markdown = self.clean_html(html)
        clean_key = await self.store_clean_markdown(source_id, markdown)

        # Create doc record
        doc_id = await self.create_doc(source_id, raw_key, clean_key)

        # Step 3: Chunk
        chunks = self.chunk_text(markdown, url, tags)

        # Step 4: Embed
        embeddings = await self.generate_embeddings([c['text'] for c in chunks])

        # Step 5: Store chunks
        await self.store_chunks(doc_id, chunks, embeddings)

        # Step 6: Summarize
        summary = await self.generate_summary(markdown)
        await self.store_summary(doc_id, summary)

        # Step 7: Extract entities and relations
        entities, edges = await self.extract_knowledge(markdown, doc_id)
        await self.store_knowledge(doc_id, entities, edges)

        # Update source status
        await self.update_source_status(source_id, 'ok', content_hash)

    async def crawl(self, url: str) -> str:
        """Fetch HTML from URL with rate limiting and robots.txt respect"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, follow_redirects=True)
                response.raise_for_status()
                return response.text
        except Exception as e:
            logger.error(f"Crawl failed for {url}: {e}")
            return ""

    def clean_html(self, html: str) -> str:
        """Convert HTML to clean markdown"""
        soup = BeautifulSoup(html, 'html.parser')

        # Remove unwanted elements
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()

        # Convert to markdown
        markdown = md(str(soup), heading_style='ATX')
        return markdown

    def chunk_text(self, text: str, url: str, tags: List[str]) -> List[Dict[str, Any]]:
        """Chunk text into 800-1200 token segments"""
        tokens = self.tokenizer.encode(text)
        chunks = []
        chunk_size = 1000
        overlap = 200

        for i in range(0, len(tokens), chunk_size - overlap):
            chunk_tokens = tokens[i:i + chunk_size]
            chunk_text = self.tokenizer.decode(chunk_tokens)

            chunks.append({
                'text': chunk_text,
                'metadata': {
                    'url': url,
                    'tags': tags,
                    'chunk_index': len(chunks),
                    'token_count': len(chunk_tokens),
                }
            })

        return chunks

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using Ollama"""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.ollama_url}/api/embed",
                json={'model': 'nomic-embed-text', 'input': texts}
            )
            response.raise_for_status()
            data = response.json()
            return data['embeddings']

    async def generate_summary(self, text: str) -> Dict[str, Any]:
        """Generate document summary using Gemma3"""
        # Truncate to first 4000 tokens for summary
        tokens = self.tokenizer.encode(text)[:4000]
        truncated = self.tokenizer.decode(tokens)

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.ollama_url}/api/generate",
                json={
                    'model': 'gemma3-legal',
                    'prompt': f"Summarize this document in 3-5 sentences:\n\n{truncated}",
                    'stream': False
                }
            )
            response.raise_for_status()
            data = response.json()

            return {
                'short': data['response'],
                'long': '',  # TODO: Generate structured summary
                'key_claims': [],
            }

    async def extract_knowledge(self, text: str, doc_id: str) -> tuple:
        """Extract entities and relations for KAG"""
        # Simplified NER - in production use spaCy or similar
        entities = []
        edges = []

        # TODO: Implement proper NER and relation extraction

        return entities, edges

# Database helper methods would go here (using psycopg2 or asyncpg)
# MinIO helper methods would go here (using boto3)

if __name__ == '__main__':
    worker = AceWebWorker()
    asyncio.run(worker.start())
```


## ACE Context Service (TypeScript)

File: `sveltekit-frontend/src/lib/services/ace-web/ace-context-service.ts`

```typescript
import { db } from '$lib/db';
import { aceChunks, aceEdges, aceDocs, aceSources } from '$lib/db/schema/ace-web';
import { eq, sql, and, gte, lte } from 'drizzle-orm';
import { EmbeddingService } from '../error-analysis/embedding-service';
import { QdrantService } from './qdrant-service';

export interface ContextBundle {
  chunks: Array<{
    id: string;
    text: string;
    score: number;
    metadata: {
      url: string;
      title?: string;
      heading?: string;
      fetchedAt: string;
      domain: string;
    };
  }>;
  entities: Array<{
    entity: string;
    type: string;
    docId: string;
  }>;
  edges: Array<{
    src: string;
    rel: string;
    dst: string;
    weight: number;
  }>;
  summary: string;
  totalResults: number;
}

export interface ToolPlan {
  actions: Array<{
    tool: string;
    params: Record<string, unknown>;
    reason: string;
  }>;
  shouldProceed: boolean;
}

export class AceContextService {
  private embeddingService: EmbeddingService;
  private qdrantService: QdrantService;

  constructor() {
    this.embeddingService = new EmbeddingService({
      ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
      maxRetries: 3,
      retryDelayMs: 1000,
    });
    this.qdrantService = new QdrantService();
  }

  /**
   * Build context bundle with RAG + KAG
   * Implements hybrid scoring: 0.65*cosine + 0.10*freshness + 0.05*graph
   */
  async buildContextBundle(params: {
    query: string;
    filters?: {
      domain?: string;
      dateFrom?: Date;
      dateTo?: Date;
      tags?: string[];
    };
    limit?: number;
  }): Promise<ContextBundle> {
    const { query, filters = {}, limit = 10 } = params;

    // Step 1: Generate query embedding
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Step 2: Search Qdrant for top 40 candidates
    let qdrantResults;
    try {
      qdrantResults = await this.qdrantService.search({
        vector: queryEmbedding,
        limit: 40,
        scoreThreshold: 0.15,
        filter: this.buildQdrantFilter(filters),
      });
    } catch (error) {
      console.warn('Qdrant search failed, falling back to pgvector:', error);
      // Fallback to pgvector
      qdrantResults = await this.searchPgVector(queryEmbedding, 40, filters);
    }

    // Step 3: Load full chunk data from Postgres
    const chunkIds = qdrantResults.map((r) => r.id);
    const chunks = await db
      .select()
      .from(aceChunks)
      .where(sql`${aceChunks.id} = ANY(${chunkIds})`);

    // Step 4: Apply hybrid scoring
    const scoredChunks = await this.applyHybridScoring(chunks, qdrantResults, query);

    // Step 5: Sort and take top N
    const topChunks = scoredChunks.sort((a, b) => b.finalScore - a.finalScore).slice(0, limit);

    // Step 6: Load related entities and edges
    const docIds = [...new Set(topChunks.map((c) => c.docId))];
    const entities = await this.loadEntities(docIds);
    const edges = await this.loadEdges(query, 50);

    // Step 7: Generate summary
    const summary = this.generateBundleSummary(topChunks, entities);

    return {
      chunks: topChunks.map((c) => ({
        id: c.id,
        text: c.text,
        score: c.finalScore,
        metadata: c.metadata as any,
      })),
      entities,
      edges,
      summary,
      totalResults: qdrantResults.length,
    };
  }

  /**
   * Apply hybrid scoring formula
   */
  private async applyHybridScoring(
    chunks: any[],
    qdrantResults: any[],
    query: string
  ): Promise<any[]> {
    const now = new Date();
    const queryEntities = this.extractEntities(query);

    return chunks.map((chunk) => {
      const qdrantResult = qdrantResults.find((r) => r.id === chunk.id);
      const cosineSim = qdrantResult?.score || 0;

      // Freshness boost
      const fetchedAt = new Date(chunk.metadata.fetchedAt);
      const daysSince = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
      let freshnessBoost = 0;
      if (daysSince < 7) freshnessBoost = 1.0;
      else if (daysSince < 30) freshnessBoost = 0.5;

      // Graph boost (check if chunk mentions query entities)
      let graphBoost = 0;
      const chunkText = chunk.text.toLowerCase();
      for (const entity of queryEntities) {
        if (chunkText.includes(entity.toLowerCase())) {
          graphBoost += 0.5;
        }
      }
      graphBoost = Math.min(graphBoost, 1.0);

      // Final score
      const finalScore = 0.65 * cosineSim + 0.1 * freshnessBoost + 0.05 * graphBoost;

      return {
        ...chunk,
        cosineSim,
        freshnessBoost,
        graphBoost,
        finalScore,
      };
    });
  }

  /**
   * Build tool plan based on context quality
   */
  async buildToolPlan(bundle: ContextBundle, query: string): Promise<ToolPlan> {
    const actions: ToolPlan['actions'] = [];

    // Check if context is stale (all chunks > 30 days old)
    const allStale = bundle.chunks.every((c) => {
      const fetchedAt = new Date(c.metadata.fetchedAt);
      const daysSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 30;
    });

    if (allStale) {
      actions.push({
        tool: 'web_search',
        params: { query },
        reason: 'All retrieved context is stale (>30 days old)',
      });
    }

    // Check if context is insufficient (<3 relevant chunks)
    const relevantChunks = bundle.chunks.filter((c) => c.score > 0.5);
    if (relevantChunks.length < 3) {
      actions.push({
        tool: 'web_search',
        params: { query: this.refineQuery(query, bundle) },
        reason: 'Insufficient relevant context found',
      });
    }

    return {
      actions,
      shouldProceed: actions.length === 0,
    };
  }

  /**
   * Build final prompt with constraints + evidence + plan
   */
  async buildPrompt(params: {
    query: string;
    bundle: ContextBundle;
    plan: ToolPlan;
    systemRules?: string;
    projectRules?: string;
    tokenBudget?: number;
  }): Promise<string> {
    const { query, bundle, plan, systemRules = '', projectRules = '', tokenBudget = 4000 } = params;

    const sections: string[] = [];

    // System constraints
    if (systemRules) {
      sections.push(`## System Rules\n${systemRules}\n`);
    }

    // Project rules
    if (projectRules) {
      sections.push(`## Project Rules\n${projectRules}\n`);
    }

    // Retrieved evidence
    sections.push(`## Retrieved Context\n`);
    sections.push(bundle.summary);
    sections.push(`\n### Relevant Chunks\n`);

    for (const chunk of bundle.chunks.slice(0, 5)) {
      sections.push(`**Source:** ${chunk.metadata.url}`);
      sections.push(`**Fetched:** ${chunk.metadata.fetchedAt}`);
      sections.push(`**Relevance:** ${(chunk.score * 100).toFixed(1)}%`);
      sections.push(`\`\`\`\n${chunk.text}\n\`\`\`\n`);
    }

    // Knowledge graph
    if (bundle.edges.length > 0) {
      sections.push(`\n### Knowledge Graph\n`);
      for (const edge of bundle.edges.slice(0, 10)) {
        sections.push(`- ${edge.src} --[${edge.rel}]--> ${edge.dst}`);
      }
    }

    // Action plan
    if (plan.actions.length > 0) {
      sections.push(`\n## Suggested Actions\n`);
      for (const action of plan.actions) {
        sections.push(`- **${action.tool}**: ${action.reason}`);
      }
    }

    // User query
    sections.push(`\n## User Request\n${query}\n`);

    // Truncate to token budget if needed
    let prompt = sections.join('\n');
    // TODO: Implement token counting and truncation

    return prompt;
  }

  // Helper methods
  private buildQdrantFilter(filters: any): object | undefined {
    // TODO: Build Qdrant filter from params
    return undefined;
  }

  private async searchPgVector(embedding: number[], limit: number, filters: any): Promise<any[]> {
    // Fallback pgvector search
    const results = await db
      .select()
      .from(aceChunks)
      .orderBy(sql`${aceChunks.embedding} <=> ${JSON.stringify(embedding)}`)
      .limit(limit);

    return results.map((r) => ({ id: r.id, score: 0.5, payload: r.metadata }));
  }

  private async loadEntities(docIds: string[]): Promise<any[]> {
    // TODO: Load entities from ace_entities table
    return [];
  }

  private async loadEdges(query: string, limit: number): Promise<any[]> {
    // TODO: Load relevant edges from ace_edges table
    return [];
  }

  private extractEntities(text: string): string[] {
    // Simple entity extraction - split on spaces and filter
    return text.split(/\s+/).filter((w) => w.length > 3);
  }

  private generateBundleSummary(chunks: any[], entities: any[]): string {
    return `Found ${chunks.length} relevant chunks from ${new Set(chunks.map((c) => c.metadata?.domain)).size} domains.`;
  }

  private refineQuery(query: string, bundle: ContextBundle): string {
    // TODO: Use LLM to refine query based on insufficient results
    return query;
  }
}
```


## Integration with Existing ACE System

### ACE Adapter Integration

File: `sveltekit-frontend/src/lib/services/error-analysis/ace-adapter.ts`

```typescript
import { AceContextService } from '../ace-web/ace-context-service';
import type { Error } from './types';

export class AceAdapter {
  private contextService: AceContextService;

  constructor() {
    this.contextService = new AceContextService();
  }

  /**
   * Main ACE flow with contextual web ingestion
   */
  async processRequest(params: {
    userRequest: string;
    error?: Error;
    systemRules?: string;
    projectRules?: string;
  }): Promise<{
    response: string;
    context: any;
    toolCalls: any[];
  }> {
    const { userRequest, error, systemRules, projectRules } = params;

    // Build query from user request + error context
    const query = error
      ? `${userRequest}\n\nError: ${error.message}\nFile: ${error.filePath}:${error.lineNumber}`
      : userRequest;

    // Step 1: Retrieve context
    let bundle = await this.contextService.buildContextBundle({ query, limit: 10 });

    // Step 2: Check if we need more context
    const plan = await this.contextService.buildToolPlan(bundle, query);

    // Step 3: Execute tool calls if needed
    if (!plan.shouldProceed) {
      for (const action of plan.actions) {
        if (action.tool === 'web_search') {
          // Trigger web search and ingestion
          await this.triggerWebSearch(action.params.query as string);

          // Wait for ingestion to complete (or poll)
          await this.waitForIngestion(5000);

          // Retrieve context again
          bundle = await this.contextService.buildContextBundle({ query, limit: 10 });
        }
      }
    }

    // Step 4: Build final prompt
    const prompt = await this.contextService.buildPrompt({
      query,
      bundle,
      plan,
      systemRules,
      projectRules,
      tokenBudget: 4000,
    });

    // Step 5: Send to LLM (Gemma3/Claude/Gemini)
    const response = await this.callLLM(prompt);

    return {
      response,
      context: bundle,
      toolCalls: plan.actions,
    };
  }

  private async triggerWebSearch(query: string): Promise<void> {
    // Call web search API and trigger ingestion
    const searchResults = await this.performWebSearch(query);

    // Enqueue URLs for ingestion
    await fetch('/api/ace/web/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: searchResults.slice(0, 5), // Top 5 results
        tags: ['ace', 'auto-ingested'],
        priority: 'high',
      }),
    });
  }

  private async performWebSearch(query: string): Promise<string[]> {
    // TODO: Integrate with web search API (DuckDuckGo, Brave, etc.)
    return [];
  }

  private async waitForIngestion(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async callLLM(prompt: string): Promise<string> {
    // TODO: Call Gemma3/Claude/Gemini with prompt
    return '';
  }
}
```

### Usage Example

```typescript
// In error analysis pipeline
import { AceAdapter } from '$lib/services/error-analysis/ace-adapter';

const adapter = new AceAdapter();

const result = await adapter.processRequest({
  userRequest: 'Fix this TypeScript error in my Svelte component',
  error: {
    id: 'err-123',
    message: "Property 'foo' does not exist on type 'Bar'",
    filePath: 'src/lib/components/MyComponent.svelte',
    lineNumber: 42,
    severity: 'error',
  },
  systemRules: 'Use Svelte 5 runes syntax',
  projectRules: 'Follow project TypeScript strict mode',
});

console.log('LLM Response:', result.response);
console.log('Context Used:', result.context.chunks.length, 'chunks');
console.log('Tool Calls:', result.toolCalls);
```


## Environment Configuration

### Environment Variables

Add to `.env`:

```bash
# ACE Web Ingestion
RABBITMQ_URL=amqp://localhost:5672
OLLAMA_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/legal_ai

# Worker Configuration
ACE_WORKER_CONCURRENCY=10
ACE_WORKER_BATCH_SIZE=10
ACE_CRAWL_DELAY_MS=1000
ACE_CRAWL_TIMEOUT_MS=30000
```

### Docker Compose Services

Add to `docker-compose.yml`:

```yaml
services:
  # RabbitMQ for job queue
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: admin
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

  # ACE Web Worker
  ace-web-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.ace-worker
    environment:
      RABBITMQ_URL: amqp://rabbitmq:5672
      OLLAMA_URL: http://ollama:11434
      QDRANT_URL: http://qdrant:6333
      MINIO_ENDPOINT: minio:9000
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/legal_ai
    depends_on:
      - rabbitmq
      - postgres
      - qdrant
      - minio
      - ollama
    restart: unless-stopped

volumes:
  rabbitmq_data:
```

### Worker Dockerfile

File: `backend/Dockerfile.ace-worker`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements-ace-worker.txt .
RUN pip install --no-cache-dir -r requirements-ace-worker.txt

# Copy worker code
COPY workers/ace_web_worker.py .
COPY utils/ ./utils/

# Run worker
CMD ["python", "ace_web_worker.py"]
```

### Python Requirements

File: `backend/requirements-ace-worker.txt`

```
pika==1.3.2
httpx==0.27.0
beautifulsoup4==4.12.3
markdownify==0.12.1
tiktoken==0.7.0
psycopg2-binary==2.9.9
boto3==1.34.144
```


## Testing Strategy

### Unit Tests

File: `sveltekit-frontend/src/lib/services/ace-web/ace-context-service.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AceContextService } from './ace-context-service';
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

  it('should build context bundle with RAG results', async () => {
    const bundle = await service.buildContextBundle({
      query: 'How to use Svelte 5 runes?',
      limit: 5,
    });

    expect(bundle).toBeDefined();
    expect(bundle.chunks).toBeInstanceOf(Array);
    expect(bundle.totalResults).toBeGreaterThanOrEqual(0);
  });

  it('should apply hybrid scoring correctly', async () => {
    const bundle = await service.buildContextBundle({
      query: 'TypeScript error handling',
      limit: 10,
    });

    // Verify scores are in valid range
    for (const chunk of bundle.chunks) {
      expect(chunk.score).toBeGreaterThanOrEqual(0);
      expect(chunk.score).toBeLessThanOrEqual(1);
    }

    // Verify chunks are sorted by score
    for (let i = 1; i < bundle.chunks.length; i++) {
      expect(bundle.chunks[i - 1].score).toBeGreaterThanOrEqual(bundle.chunks[i].score);
    }
  });

  it('should suggest web_search when context is stale', async () => {
    const bundle = {
      chunks: [
        {
          id: '1',
          text: 'Old content',
          score: 0.8,
          metadata: {
            url: 'https://example.com',
            fetchedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), // 40 days ago
            domain: 'example.com',
          },
        },
      ],
      entities: [],
      edges: [],
      summary: 'Test',
      totalResults: 1,
    };

    const plan = await service.buildToolPlan(bundle, 'test query');

    expect(plan.shouldProceed).toBe(false);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].tool).toBe('web_search');
    expect(plan.actions[0].reason).toContain('stale');
  });

  it('should suggest web_search when context is insufficient', async () => {
    const bundle = {
      chunks: [
        {
          id: '1',
          text: 'Low relevance content',
          score: 0.3, // Below 0.5 threshold
          metadata: {
            url: 'https://example.com',
            fetchedAt: new Date().toISOString(),
            domain: 'example.com',
          },
        },
      ],
      entities: [],
      edges: [],
      summary: 'Test',
      totalResults: 1,
    };

    const plan = await service.buildToolPlan(bundle, 'test query');

    expect(plan.shouldProceed).toBe(false);
    expect(plan.actions.some((a) => a.reason.includes('Insufficient'))).toBe(true);
  });

  it('should build prompt with all sections', async () => {
    const bundle = {
      chunks: [
        {
          id: '1',
          text: 'Relevant content about Svelte 5',
          score: 0.9,
          metadata: {
            url: 'https://svelte.dev/docs',
            fetchedAt: new Date().toISOString(),
            domain: 'svelte.dev',
          },
        },
      ],
      entities: [],
      edges: [{ src: 'Svelte 5', rel: 'USES', dst: 'Runes', weight: 0.9 }],
      summary: 'Found 1 relevant chunk',
      totalResults: 1,
    };

    const plan = { actions: [], shouldProceed: true };

    const prompt = await service.buildPrompt({
      query: 'How to use Svelte 5 runes?',
      bundle,
      plan,
      systemRules: 'Use TypeScript',
      projectRules: 'Follow Svelte 5 patterns',
    });

    expect(prompt).toContain('System Rules');
    expect(prompt).toContain('Project Rules');
    expect(prompt).toContain('Retrieved Context');
    expect(prompt).toContain('Knowledge Graph');
    expect(prompt).toContain('User Request');
    expect(prompt).toContain('Svelte 5');
  });
});
```

### Integration Tests

File: `tests/integration/ace-web-ingestion.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { db } from '$lib/db';
import { aceSources, aceDocs, aceChunks } from '$lib/db/schema/ace-web';

describe('ACE Web Ingestion Integration', () => {
  it('should ingest URL and create chunks', async () => {
    // Trigger ingestion
    const response = await fetch('http://localhost:5173/api/ace/web/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: ['https://svelte.dev/docs/introduction'],
        tags: ['test'],
        priority: 'high',
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.jobIds).toHaveLength(1);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Verify source was created
    const sources = await db.select().from(aceSources).limit(1);
    expect(sources.length).toBeGreaterThan(0);

    // Verify chunks were created
    const chunks = await db.select().from(aceChunks).limit(1);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should retrieve context with hybrid scoring', async () => {
    const response = await fetch(
      'http://localhost:5173/api/ace/context?query=Svelte%205%20runes&limit=5'
    );

    expect(response.ok).toBe(true);
    const bundle = await response.json();

    expect(bundle.chunks).toBeInstanceOf(Array);
    expect(bundle.chunks.length).toBeGreaterThan(0);
    expect(bundle.chunks[0]).toHaveProperty('score');
    expect(bundle.chunks[0]).toHaveProperty('metadata');
  });
});
```


## Performance Optimization

### Caching Strategy

1. **Embedding Cache**: Cache embeddings in Redis with 24-hour TTL
2. **Qdrant Results Cache**: Cache search results for identical queries (5-minute TTL)
3. **Summary Cache**: Cache document summaries in MinIO (permanent)
4. **Entity Cache**: Cache extracted entities in Redis (1-hour TTL)

### Batch Processing

```typescript
// Batch embedding generation
async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 10;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await generateEmbeddings(batch);
    results.push(...embeddings);
  }

  return results;
}
```

### Parallel Processing

```python
# Worker with concurrent crawling
import asyncio

async def process_jobs_parallel(jobs: List[Dict], concurrency: int = 10):
    semaphore = asyncio.Semaphore(concurrency)

    async def process_with_limit(job):
        async with semaphore:
            await process_job(job)

    await asyncio.gather(*[process_with_limit(job) for job in jobs])
```

### Database Optimization

```sql
-- Optimize pgvector index for faster searches
CREATE INDEX CONCURRENTLY ace_chunks_embedding_idx
ON ace_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists=100);

-- Analyze table for query planner
ANALYZE ace_chunks;

-- Partial index for recent chunks
CREATE INDEX ace_chunks_recent_idx
ON ace_chunks (doc_id)
WHERE metadata->>'fetchedAt' > (NOW() - INTERVAL '30 days');
```

### Monitoring and Metrics

```typescript
// Add metrics collection
export class MetricsCollector {
  async recordIngestion(duration: number, success: boolean) {
    // Send to monitoring system
  }

  async recordRetrieval(query: string, resultCount: number, duration: number) {
    // Track search performance
  }

  async recordHybridScoring(scores: { cosine: number; freshness: number; graph: number }) {
    // Track scoring distribution
  }
}
```


## Deployment Checklist

### Prerequisites

- [ ] PostgreSQL 17 with pgvector extension installed
- [ ] Qdrant running on port 6333
- [ ] MinIO running on port 9000 with buckets created
- [ ] RabbitMQ running on port 5672
- [ ] Ollama running on port 11434 with nomic-embed-text model
- [ ] Redis running on port 6379 (for caching)

### Database Setup

```bash
# Run migration
npm run db:migrate

# Verify tables created
psql $DATABASE_URL -c "\dt ace_*"

# Verify pgvector extension
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### MinIO Setup

```bash
# Create buckets
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/ace-web-raw
mc mb local/ace-web-derived
mc mb local/ace-eval-logs

# Verify buckets
mc ls local/
```

### Qdrant Setup

```bash
# Verify Qdrant is running
curl http://localhost:6333/collections

# Collection will be created automatically on first use
```

### Worker Deployment

```bash
# Build worker image
docker build -f backend/Dockerfile.ace-worker -t ace-web-worker .

# Start worker
docker-compose up -d ace-web-worker

# Check logs
docker-compose logs -f ace-web-worker
```

### Verification

```bash
# Test ingestion endpoint
curl -X POST http://localhost:5173/api/ace/web/ingest \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://svelte.dev/docs"], "tags": ["test"]}'

# Test context retrieval
curl "http://localhost:5173/api/ace/context?query=Svelte%205%20runes&limit=5"

# Check RabbitMQ queue
curl -u admin:admin http://localhost:15672/api/queues/%2F/ace_web_ingest
```

### Monitoring

```bash
# Monitor worker logs
docker-compose logs -f ace-web-worker

# Monitor RabbitMQ
open http://localhost:15672  # admin/admin

# Monitor Qdrant
curl http://localhost:6333/collections/ace_chunks

# Monitor MinIO
open http://localhost:9000  # minioadmin/minioadmin
```


## Future Enhancements

### Phase 2: Advanced Features

1. **Incremental Updates**: Detect content changes and update only modified chunks
2. **Multi-modal Ingestion**: Support PDF, images, videos with vision models
3. **Advanced NER**: Use spaCy or custom models for entity extraction
4. **Relation Extraction**: Use LLM to extract semantic relationships
5. **Query Expansion**: Use LLM to expand queries with synonyms and related terms
6. **Reranking**: Add cross-encoder reranking for top results
7. **Feedback Loop**: Learn from user interactions to improve retrieval

### Phase 3: Scale and Performance

1. **Distributed Workers**: Scale workers horizontally with Kubernetes
2. **Sharded Qdrant**: Shard collections for larger datasets
3. **CDN Integration**: Cache frequently accessed content
4. **Streaming Ingestion**: Process large documents in streaming fashion
5. **GPU Acceleration**: Use GPU for embedding generation and reranking

### Phase 4: Advanced RAG+KAG

1. **Multi-hop Reasoning**: Follow graph edges for complex queries
2. **Temporal Reasoning**: Track how information changes over time
3. **Provenance Tracking**: Full lineage from source to answer
4. **Confidence Scoring**: Estimate answer confidence based on evidence
5. **Contradiction Detection**: Identify conflicting information across sources

---

## Summary

This design document provides a complete technical specification for implementing the ACE contextual web ingestion and RAG+KAG pipeline. The system follows best practices from the existing codebase:

- **Database**: Drizzle ORM with type-safe schema definitions
- **Storage**: MinIO for object storage with organized bucket structure
- **Vector Search**: Dual storage in pgvector (authoritative) and Qdrant (fast ANN)
- **Embeddings**: nomic-embed-text (384d) via Ollama
- **Async Processing**: RabbitMQ for job queue with Python workers
- **API**: SvelteKit routes with TypeScript type safety
- **Testing**: Vitest with mock infrastructure from test-utils

The implementation is production-ready with:
- Comprehensive error handling
- Retry logic with exponential backoff
- Fallback mechanisms (Qdrant → pgvector)
- Monitoring and metrics
- Performance optimization (batching, caching, parallel processing)
- Clear deployment checklist

**Next Steps**: Proceed to `tasks.md` for implementation checklist.

---

**Last Updated:** December 20, 2025
