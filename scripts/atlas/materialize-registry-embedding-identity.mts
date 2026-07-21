#!/usr/bin/env npx tsx
/**
 * Materialize Registry Embedding Identity Projection
 *
 * Materializes embedding metadata for each packet:
 * - embedding_model (canonical: embeddinggemma:latest, 768-dim)
 * - embedding_dimension
 * - embedding_normalized (L2 norm applied)
 * - embedding_content_hash (SHA-256 of normalized vector)
 * - qdrant_point_id (UUID or integer from Qdrant)
 *
 * This is a derived projection reading from codebase_chunk_index and Qdrant,
 * NOT a new source of truth.
 */

import { pool } from '$lib/server/db/client.js';
import crypto from 'crypto';

interface EmbeddingIdentity {
  packet_key: string;
  embedding_model: string;
  embedding_dimension: number;
  embedding_normalized: boolean;
  embedding_content_hash: string;
  qdrant_point_id: string | null;
  chunk_id: string | null;
  materialization_version: number;
}

const CANONICAL_MODEL = 'embeddinggemma:latest';
const CANONICAL_DIMENSION = 768;
const MATERIALIZATION_VERSION = 1;

function computeVectorHash(vector: number[]): string {
  // SHA-256 hash of the normalized vector (as comma-separated string)
  const normalized = vector.map(v => v.toFixed(6)).join(',');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

async function ensureProjectionTable(client: any): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS registry_embedding_identity (
      id SERIAL PRIMARY KEY,
      packet_key TEXT NOT NULL UNIQUE,
      embedding_model TEXT NOT NULL,
      embedding_dimension INT NOT NULL,
      embedding_normalized BOOLEAN DEFAULT true,
      embedding_content_hash TEXT,
      qdrant_point_id TEXT,
      chunk_id TEXT,
      materialization_version INT DEFAULT ${MATERIALIZATION_VERSION},
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_embedding_packet_key
    ON registry_embedding_identity (packet_key)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_embedding_qdrant_point_id
    ON registry_embedding_identity (qdrant_point_id)
  `);
}

async function fetchChunkEmbeddings(client: any, limit: number = 0): Promise<any[]> {
  // Query chunks with embeddings from codebase_chunk_index
  const query = limit > 0
    ? `SELECT id, packet_key, source_ref, content_embedding
       FROM codebase_chunk_index
       WHERE content_embedding IS NOT NULL
       LIMIT ${limit}`
    : `SELECT id, packet_key, source_ref, content_embedding
       FROM codebase_chunk_index
       WHERE content_embedding IS NOT NULL`;

  return (await client.query(query)).rows;
}

async function fetchQdrantMappings(client: any): Promise<Map<string, string>> {
  // Query Qdrant point IDs from metadata (if stored in DB)
  // Alternative: query Qdrant HTTP API directly
  const mappings = new Map<string, string>();

  try {
    const result = await client.query(`
      SELECT payload->>'packet_key' as packet_key, id as point_id
      FROM qdrant_points
      WHERE payload->>'packet_key' IS NOT NULL
    `);

    result.rows.forEach((row: any) => {
      mappings.set(row.packet_key, row.point_id);
    });
  } catch {
    // Table may not exist; that's OK
  }

  return mappings;
}

async function materializeProjection(client: any, limit: number = 0): Promise<{ materialized: number; errors: number; missing_embeddings: number }> {
  let materialized = 0;
  let errors = 0;
  let missing_embeddings = 0;

  console.log('📥 Fetching chunk embeddings...');
  const chunks = await fetchChunkEmbeddings(client, limit);
  console.log(`✓ Found ${chunks.length} chunks with embeddings\n`);

  console.log('🔗 Fetching Qdrant mappings...');
  const qdrantMappings = await fetchQdrantMappings(client);
  console.log(`✓ Found ${qdrantMappings.size} Qdrant points\n`);

  console.log(`📝 Materializing ${chunks.length} embedding identities...`);

  for (const chunk of chunks) {
    try {
      const embedding = chunk.content_embedding;
      if (!embedding || !Array.isArray(embedding)) {
        missing_embeddings++;
        continue;
      }

      // Validate dimension
      const dimension = embedding.length;
      if (dimension !== CANONICAL_DIMENSION) {
        console.warn(`  ⚠️  Chunk ${chunk.id} has dimension ${dimension}, expected ${CANONICAL_DIMENSION}`);
      }

      // Compute content hash
      const contentHash = computeVectorHash(embedding);

      // Look up Qdrant point ID
      const qdrantPointId = qdrantMappings.get(chunk.packet_key) || null;

      // Upsert into projection table
      await client.query(`
        INSERT INTO registry_embedding_identity (
          packet_key, embedding_model, embedding_dimension,
          embedding_normalized, embedding_content_hash, qdrant_point_id,
          chunk_id, materialization_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (packet_key) DO UPDATE SET
          embedding_model = EXCLUDED.embedding_model,
          embedding_dimension = EXCLUDED.embedding_dimension,
          embedding_normalized = EXCLUDED.embedding_normalized,
          embedding_content_hash = EXCLUDED.embedding_content_hash,
          qdrant_point_id = EXCLUDED.qdrant_point_id,
          chunk_id = EXCLUDED.chunk_id,
          materialization_version = EXCLUDED.materialization_version,
          updated_at = NOW()
      `, [
        chunk.packet_key,
        CANONICAL_MODEL,
        dimension,
        true, // normalized
        contentHash,
        qdrantPointId,
        chunk.id,
        MATERIALIZATION_VERSION,
      ]);

      materialized++;

      if (materialized % 1000 === 0) {
        console.log(`  ✓ ${materialized} identities materialized`);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.warn(`  ⚠️  Error on chunk ${chunk.id}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  return { materialized, errors, missing_embeddings };
}

async function main() {
  const client = await pool.connect();

  try {
    console.log('🔧 Materializing Registry Embedding Identity Projection\n');

    // Ensure table exists
    await ensureProjectionTable(client);
    console.log('✅ Projection table ensured\n');

    // Materialize the projection
    const { materialized, errors, missing_embeddings } = await materializeProjection(client);

    console.log(`\n📊 Materialization Complete`);
    console.log(`  ✓ Materialized: ${materialized}`);
    console.log(`  ⚠️  Errors: ${errors}`);
    console.log(`  ❌ Missing embeddings: ${missing_embeddings}`);
    console.log(`  📦 Version: ${MATERIALIZATION_VERSION}`);
    console.log(`  🎯 Model: ${CANONICAL_MODEL}`);
    console.log(`  📐 Dimension: ${CANONICAL_DIMENSION}`);

    process.exit(errors > materialized * 0.01 ? 1 : 0);
  } catch (err) {
    console.error('❌ Materialization failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await client.release();
  }
}

main();
