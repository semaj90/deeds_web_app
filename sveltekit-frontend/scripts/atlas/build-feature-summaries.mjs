#!/usr/bin/env node
/**
 * build-feature-summaries.mjs
 *
 * MapReduce pipeline: atlas_packets → feature summaries → feature cards
 * Output: docs/reports/atlas-feature-cards.json
 *
 * Usage:
 *   npm run atlas:summaries:mapreduce          # dry-run
 *   npm run atlas:summaries:mapreduce:apply    # apply to DB
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:legal_password@127.0.0.1:5432/legal_ai_db';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function queryDB(pool, sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (err) {
    console.error('Query failed:', sql, err.message);
    throw err;
  }
}

async function buildFeatureCards(pool) {
  log('Building feature cards from atlas_packets');

  const features = await queryDB(pool, `
    SELECT
      feature_id,
      COUNT(*) as packet_count,
      COUNT(DISTINCT community_id) as community_count,
      COUNT(DISTINCT source_ref) as file_count,
      MIN(created_at) as first_seen,
      MAX(updated_at) as last_updated
    FROM atlas_packets
    WHERE feature_id IS NOT NULL
    GROUP BY feature_id
    ORDER BY packet_count DESC
  `);

  log(`Found ${features.length} features with packets`);

  const cards = [];

  for (const feat of features) {
    const packets = await queryDB(pool, `
      SELECT DISTINCT
        packet_key, source_ref, community_id,
        metadata->>'summary' as summary,
        metadata->>'domain' as domain,
        metadata->>'tags' as tags
      FROM atlas_packets
      WHERE feature_id = $1
      LIMIT 20
    `, [feat.feature_id]);

    const tags = new Set();
    packets.forEach(p => {
      if (p.tags) {
        try {
          const parsed = JSON.parse(p.tags);
          if (Array.isArray(parsed)) parsed.forEach(t => tags.add(t));
        } catch (e) {
          // Skip parse errors
        }
      }
    });

    const card = {
      feature_id: feat.feature_id,
      feature_label: feat.feature_id.replace(/_/g, ' ').toUpperCase(),
      packet_count: feat.packet_count,
      community_count: feat.community_count,
      file_count: feat.file_count,
      first_seen: feat.first_seen,
      last_updated: feat.last_updated,

      // Content
      summary: packets[0]?.summary || `Feature ${feat.feature_id}`,
      domain: packets[0]?.domain || 'unknown',
      tags: Array.from(tags),

      // Enumeration
      paths: [...new Set(packets.map(p => p.source_ref))],
      source_refs: [...new Set(packets.map(p => p.source_ref))],
      packet_keys: packets.map(p => p.packet_key),
      chunk_ids: packets.map(p => p.packet_key),
      parent_ids: [],

      // Metadata for ACE synthesis
      commands: [],
      env_vars: [],
      qdrant_tags: Array.from(tags),
      karpathy_score: null,
      authority_score: null,

      metadata: {
        created_at: new Date().toISOString(),
        packet_count: feat.packet_count,
        community_distribution: packets.reduce((acc, p) => {
          acc[p.community_id || 'unknown'] = (acc[p.community_id || 'unknown'] || 0) + 1;
          return acc;
        }, {})
      }
    };

    cards.push(card);
    if (VERBOSE) log(`  ${feat.feature_id}: ${feat.packet_count} packets`);
  }

  return cards;
}

async function buildFeatureEdges(pool, features) {
  log('Building feature edges (inter-feature relationships)');

  const edges = [];
  const featureIds = features.map(f => f.feature_id);

  for (let i = 0; i < featureIds.length; i++) {
    for (let j = i + 1; j < featureIds.length; j++) {
      const feat1 = featureIds[i];
      const feat2 = featureIds[j];

      const result = await queryDB(pool, `
        SELECT COUNT(*) as count
        FROM (
          SELECT DISTINCT source_ref FROM atlas_packets WHERE feature_id = $1
          INTERSECT
          SELECT DISTINCT source_ref FROM atlas_packets WHERE feature_id = $2
        ) t
      `, [feat1, feat2]);

      const shared = result[0]?.count || 0;
      if (shared > 0) {
        edges.push({
          source_feature: feat1,
          target_feature: feat2,
          edge_type: 'SHARES_SOURCE',
          weight: shared
        });
      }
    }
  }

  log(`Found ${edges.length} inter-feature relationships`);
  return edges;
}

async function writeReports(cards, edges) {
  const reportDir = path.join(ROOT, 'docs/reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const cardsPath = path.join(reportDir, 'atlas-feature-cards.json');
  const edgesPath = path.join(reportDir, 'atlas-feature-edges.json');

  fs.writeFileSync(cardsPath, JSON.stringify(cards, null, 2));
  fs.writeFileSync(edgesPath, JSON.stringify(edges, null, 2));

  log(`✓ Feature cards: ${cardsPath}`);
  log(`✓ Feature edges: ${edgesPath}`);

  return { cardsPath, edgesPath };
}

async function main() {
  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    log('Feature Summaries & Cards Builder');
    log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);

    const cards = await buildFeatureCards(pool);
    const edges = await buildFeatureEdges(pool, cards);

    if (!DRY_RUN) {
      await writeReports(cards, edges);
    } else {
      log('DRY-RUN: Would write', {
        feature_cards: cards.length,
        feature_edges: edges.length
      });
    }

    log('\n=== FEATURE SUMMARIES COMPLETE ===');
    log(`Features: ${cards.length}`);
    log(`Edges: ${edges.length}`);

    if (cards.length > 0) {
      log(`\nSample card (${cards[0].feature_id}):`);
      log(JSON.stringify({
        feature_id: cards[0].feature_id,
        packet_count: cards[0].packet_count,
        files: cards[0].file_count,
        communities: cards[0].community_count,
        tags: cards[0].tags.slice(0, 5)
      }, null, 2));
    }

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});