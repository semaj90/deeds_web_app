#!/usr/bin/env npx tsx
/**
 * Materialize Registry Enrichment Projection (Cheap Lanes)
 *
 * Extracts structural (AST), lexical, and domain facts from packets and materializes
 * them into the registry_enrichment_projection table.
 *
 * This is the FIRST barrier in the unified registry enrichment pipeline.
 * Input: atlas_packets (canonical)
 * Output: registry_enrichment_projection (derived, VIEW-like)
 *
 * Architecture:
 * - Structural: symbols, ast_facts from feature_implementations or ast_symbols column
 * - Lexical: keywords, bm25_terms, identifiers, file_tokens (from code text or feature_lexical)
 * - Domain: domain_class via priority chain (canonical → feature_view → cache → fallback)
 *
 * Usage:
 *   npx tsx scripts/atlas/materialize-registry-structural-lexical-domain.mts [--limit N] [--dry-run]
 */

import { pool } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

interface EnrichmentRow {
  packet_key: string;
  source_ref: string;
  symbols: string[];
  ast_facts: string[];
  keywords: string[];
  bm25_terms: string[];
  identifiers: string[];
  file_tokens: string[];
  domain_class: string | null;
}

const MATERIALIZATION_VERSION = 1;

async function extractStructuralFacts(client: any, packetKey: string): Promise<{ symbols: string[]; ast_facts: string[] }> {
  try {
    // Try to read from feature_implementations AST symbols
    const result = await client.query(
      `SELECT
        COALESCE(array_agg(DISTINCT symbol_name), '{}') as symbols,
        COALESCE(array_agg(DISTINCT kind), '{}') as ast_facts
      FROM feature_implementations
      WHERE packet_key = $1`,
      [packetKey]
    );

    if (result.rows[0]) {
      return {
        symbols: result.rows[0].symbols || [],
        ast_facts: result.rows[0].ast_facts || []
      };
    }
  } catch {
    // Table may not exist
  }

  return { symbols: [], ast_facts: [] };
}

async function extractLexicalFacts(client: any, source_ref: string): Promise<{ keywords: string[]; bm25_terms: string[]; identifiers: string[]; file_tokens: string[] }> {
  try {
    // Try to read from feature_lexical if it exists
    const result = await client.query(
      `SELECT
        COALESCE(keywords, '{}') as keywords,
        COALESCE(bm25_terms, '{}') as bm25_terms,
        COALESCE(identifiers, '{}') as identifiers,
        COALESCE(file_tokens, '{}') as file_tokens
      FROM feature_lexical
      WHERE source_ref = $1
      LIMIT 1`,
      [source_ref]
    ).catch(() => ({ rows: [] }));

    if (result.rows[0]) {
      return {
        keywords: result.rows[0].keywords || [],
        bm25_terms: result.rows[0].bm25_terms || [],
        identifiers: result.rows[0].identifiers || [],
        file_tokens: result.rows[0].file_tokens || []
      };
    }
  } catch {
    // Table may not exist
  }

  return { keywords: [], bm25_terms: [], identifiers: [], file_tokens: [] };
}

async function extractDomainClass(client: any, packetKey: string, source_ref: string): Promise<string | null> {
  try {
    // Priority chain:
    // 1. Canonical packet.domain_class (if exists)
    let result = await client.query(
      `SELECT domain_class FROM atlas_packets WHERE packet_key = $1`,
      [packetKey]
    ).catch(() => ({ rows: [] }));

    if (result.rows[0]?.domain_class) {
      return result.rows[0].domain_class;
    }

    // 2. Feature view domain classification
    result = await client.query(
      `SELECT domain_class FROM feature_domains WHERE source_ref = $1 LIMIT 1`,
      [source_ref]
    ).catch(() => ({ rows: [] }));

    if (result.rows[0]?.domain_class) {
      return result.rows[0].domain_class;
    }

    // 3. Redis cache fallback (if available)
    // (Skipped in this impl; can add via ioredis if needed)

    // 4. Infer from file path (heuristic fallback)
    if (source_ref.includes('/legal') || source_ref.includes('case') || source_ref.includes('evidence')) {
      return 'legal';
    }
    if (source_ref.includes('/server') || source_ref.includes('db') || source_ref.includes('sql')) {
      return 'backend';
    }
    if (source_ref.includes('/lib') || source_ref.includes('component')) {
      return 'frontend';
    }
  } catch {
    // Fallback to null
  }

  return null;
}

async function materializeProjection(client: any, limit: number = 0, isDryRun: boolean = false): Promise<{ materialized: number; errors: number }> {
  let materialized = 0;
  let errors = 0;

  // Query all packets
  const query = limit > 0
    ? `SELECT packet_key, source_ref FROM atlas_packets LIMIT ${limit}`
    : 'SELECT packet_key, source_ref FROM atlas_packets';

  const packets = await client.query(query);

  console.log(`📝 Materializing ${packets.rows.length} packets with structural/lexical/domain facts...`);

  for (const packet of packets.rows) {
    try {
      // Extract facts
      const structural = await extractStructuralFacts(client, packet.packet_key);
      const lexical = await extractLexicalFacts(client, packet.source_ref);
      const domain = await extractDomainClass(client, packet.packet_key, packet.source_ref);

      if (!isDryRun) {
        // Upsert into projection
        await client.query(
          `INSERT INTO registry_enrichment_projection (
            packet_key, source_ref, symbols, ast_facts, keywords, bm25_terms,
            identifiers, file_tokens, domain_class, materialization_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (packet_key) DO UPDATE SET
            source_ref = EXCLUDED.source_ref,
            symbols = EXCLUDED.symbols,
            ast_facts = EXCLUDED.ast_facts,
            keywords = EXCLUDED.keywords,
            bm25_terms = EXCLUDED.bm25_terms,
            identifiers = EXCLUDED.identifiers,
            file_tokens = EXCLUDED.file_tokens,
            domain_class = EXCLUDED.domain_class,
            materialization_version = EXCLUDED.materialization_version,
            updated_at = NOW()`,
          [
            packet.packet_key,
            packet.source_ref,
            structural.symbols,
            structural.ast_facts,
            lexical.keywords,
            lexical.bm25_terms,
            lexical.identifiers,
            lexical.file_tokens,
            domain,
            MATERIALIZATION_VERSION
          ]
        );
      }

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

  try {
    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith('--limit='));
    const isDryRun = args.includes('--dry-run');

    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

    console.log('🔧 Materializing Registry Enrichment Projection (Cheap Lanes)\n');
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`Limit: ${limit > 0 ? limit : 'all packets'}\n`);

    // Materialize the projection
    const { materialized, errors } = await materializeProjection(client, limit, isDryRun);

    console.log(`\n📊 Materialization Complete`);
    console.log(`  ✓ Materialized: ${materialized}`);
    console.log(`  ⚠️  Errors: ${errors}`);
    console.log(`  📦 Version: ${MATERIALIZATION_VERSION}`);
    console.log(`  🔄 Barrier: CHEAP_LANES (structural/lexical/domain)`);

    process.exit(errors > materialized * 0.01 ? 1 : 0);
  } catch (err) {
    console.error('❌ Materialization failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await client.release();
  }
}

main();
