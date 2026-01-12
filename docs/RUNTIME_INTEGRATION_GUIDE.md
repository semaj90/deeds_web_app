# 🚀 Phase 96: Runtime Integration Guide
**Production-Ready Service Orchestration**
**January 11, 2026**

---

## 📋 Overview

This guide shows how to run the Legal AI application using **existing Docker containers** with all services properly integrated:

- **PostgreSQL** (legal_ai_db) - SSR data, case management, embeddings
- **Redis Stack** - Cache, RediSearch, RedisJSON, time-series
- **RabbitMQ** - Message streaming, task queues
- **Qdrant** - Vector search with tags
- **MinIO** - Document storage
- **SvelteKit** - Frontend with SSR

---

## 🐳 Quick Start (Using Existing Containers)

### Step 1: Start All Services

\`\`\`powershell
# Navigate to project root
cd C:\Users\james\Videos\deeds-web-app

# Start all infrastructure services
docker-compose up -d postgres redis rabbitmq qdrant minio

# Verify all services are healthy
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
\`\`\`

**Expected Output:**
\`\`\`
NAMES                  STATUS              PORTS
postgres-pgvector      Up (healthy)        0.0.0.0:5432->5432/tcp
legal-ai-redis         Up (healthy)        0.0.0.0:6379->6379/tcp, 0.0.0.0:18001->8001/tcp
legal-ai-rabbitmq      Up (healthy)        0.0.0.0:5672->5672/tcp, 0.0.0.0:15672->15672/tcp
legal-ai-qdrant        Up (healthy)        0.0.0.0:6333->6333/tcp, 0.0.0.0:6334->6334/tcp
legal-ai-minio         Up (healthy)        0.0.0.0:9000->9000/tcp, 0.0.0.0:9001->9001/tcp
\`\`\`

### Step 2: Initialize Database (SSR Ready)

\`\`\`powershell
# Execute initialization scripts (if not already done)
docker exec -i postgres-pgvector psql -U legal_admin -d legal_ai_db < sql/init/00-init-db.sql
docker exec -i postgres-pgvector psql -U legal_admin -d legal_ai_db < sql/init/01-install-pgvector.sql

# Verify pgvector extension
docker exec postgres-pgvector psql -U legal_admin -d legal_ai_db -c "\dx"
\`\`\`

**Expected Extensions:**
- `pgvector` - Vector similarity search
- `pg_trgm` - Fuzzy text search (for Loki.js-like queries)

### Step 3: Start Frontend (Development Mode)

\`\`\`powershell
cd sveltekit-frontend

# Install dependencies (if needed)
npm install

# Start dev server with all services connected
npm run dev

# Or use QUIC/HTTP3 (Phase 14)
npm run dev:quic
\`\`\`

**Frontend URL:** `http://localhost:5175`

---

## 🔌 Service Endpoints

| Service | Container Name | External Port | Purpose |
|---------|----------------|---------------|---------|----------|
| **PostgreSQL** | `phase66-postgres` | `localhost:5434` | SSR data, cases, embeddings (pgvector) |
| **Redis Stack** | `phase66-redis` | `localhost:6379` | Cache, RediSearch, RedisJSON |
| **RabbitMQ AMQP** | `phase66-rabbitmq` | `localhost:5672` | Message streaming |
| **RabbitMQ UI** | `phase66-rabbitmq` | `localhost:15672` | Management console (user:guest, pass:guest) |
| **Qdrant HTTP** | `phase66-qdrant` | `localhost:6333` | Vector search API |
| **MinIO S3** | `phase66-minio` | `localhost:9000` | Document storage |
| **MinIO Console** | `phase66-minio` | `localhost:9001` | File management UI |
| **CouchDB** | `phase66-couchdb` | `localhost:5984` | JSON document database |
| **Neo4j Browser** | `deeds-neo4j` | `localhost:7474` | Graph database UI |
| **Neo4j Bolt** | `deeds-neo4j` | `localhost:7687` | Cypher query protocol |

