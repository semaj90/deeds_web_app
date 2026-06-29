#!/usr/bin/env node
/**
 * Phase B Test Orchestrator
 *
 * Runs the 3-worker pipeline in sequence with test data.
 * Logs analysis passes WITHOUT calling Gemma4/Ollama.
 *
 * Usage:
 *   npm run phase-b:test [--limit=10] [--apply]
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';

const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '10'
);

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DB,
  user: PG_USER,
  password: PG_PASSWORD,
});

async function fetchPacketsWithoutSummary(pool: Pool, limit: number) {
  const result = await pool.query(
    `
    SELECT ap.packet_key, ap.source_ref, ap.feature_id, ap.feature_label
    FROM atlas_packets ap
    LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key
    WHERE asl.packet_key IS NULL
    AND ap.packet_key IS NOT NULL
    AND ap.source_ref IS NOT NULL
    AND ap.feature_id IS NOT NULL
    ORDER BY ap.pagerank DESC NULLS LAST
    LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}

async function logAnalysisPass(pool: Pool, packet: any, passKey: string, passType: string) {
  if (!APPLY) {
    console.log(`  ✓ Would log ${passKey} for ${packet.packet_key}`);
    return;
  }

  try {
    const inputHash = createHash('sha256')
      .update(`${packet.source_ref}:${packet.feature_id}`)
      .digest('hex');

    let output: any = {};
    let scores: any = {};
    let indexPush: any = {
      postgres: true,
      qdrant: passKey === 'embeddinggemma_summary_embed_v1',
      bitfrost: passKey === 'bitfrost_cache_push_v1',
      neo4j: false,
    };

    if (passKey === 'gemma4_summary_v1') {
      output = {
        summary: `Test summary for ${packet.feature_label}`,
        summary_tokens: 12,
      };
      scores = { confidence: 0.85, coherence: 0.90 };
    } else if (passKey === 'embeddinggemma_summary_embed_v1') {
      output = {
        embedding_dim: 384,
        embedding_sample: [0.1, 0.2, 0.3, 0.4, 0.5],
      };
      scores = { magnitude: 15.8 };
    } else if (passKey === 'bitfrost_cache_push_v1') {
      output = {
        redis_keys: [`bifrost:packet:${packet.packet_key}`],
        qdrant_collection: 'chrom97_context',
      };
      scores = { redis_writes: 1, qdrant_points: 1 };
    }

    await pgPool.query(
      `
      INSERT INTO analysis_pass_results (
        pass_key, packet_key, source_ref, feature_id,
        pass_type, status,
        input_hash, model_name,
        output, scores, index_push, provenance,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8,
        $9, $10, $11, $12,
        NOW(), NOW()
      )
      `,
      [
        passKey,
        packet.packet_key,
        packet.source_ref,
        packet.feature_id,
        passType,
        'success',
        inputHash,
        passKey === 'gemma4_summary_v1' ? 'gemma4-legal-iq4xs-direct.gguf' :
        passKey === 'embeddinggemma_summary_embed_v1' ? 'embeddinggemma:latest' : 'cache-push',
        JSON.stringify(output),
        JSON.stringify(scores),
        JSON.stringify(indexPush),
        JSON.stringify({
          source: 'test_orchestrator',
          repo_analysis: true,
          input_kind: passType,
          identity: {
            identity_mutated: false,
            join_key: 'packet_key',
            fallback_join: 'source_ref:feature_id',
          },
        }),
      ]
    );
  } catch (err) {
    console.error(`  ✗ Error: ${err}`);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Test Orchestrator (3-Worker Pipeline)                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Limit: ${LIMIT} packets\n`);

  try {
    const packets = await fetchPacketsWithoutSummary(pgPool, LIMIT);
    console.log(`📦 Fetched ${packets.length} packets\n`);

    if (packets.length === 0) {
      console.log('✅ All packets already have summaries');
      return;
    }

    // Step 1: Log Gemma4 summarization passes
    console.log(`Step 1: Logging ${packets.length} Gemma4 summarization passes...`);
    for (const packet of packets) {
      await logAnalysisPass(pgPool, packet, 'gemma4_summary_v1', 'summarization');
    }
    console.log(`✅ Logged ${packets.length} summary passes\n`);

    // Step 2: Log embedding passes
    console.log(`Step 2: Logging ${packets.length} embedding passes...`);
    for (const packet of packets) {
      await logAnalysisPass(pgPool, packet, 'embeddinggemma_summary_embed_v1', 'embedding');
    }
    console.log(`✅ Logged ${packets.length} embedding passes\n`);

    // Step 3: Log cache push passes
    console.log(`Step 3: Logging ${packets.length} cache push passes...`);
    for (const packet of packets) {
      await logAnalysisPass(pgPool, packet, 'bitfrost_cache_push_v1', 'cache_push');
    }
    console.log(`✅ Logged ${packets.length} cache push passes\n`);

    // Verify
    if (APPLY) {
      const verifyResult = await pgPool.query(`
        SELECT pass_key, COUNT(*) as count
        FROM analysis_pass_results
        WHERE pass_key IN ('gemma4_summary_v1', 'embeddinggemma_summary_embed_v1', 'bitfrost_cache_push_v1')
        GROUP BY pass_key
        ORDER BY pass_key;
      `);

      console.log('📊 Verification:');
      for (const row of verifyResult.rows) {
        console.log(`   ${row.pass_key}: ${row.count} passes`);
      }
      console.log('');
    }

    console.log('✅ Complete\n');
  } catch (err) {
    console.error(`\n❌ Error: ${err}`);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();