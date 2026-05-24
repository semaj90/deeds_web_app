import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const COLLECTION = 'documents_atlas_768';
const EMBED_MODEL = 'embeddinggemma:latest';

function deterministicPointId(key) {
  const hash = crypto.createHash('md5').update(key).digest();
  return hash.readUInt32BE(0) % 2147483648;
}

// Zero Hidden Thoughts / Chain of Thoughts sanitization function
function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const forbidden = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];
  
  if (Array.isArray(payload)) {
    return payload.map(item => sanitizePayload(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!forbidden.includes(key)) {
      sanitized[key] = sanitizePayload(value);
    }
  }
  return sanitized;
}

async function fetchEmbedding(text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.embedding) && data.embedding.length === 768) {
        return data.embedding;
      }
    }
  } catch (err) {
    console.warn(`  [warning] Embedding generation failed for: "${text.slice(0, 50)}..." - ${err.message}`);
  }
  return null;
}

async function main() {
  console.log(`🚀 Starting Qdrant Upsert for Documents Atlas...`);
  console.log(`💾 Connecting to Postgres...`);
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // 1. Recreate/ensure collection
    console.log(`Ensuring Qdrant collection '${COLLECTION}' exists...`);
    const probe = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    if (!probe.ok) {
      console.log(`Collection does not exist. Creating...`);
      const createResp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: { size: 768, distance: 'Cosine' },
          hnsw_config: { m: 16, ef_construct: 64 },
          on_disk_payload: true,
        }),
      });
      console.log('Collection create response:', createResp.status, await createResp.text());
    } else {
      console.log(`Collection '${COLLECTION}' already exists.`);
    }

    // 2. Fetch document entries from Postgres
    console.log("Fetching documents_atlas_entries from Postgres...");
    const { rows: docsRaw } = await pool.query(
      `SELECT path AS relative_path, title, category, tags, summary, metadata FROM documents_atlas_entries`
    );
    const docs = docsRaw.map(row => {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
      const tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags || [];
      return {
        relative_path: row.relative_path,
        title: row.title,
        category: row.category,
        tags: tags,
        summary: row.summary,
        size: meta.size ?? 0,
        lines: meta.lines ?? 0,
        isSummarizedOnly: meta.isSummarizedOnly ?? false,
        archive: meta.archive ?? null
      };
    });
    console.log(`Found ${docs.length} documents in database.`);

    // 3. Loop and generate embeddings, preparing points
    const points = [];
    let embeddedCount = 0;
    
    const concurrencyLimit = 25;
    for (let i = 0; i < docs.length; i += concurrencyLimit) {
      const batchDocs = docs.slice(i, i + concurrencyLimit);
      
      await Promise.all(batchDocs.map(async (doc) => {
        const synthesisText = `Document: "${doc.title}" (Path: "${doc.relative_path}", Category: "${doc.category}"): ` +
          `${doc.summary || 'Metadata for local documentation file.'} ` +
          `Tags: ${(doc.tags || []).join(', ')}`;
        
        const embedding = await fetchEmbedding(synthesisText);
        if (!embedding) {
          const fallbackText = `Document "${doc.title}" in category "${doc.category}". Tags: ${(doc.tags || []).join(', ')}`;
          const fallbackEmbed = await fetchEmbedding(fallbackText);
          if (fallbackEmbed) {
            doc.embedding = fallbackEmbed;
          }
        } else {
          doc.embedding = embedding;
        }

        if (doc.embedding) {
          const pointKey = `doc-atlas:${doc.relative_path}`;
          points.push({
            id: deterministicPointId(pointKey),
            vector: doc.embedding,
            payload: sanitizePayload({
              relative_path: doc.relative_path,
              title: doc.title,
              category: doc.category,
              tags: doc.tags || [],
              summary: doc.summary || '',
              size: doc.size,
              lines: doc.lines,
              source: 'documents_atlas',
              isSummarizedOnly: doc.isSummarizedOnly,
              archive: doc.archive
            })
          });
        }
      }));

      embeddedCount += batchDocs.length;
      if (embeddedCount % 100 === 0 || i + concurrencyLimit >= docs.length) {
        console.log(`  Embedded ${embeddedCount}/${docs.length} documents...`);
      }
    }

    console.log(`Generated ${points.length} points to upsert.`);

    // 4. Batch upsert points
    let upserted = 0;
    const batchSize = 50;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch }),
      });
      if (resp.ok) {
        upserted += batch.length;
      } else {
        const err = await resp.text();
        console.error(`Batch starting at index ${i} failed:`, err.slice(0, 200));
      }
    }

    console.log(`\n✅ Done: Successfully upserted ${upserted} documents to collection '${COLLECTION}' in Qdrant.`);

    // Verify
    const verifyResp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    if (verifyResp.ok) {
      const verifyData = await verifyResp.json();
      console.log(`Qdrant points_count: ${verifyData.result?.points_count}`);
    }
  } catch (err) {
    console.error("❌ Qdrant upsert failed:", err);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error("💥 Execution error:", err);
  process.exit(1);
});
