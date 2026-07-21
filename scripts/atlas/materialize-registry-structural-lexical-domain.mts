#!/usr/bin/env npx tsx
/**
 * Materialize Registry Structural, Lexical, Domain Projections
 *
 * Joins atlas_packets, feature views, Valkey cache, and canonical packet data.
 * Materializes three derived projections (not new sources of truth):
 * 1. Structural: source_ref, title_id, symbols, AST facts
 * 2. Lexical: keywords, bm25_terms, identifiers, file tokens
 * 3. Domain: domain_class from canonical packet + feature view + cache + fallback
 *
 * Creates registry_enrichment_projection table or updates if exists.
 */

import { pool } from '$lib/server/db/client.js';
import { Redis } from 'ioredis';
import type { PoolClient } from 'pg';

interface RegistryEnrichmentRow {
  packet_key: string;
  source_ref: string;
  title_id: string | null;
  symbols: string[];
  ast_facts: Record<string, unknown>;
  keywords: string[];
  bm25_terms: string[];
  identifiers: string[];
  file_tokens: string[];
  domain_class: string;
  enriched_at: Date;
  materialization_version: number;
}

const MATERIALIZATION_VERSION = 1;

async function ensureProjectionTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS registry_enrichment_projection (
      id SERIAL PRIMARY KEY,
      packet_key TEXT NOT NULL UNIQUE,
      source_ref TEXT NOT NULL,
      title_id TEXT,
      symbols TEXT[] DEFAULT '{}',
      ast_facts JSONB,
      keywords TEXT[] DEFAULT '{}',
      bm25_terms TEXT[] DEFAULT '{}',
      identifiers TEXT[] DEFAULT '{}',
      file_tokens TEXT[] DEFAULT '{}',
      domain_class TEXT,
      enriched_at TIMESTAMP DEFAULT NOW(),
      materialization_version INT DEFAULT ${MATERIALIZATION_VERSION},
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create indexes for fast lookups
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_enrichment_packet_key ON registry_enrichment_projection (packet_key)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_enrichment_source_ref ON registry_enrichment_projection (source_ref)
  `);
}

async function extractStructuralFacts(
  client: PoolClient,
  packetKey: string,
  sourceRef: string
): Promise<{ symbols: string[]; ast_facts: Record<string, unknown> }> {
  // Query AST symbols from feature_implementations or tree_node_ids JSONB
  const result = await client.query(`
    SELECT
      COALESCE(
        (SELECT array_agg(DISTINCT symbol_name) FROM feature_implementations WHERE packet_key = $1),
        '{}'::TEXT[]
      ) as symbols,
      (SELECT jsonb_object_agg(kind, count)
       FROM (
         SELECT kind, COUNT(*) as count
         FROM feature_implementations
         WHERE packet_key = $1
         GROUP BY kind
       ) t
      ) as ast_by_kind
    LIMIT 1
  `, [packetKey]);

  const row = result.rows[0];
  return {
    symbols: row.symbols || [],
    ast_facts: {
      by_kind: row.ast_by_kind || {},
      total_symbols: (row.symbols || []).length,
    },
  };
}

async function extractLexicalFacts(
  client: PoolClient,
  sourceRef: string
): Promise<{ keywords: string[]; bm25_terms: string[]; identifiers: string[]; file_tokens: string[] }> {
  // Extract from file name, BM25 index, or cached lexical features
  const fileNameTokens = sourceRef.split(/[\/-_]/).filter(t => t.length > 0);

  // Query for BM25 terms if available
  const bm25Result = await client.query(`
    SELECT DISTINCT term
    FROM bm25_index
    WHERE source_ref = $1
    LIMIT 20
  `, [sourceRef]).catch(() => ({ rows: [] }));

  return {
    keywords: fileNameTokens.slice(0, 5),
    bm25_terms: bm25Result.rows.map((r: any) => r.term),
    identifiers: fileNameTokens.filter(t => /^[a-zA-Z_]/.test(t)),
    file_tokens: fileNameTokens,
  };
}

async function extractDomainClass(
  client: PoolClient,
  redis: Redis,
  packetKey: string,
  sourceRef: string
): Promise<string> {
  // Priority: canonical packet data → feature view → Valkey cache → deterministic fallback

  // 1. Check canonical packet data
  const packetResult = await client.query(`
    SELECT domain_class FROM atlas_packets WHERE packet_key = $1 LIMIT 1
  `, [packetKey]);
  if (packetResult.rows[0]?.domain_class) {
    return packetResult.rows[0].domain_class;
  }

  // 2. Check feature view
  const featureResult = await client.query(`
    SELECT domain_classification FROM feature_implementations
    WHERE packet_key = $1 LIMIT 1
  `, [packetKey]).catch(() => ({ rows: [] }));
  if (featureResult.rows[0]?.domain_classification) {
    return featureResult.rows[0].domain_classification;
  }

  // 3. Check Valkey cache
  try {
    const cached = await redis.get(`domain:${packetKey}`);
    if (cached) return cached;
  } catch {
    // cache miss, continue
  }

  // 4. Deterministic fallback based on source_ref pattern
  if (sourceRef.includes('test')) return 'test';
  if (sourceRef.includes('spec')) return 'test';
  if (sourceRef.includes('component') || sourceRef.includes('ui')) return 'ui';
  if (sourceRef.includes('server') || sourceRef.includes('lib')) return 'backend';
  if (sourceRef.includes('config') || sourceRef.includes('setup')) return 'config';
  if (sourceRef.includes('doc') || sourceRef.includes('readme')) return 'documentation';

  return 'unknown';
}

async function materializeProjection(
  client: PoolClient,
  redis: Redis,
  limit: number = 0
): Promise<{ materialized: number; errors: number }> {
  let materialized = 0;
  let errors = 0;

  // Query all packets (with optional limit)
  const query = limit > 0
    ? `SELECT packet_key, source_ref FROM atlas_packets LIMIT ${limit}`
    : 'SELECT packet_key, source_ref FROM atlas_packets';

  const packets = await client.query(query);

  console.log(`📝 Materializing ${packets.rows.length} packets...`);

  for (const packet of packets.rows) {
    try {
      const { symbols, ast_facts } = await extractStructuralFacts(client, packet.packet_key, packet.source_ref);
      const { keywords, bm25_terms, identifiers, file_tokens } = await extractLexicalFacts(client, packet.source_ref);
      const domain_class = await extractDomainClass(client, redis, packet.packet_key, packet.source_ref);

      // Upsert into projection table
      await client.query(`
        INSERT INTO registry_enrichment_projection (
          packet_key, source_ref, symbols, ast_facts,
          keywords, bm25_terms, identifiers, file_tokens,
          domain_class, materialization_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (packet_key) DO UPDATE SET
          symbols = EXCLUDED.symbols,
          ast_facts = EXCLUDED.ast_facts,
          keywords = EXCLUDED.keywords,
          bm25_terms = EXCLUDED.bm25_terms,
          identifiers = EXCLUDED.identifiers,
          file_tokens = EXCLUDED.file_tokens,
          domain_class = EXCLUDED.domain_class,
          materialization_version = EXCLUDED.materialization_version,
          updated_at = NOW()
      `, [
        packet.packet_key,
        packet.source_ref,
        symbols,
        JSON.stringify(ast_facts),
        keywords,
        bm25_terms,
        identifiers,
        file_tokens,
        domain_class,
        MATERIALIZATION_VERSION,
      ]);

      materialized++;

      if (materialized % 1000 === 0) {
        console.log(`  ✓ ${materialized} packets materialized`);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.warn(`  ⚠️  Error on ${packet.packet_key}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  return { materialized, errors };
}

async function main() {
  const client = await pool.connect();
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  });

  try {
    console.log('🔧 Materializing Registry Enrichment Projection\n');

    // Ensure table exists
    await ensureProjectionTable(client);
    console.log('✅ Projection table ensured\n');

    // Materialize the projection
    const { materialized, errors } = await materializeProjection(client, redis);

    console.log(`\n📊 Materialization Complete`);
    console.log(`  ✓ Materialized: ${materialized}`);
    console.log(`  ⚠️  Errors: ${errors}`);
    console.log(`  📦 Version: ${MATERIALIZATION_VERSION}`);

    process.exit(errors > materialized * 0.01 ? 1 : 0);
  } catch (err) {
    console.error('❌ Materialization failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await client.release();
    await redis.quit();
  }
}

main();
