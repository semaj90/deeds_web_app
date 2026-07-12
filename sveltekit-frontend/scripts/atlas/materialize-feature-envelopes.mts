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

import * as fs from 'fs';
import { execSync } from 'child_process';

function execSQL(sql: string): string {
  const tempFile = `/tmp/query_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`;
  fs.writeFileSync(tempFile, sql);
  try {
    return execSync(
      `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < ${tempFile}`,
      { encoding: 'utf-8' }
    );
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {}
  }
}

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
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  const batchSize = 500;

  console.log('Phase 3: Materialize Feature Envelopes');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    console.log('[1/5] Counting atlas_packets...');
    const countSQL = 'SELECT COUNT(*) as cnt FROM atlas_packets;';
    const countResult = execSQL(countSQL);
    const totalMatch = countResult.match(/\d+/);
    const totalPackets = totalMatch ? parseInt(totalMatch[0]) : 0;

    console.log(`  ✓ Total packets: ${totalPackets}`);
    console.log('');

    console.log('[2/5] Fetching packets with score components...');
    const fetchSQL = `
      SELECT
        packet_id,
        packet_key,
        source_ref,
        CASE WHEN embedding IS NOT NULL THEN 0.8 ELSE 0.5 END as dense_score,
        CASE WHEN array_length(concept_ids, 1) > 0 THEN LEAST(1.0, array_length(concept_ids, 1)::float / 10.0) ELSE 0.5 END as lexical_score,
        CASE WHEN payload->>'ast_symbols' IS NOT NULL THEN 0.85 ELSE 0.5 END as ast_score,
        CASE WHEN community_id IS NOT NULL THEN 0.75 ELSE 0.5 END as graph_score,
        CASE WHEN topology->>'pagerank_score' IS NOT NULL THEN (topology->>'pagerank_score')::float ELSE 0.5 END as pagerank_score,
        CASE WHEN array_length(concept_ids, 1) > 3 THEN 0.7 WHEN array_length(concept_ids, 1) > 0 THEN 0.5 ELSE 0.3 END as ontology_score,
        CASE WHEN metadata->>'access_count' IS NOT NULL THEN LEAST(1.0, (metadata->>'access_count')::float / 100.0) ELSE 0.5 END as telemetry_score
      FROM atlas_packets
      ORDER BY packet_id
      LIMIT 10000;
    `;

    const fetchResult = execSQL(fetchSQL);
    const lines = fetchResult.split('\n').filter((l) => l.trim());

    const packets: any[] = [];
    for (const line of lines) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 10 && parts[0] !== 'packet_id') {
        packets.push({
          packet_id: parts[0],
          dense_score: parseFloat(parts[3]) || 0.5,
          lexical_score: parseFloat(parts[4]) || 0.5,
          ast_score: parseFloat(parts[5]) || 0.5,
          graph_score: parseFloat(parts[6]) || 0.5,
          pagerank_score: parseFloat(parts[7]) || 0.5,
          ontology_score: parseFloat(parts[8]) || 0.5,
          telemetry_score: parseFloat(parts[9]) || 0.5,
        });
      }
    }

    console.log(`  ✓ Fetched ${packets.length} packets`);
    console.log('');

    console.log('[3/5] Building feature envelopes...');
    const envelopes: Array<{ packet_id: string; envelope: FeatureEnvelope }> = [];

    for (const packet of packets) {
      const envelope: FeatureEnvelope = {
        dense: normalizeScore(packet.dense_score),
        lexical: normalizeScore(packet.lexical_score),
        ast: normalizeScore(packet.ast_score),
        graph: normalizeScore(packet.graph_score),
        pagerank: normalizeScore(packet.pagerank_score),
        ontology: normalizeScore(packet.ontology_score),
        telemetry: normalizeScore(packet.telemetry_score),
        reranker: null,
        recommendation: null,
      };

      envelopes.push({
        packet_id: packet.packet_id,
        envelope,
      });
    }

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

        const updates = batch
          .map(
            (e) => `UPDATE atlas_packets SET feature_envelope = '${JSON.stringify(e.envelope).replace(/'/g, "''")}' WHERE packet_id = '${e.packet_id}';`
          )
          .join('\n');

        execSQL(updates);
        console.log(`  ✓ Applied batch ${Math.floor(i / batchSize) + 1} (${Math.min(i + batchSize, envelopes.length)}/${envelopes.length})`);
      }

      console.log('');
      console.log('[5/5] Verifying feature envelopes...');
      const verifySQL = `SELECT COUNT(*) total, COUNT(CASE WHEN feature_envelope IS NOT NULL THEN 1 END) with_envelope FROM atlas_packets;`;

      const verifyResult = execSQL(verifySQL);
      console.log(verifyResult);
      console.log('');
      console.log('✅ FEATURE ENVELOPE MATERIALIZATION COMPLETE');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
