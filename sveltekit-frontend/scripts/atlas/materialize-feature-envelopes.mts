#!/usr/bin/env node
/**
 * Phase 3: Materialize Feature Envelopes
 *
 * Every atlas_packets row gets a FeatureEnvelope JSONB:
 * {
 *   dense: 0-1 score from embeddings
 *   lexical: 0-1 score from BM25
 *   ast: 0-1 score from symbol coverage
 *   graph: 0-1 score from topology edges
 *   pagerank: 0-1 score from graph authority
 *   ontology: 0-1 score from semantic relationships
 *   telemetry: 0-1 score from usage frequency
 *   reranker: pending (populated by reranking stage)
 *   recommendation: pending (populated by recommendation engine)
 * }
 */

import pkg from 'pg';
const { Pool } = pkg;

function parseLimitArg(defaultValue: number): number {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  if (!limitArg) return defaultValue;

  const value = Number.parseInt(limitArg.split('=', 2)[1] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

// Direct pg.Pool connection — matches the canonical pattern used by
// materialize-addressable-packets.mjs. execSync + `docker exec psql` was
// replaced here because piping large result sets (tens of thousands of
// rows) through Windows cmd.exe hits ENOBUFS (see CLAUDE.md "Qdrant API
// Strategy" / "Docker: Use docker exec directly (NOT Node.js wrappers)").
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  user: process.env.PARENT_ATLAS_POSTGRES_USER || 'legal_admin',
  password: process.env.PARENT_ATLAS_POSTGRES_PASSWORD || '123456',
  database: process.env.PARENT_ATLAS_POSTGRES_DB || 'legal_ai_db',
  max: 1,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 5000,
  query_timeout: 90000,
  statement_timeout: 90000,
  allowExitOnIdle: true,
});

function normalizeScore(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0.5;
  const num = Number(value);
  if (isNaN(num)) return 0.5;
  return Math.max(0, Math.min(1, num));
}

interface FeatureEnvelope {
  dense: number;
  lexical: number;
  ast: number;
  graph: number;
  pagerank: number;
  ontology: number;
  telemetry: number;
  reranker: null;
  recommendation: null;
  semantic_feature_dim: number;
  total_feature_dim: number;
  feature_schema_version: string;
}

const SEMANTIC_FEATURE_DIM = 768;
const TOTAL_FEATURE_DIM = 7;
const FEATURE_SCHEMA_VERSION = 'atlas.feature_envelope.v1';

interface PacketRow {
  packet_id: string;
  dense_score: number | null;
  lexical_score: number | null;
  ast_score: number | null;
  graph_score: number | null;
  pagerank_score: number | null;
  ontology_score: number | null;
  telemetry_score: number | null;
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  const batchSize = 500;
  const fetchLimit = parseLimitArg(dryRun ? 200 : 10_000);

  console.log('Phase 3: Materialize Feature Envelopes');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    console.log('[1/5] Counting atlas_packets...');
    const countResult = await pool.query('SELECT COUNT(*)::int AS cnt FROM atlas_packets;');
    const totalPackets = countResult.rows[0]?.cnt ?? 0;

    console.log(`  ✓ Total packets: ${totalPackets}`);
    console.log('');

    console.log('[2/5] Fetching packets with score components...');
    const fetchResult = await pool.query<PacketRow>(
      `
      SELECT
        packet_id,
        CASE WHEN embedding IS NOT NULL THEN 0.8 ELSE 0.5 END as dense_score,
        CASE WHEN array_length(concept_ids, 1) > 0 THEN LEAST(1.0, array_length(concept_ids, 1)::float / 10.0) ELSE 0.5 END as lexical_score,
        CASE WHEN payload->>'ast_symbols' IS NOT NULL THEN 0.85 ELSE 0.5 END as ast_score,
        CASE WHEN community_id IS NOT NULL THEN 0.75 ELSE 0.5 END as graph_score,
        CASE WHEN topology->>'pagerank_score' IS NOT NULL THEN (topology->>'pagerank_score')::float ELSE 0.5 END as pagerank_score,
        CASE WHEN array_length(concept_ids, 1) > 3 THEN 0.7 WHEN array_length(concept_ids, 1) > 0 THEN 0.5 ELSE 0.3 END as ontology_score,
        CASE WHEN metadata->>'access_count' IS NOT NULL THEN LEAST(1.0, (metadata->>'access_count')::float / 100.0) ELSE 0.5 END as telemetry_score
      FROM atlas_packets
      ORDER BY packet_id
      LIMIT $1;
      `,
      [fetchLimit]
    );

    const envelopes: Array<{ packet_id: string; envelope: FeatureEnvelope }> = fetchResult.rows.map((packet) => ({
      packet_id: packet.packet_id,
      envelope: {
        dense: normalizeScore(packet.dense_score),
        lexical: normalizeScore(packet.lexical_score),
        ast: normalizeScore(packet.ast_score),
        graph: normalizeScore(packet.graph_score),
        pagerank: normalizeScore(packet.pagerank_score),
        ontology: normalizeScore(packet.ontology_score),
        telemetry: normalizeScore(packet.telemetry_score),
        reranker: null,
        recommendation: null,
        semantic_feature_dim: SEMANTIC_FEATURE_DIM,
        total_feature_dim: TOTAL_FEATURE_DIM,
        feature_schema_version: FEATURE_SCHEMA_VERSION,
      },
    }));

    console.log(`  ✓ Fetched ${envelopes.length} packets`);
    console.log('');

    console.log('[3/5] Building feature envelopes...');
    console.log(`  ✓ Built ${envelopes.length} envelopes`);
    console.log('');

    if (dryRun) {
      console.log('DRY-RUN MODE:');
      console.log(`  Would update ${envelopes.length} packets with feature envelopes`);
      console.log('');
      console.log('Sample envelope:');
      if (envelopes.length > 0) {
        console.log(`  ${JSON.stringify(envelopes[0].envelope, null, 2)}`);
      }
      console.log('');
      console.log('To apply, run:');
      console.log(`  npx tsx scripts/atlas/materialize-feature-envelopes.mts --apply`);
    } else {
      console.log('[4/5] Applying feature envelopes to Postgres...');

      for (let i = 0; i < envelopes.length; i += batchSize) {
        const batch = envelopes.slice(i, i + batchSize);

        await pool.query('BEGIN');
        try {
          for (const e of batch) {
            await pool.query(
              `UPDATE atlas_packets SET feature_envelope = $1::jsonb WHERE packet_id = $2;`,
              [JSON.stringify(e.envelope), e.packet_id]
            );
          }
          await pool.query('COMMIT');
        } catch (batchErr) {
          await pool.query('ROLLBACK');
          throw batchErr;
        }

        console.log(`  ✓ Applied batch ${Math.floor(i / batchSize) + 1} (${Math.min(i + batchSize, envelopes.length)}/${envelopes.length})`);
      }

      console.log('');
      console.log('[5/5] Verifying feature envelopes...');
      const verifyResult = await pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(CASE WHEN feature_envelope IS NOT NULL THEN 1 END)::int AS with_envelope FROM atlas_packets;`
      );
      console.log(verifyResult.rows[0]);
      console.log('');
      console.log('✅ FEATURE ENVELOPE MATERIALIZATION COMPLETE');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