---

## 📊 Database Integration (SSR)

### PostgreSQL Schema (legal_ai_db)

The database is automatically initialized with:

**Core Tables:**
- `cases` - Legal case records
- `evidence` - Document evidence items
- `case_notes` - Investigation notes
- `embeddings` - Vector embeddings (pgvector)
- `user_intent_transitions` - Analytics for RL

**Example SSR Query (SvelteKit Load Function):**

\`\`\`typescript
// src/routes/cases/+page.server.ts
import { db } from '$lib/server/database';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    // SSR: Query runs on server, returns serialized data
    const cases = await db.query(\`
        SELECT
            case_id,
            case_number,
            suspect_name,
            created_at,
            status
        FROM cases
        WHERE status = 'active'
        ORDER BY created_at DESC
        LIMIT 20
    \`);

    return {
        cases: cases.rows,
        timestamp: new Date().toISOString()
    };
};
\`\`\`

**Connection String:**
\`\`\`
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db
\`\`\`

### pgvector for Embeddings

\`\`\`typescript
// Vector similarity search (SSR-safe)
import { db } from '$lib/server/database';

export async function searchSimilarCases(queryEmbedding: number[]) {
    const result = await db.query(\`
        SELECT
            case_id,
            case_summary,
            1 - (embedding <=> $1::vector) AS similarity
        FROM case_embeddings
        ORDER BY embedding <=> $1::vector
        LIMIT 10
    \`, [JSON.stringify(queryEmbedding)]);

    return result.rows;
}
\`\`\`

---

## 🔍 Redis Stack Integration

### Features Available

- **RediSearch** - Full-text search (Loki.js replacement)
- **RedisJSON** - Document storage (Fuse.js replacement)
- **RedisTimeSeries** - Analytics tracking
- **RedisBloom** - Probabilistic filters

### Example: Full-Text Search (Loki.js Alternative)

\`\`\`typescript
// src/lib/server/redis-search.ts
import { createClient } from 'redis';

const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

// Create search index (one-time setup)
await redis.ft.create('idx:cases', {
    '$.case_number': { type: 'TEXT', AS: 'case_number' },
    '$.suspect_name': { type: 'TEXT', AS: 'suspect_name' },
    '$.summary': { type: 'TEXT', AS: 'summary' },
    '$.status': { type: 'TAG', AS: 'status' }
}, {
    ON: 'JSON',
    PREFIX: 'case:'
});

// Search cases (Loki.js-like fuzzy search)
export async function searchCases(query: string) {
    const results = await redis.ft.search('idx:cases', query, {
        LIMIT: { from: 0, size: 20 }
    });

    return results.documents.map(doc => doc.value);
}

// Example usage
const cases = await searchCases('burglary AND @status:{active}');
\`\`\`

### Caching Strategy

\`\`\`typescript
// src/lib/server/cache.ts
import { redis } from '$lib/server/redis';

export async function getCachedData<T>(
    key: string,
    fallback: () => Promise<T>,
    ttl = 300 // 5 minutes
): Promise<T> {
    // Try cache first
    const cached = await redis.get(key);
    if (cached) {
        return JSON.parse(cached);
    }

    // Fallback to database/API
    const data = await fallback();
    await redis.setEx(key, ttl, JSON.stringify(data));

    return data;
}

// Usage in SSR load function
export const load: PageServerLoad = async () => {
    return {
        cases: await getCachedData(
            'cases:active',
            () => db.query('SELECT * FROM cases WHERE status = $1', ['active']),
            600 // 10 minutes
        )
    };
};
\`\`\`

---

## 🐰 RabbitMQ Streaming

### Integration with Phase 96 Files

\`\`\`typescript
// src/lib/server/rabbitmq-client.ts
import amqp from 'amqplib';

let connection: amqp.Connection;
let channel: amqp.Channel;

export async function initRabbitMQ() {
    connection = await amqp.connect('amqp://legal_admin:secret123@localhost:5672');
    channel = await connection.createChannel();

    // Enable publisher confirms
    await channel.confirmSelect();

    // Declare streams (from Phase 96 guide)
    await channel.assertQueue('legal-documents-stream', {
        durable: true,
        arguments: {
            'x-queue-type': 'stream',
            'x-max-length-bytes': 50_000_000_000,
            'x-max-age': '30D',
            'x-stream-max-segment-size-bytes': 100_000_000
        }
    });

    return { connection, channel };
}

// Document upload handler (SSR endpoint)
export async function publishDocumentChunks(chunks: string[], caseId: string) {
    const { channel } = await initRabbitMQ();

    for (let i = 0; i < chunks.length; i++) {
        const message = {
            id: \`doc-\${caseId}-\${Date.now()}-\${i}\`,
            type: 'legal-document-chunk',
            data: chunks[i],
            timestamp: Date.now(),
            metadata: { caseId, chunkIndex: i, totalChunks: chunks.length }
        };

        channel.publish(
            '',
            'legal-documents-stream',
            Buffer.from(JSON.stringify(message)),
            {
                persistent: true,
                messageId: message.id,
                headers: {
                    'x-deduplication-header': message.id,
                    'x-stream-publishing-id': message.id
                }
            }
        );
    }

    await channel.waitForConfirms();
}
\`\`\`

### Task Queue (Background Jobs)

\`\`\`typescript
// Consumer process (separate Node.js script or SvelteKit hook)
import { initRabbitMQ } from '$lib/server/rabbitmq-client';

const { channel } = await initRabbitMQ();

await channel.consume(
    'legal-documents-stream',
    async (msg) => {
        if (!msg) return;

        const chunk = JSON.parse(msg.content.toString());

        // Process document chunk (e.g., extract entities, generate embeddings)
        await processDocumentChunk(chunk);

        // Acknowledge message
        channel.ack(msg);
    },
    {
        arguments: { 'x-stream-offset': 'last' }
    }
);
\`\`\`

---

## 🎯 Qdrant Vector Search with Tags

### Collection Setup

\`\`\`typescript
// src/lib/server/qdrant-client.ts
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

// Create collection with payload indexing (tags)
await qdrant.createCollection('legal_cases', {
    vectors: {
        size: 768, // all-MiniLM-L6-v2 embedding size
        distance: 'Cosine'
    },
    on_disk_payload: true
});

// Create payload indexes for filtering
await qdrant.createPayloadIndex('legal_cases', {
    field_name: 'case_type',
    field_schema: 'keyword'
});

await qdrant.createPayloadIndex('legal_cases', {
    field_name: 'tags',
    field_schema: 'keyword'
});
\`\`\`

### Search with Tags

\`\`\`typescript
// Vector search with tag filtering
export async function searchCasesWithTags(
    queryEmbedding: number[],
    tags: string[] = [],
    caseType?: string
) {
    const filter: any = { must: [] };

    if (tags.length > 0) {
        filter.must.push({
            key: 'tags',
            match: { any: tags }
        });
    }

    if (caseType) {
        filter.must.push({
            key: 'case_type',
            match: { value: caseType }
        });
    }

    const results = await qdrant.search('legal_cases', {
        vector: queryEmbedding,
        filter: filter.must.length > 0 ? filter : undefined,
        limit: 20,
        with_payload: true
    });

    return results;
}

// Usage in SSR
export const load: PageServerLoad = async ({ url }) => {
    const query = url.searchParams.get('q');
    const tags = url.searchParams.getAll('tag');

    const embedding = await generateEmbedding(query);
    const results = await searchCasesWithTags(embedding, tags);

    return { results };
};
\`\`\`

---

## 📦 MinIO Document Storage

### Upload Handler (SSR Endpoint)

\`\`\`typescript
// src/routes/api/upload/+server.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { RequestHandler } from './$types';

const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: 'http://localhost:9000',
    credentials: {
        accessKeyId: 'minio',
        secretAccessKey: 'minio123'
    },
    forcePathStyle: true
});

export const POST: RequestHandler = async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = \`cases/\${Date.now()}-\${file.name}\`;

    await s3.send(new PutObjectCommand({
        Bucket: 'legal-documents',
        Key: key,
        Body: buffer,
        ContentType: file.type,
        Metadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString()
        }
    }));

    return new Response(JSON.stringify({ key, size: file.size }), {
        headers: { 'Content-Type': 'application/json' }
    });
};
\`\`\`

---

## 🔧 Windows Development Fallback

### Local Development Without Docker

If Docker is slow or you prefer native development:

\`\`\`powershell
# Install services natively on Windows

# PostgreSQL (using chocolatey or official installer)
choco install postgresql17 -y

# Redis (WSL2 or native Windows port)
wsl -d Ubuntu -- sudo service redis-server start

# RabbitMQ (native Windows installer)
choco install rabbitmq -y

# SvelteKit (local Node.js)
cd sveltekit-frontend
npm run dev
\`\`\`

**Environment Variables (.env.local):**
\`\`\`env
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://legal_admin:secret123@localhost:5672
QDRANT_URL=http://localhost:6333
MINIO_ENDPOINT=http://localhost:9000
OLLAMA_URL=http://localhost:11434
\`\`\`

---

## 🚦 Health Checks

\`\`\`powershell
# Check all services
docker exec postgres-pgvector pg_isready -U legal_admin -d legal_ai_db
docker exec legal-ai-redis redis-cli ping
docker exec legal-ai-rabbitmq rabbitmq-diagnostics ping
docker exec legal-ai-qdrant curl -f http://localhost:6333/collections
docker exec legal-ai-minio curl -f http://localhost:9000/minio/health/live
\`\`\`

**Expected:** All commands return success/PONG/OK

---

## 🎯 Complete Startup Script

\`\`\`powershell
# scripts/start-dev-environment.ps1

Write-Host "🚀 Starting Legal AI Development Environment" -ForegroundColor Cyan
Write-Host ""

# Start Docker services
Write-Host "1️⃣ Starting Docker services..." -ForegroundColor Yellow
docker-compose up -d postgres redis rabbitmq qdrant minio

# Wait for services to be healthy
Write-Host "2️⃣ Waiting for services to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Verify health
Write-Host "3️⃣ Checking service health..." -ForegroundColor Yellow
docker ps --format "table {{.Names}}\t{{.Status}}"

# Start SvelteKit
Write-Host "4️⃣ Starting SvelteKit frontend..." -ForegroundColor Yellow
cd sveltekit-frontend
Start-Process powershell -ArgumentList "npm run dev" -NoNewWindow

Write-Host ""
Write-Host "✅ Environment ready!" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:5175" -ForegroundColor Cyan
Write-Host "   RabbitMQ UI: http://localhost:15672" -ForegroundColor Cyan
Write-Host "   MinIO Console: http://localhost:9001" -ForegroundColor Cyan
Write-Host "   RedisInsight: http://localhost:18001" -ForegroundColor Cyan
\`\`\`

---

## 📚 Integration Summary

| Technology | Docker Container | Purpose | Phase 96 Integration |
|------------|------------------|---------|---------------------|
| **PostgreSQL** | postgres-pgvector | SSR data, pgvector embeddings | Database backend for all services |
| **Redis Stack** | legal-ai-redis | Cache, RediSearch (Loki.js), RedisJSON (Fuse.js) | High-speed caching + search |
| **RabbitMQ** | legal-ai-rabbitmq | Message streaming, task queues | Document chunking pipeline |
| **Qdrant** | legal-ai-qdrant | Vector search with tag filtering | Advanced semantic search |
| **MinIO** | legal-ai-minio | S3-compatible document storage | Legal document repository |
| **SvelteKit** | (local dev) | SSR frontend | User interface + API endpoints |

---

**Status:** ✅ Production Ready
**Last Updated:** January 11, 2026
