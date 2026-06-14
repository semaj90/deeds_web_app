#!/usr/bin/env node
/**
 * Analytics & Clustering Health Logger
 *
 * Baseline health metrics for Parent Atlas before schema changes.
 * Reads canonical ledgers + enrichment mirrors, captures state snapshot.
 *
 * Purpose: Prove each new table improves coverage, not just adds schema.
 *
 * Output:
 *   - docs/reports/atlas-clustering-health.json
 *   - docs/reports/atlas-clustering-health.md
 *   - docs/reports/atlas-clustering-health-history.jsonl (append)
 */

import pg from 'pg';
import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const redisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
};

if (process.env.REDIS_PASSWORD) {
  redisOptions.password = process.env.REDIS_PASSWORD;
}

const redis = new Redis(redisOptions);
redis.on('error', () => {});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

// === POSTGRES METRICS ===

async function getPostgresMetrics() {
  logger.log('\n▶ Postgres Ledger Metrics');
  logger.log('─────────────────────────');

  const metrics = {};

  try {
    // atlas_packets canonical identity
    const packetsRes = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as with_packet_key,
        COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as with_source_ref,
        COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as with_feature_id,
        COUNT(DISTINCT packet_key) as unique_packet_keys,
        COUNT(packet_key) - COUNT(DISTINCT packet_key) as duplicate_packet_keys
      FROM atlas_packets
    `);

    const p = packetsRes.rows[0];
    metrics.atlas_packets = {
      status: 'present',
      total: parseInt(p.total),
      with_packet_key: parseInt(p.with_packet_key),
      with_source_ref: parseInt(p.with_source_ref),
      with_feature_id: parseInt(p.with_feature_id),
      coverage: {
        packet_key_pct: ((p.with_packet_key / p.total) * 100).toFixed(1),
        source_ref_pct: ((p.with_source_ref / p.total) * 100).toFixed(1),
        feature_id_pct: ((p.with_feature_id / p.total) * 100).toFixed(1),
      },
      duplicates: parseInt(p.duplicate_packet_keys),
    };

    logger.ok(`atlas_packets: ${metrics.atlas_packets.total} packets`);
    logger.info(`  packet_key: ${metrics.atlas_packets.with_packet_key} (${metrics.atlas_packets.coverage.packet_key_pct}%)`);
    logger.info(`  source_ref: ${metrics.atlas_packets.with_source_ref} (${metrics.atlas_packets.coverage.source_ref_pct}%)`);
    logger.info(`  feature_id: ${metrics.atlas_packets.with_feature_id} (${metrics.atlas_packets.coverage.feature_id_pct}%)`);

    // Feature cardinality
    const featuresRes = await pool.query(`
      SELECT
        COUNT(DISTINCT feature_id) as feature_count,
        COUNT(DISTINCT community_id) as community_count
      FROM atlas_packets
      WHERE feature_id IS NOT NULL
    `);

    const f = featuresRes.rows[0];
    metrics.cardinality = {
      features: parseInt(f.feature_count),
      communities: parseInt(f.community_count),
    };

    logger.info(`  Features: ${metrics.cardinality.features}, Communities: ${metrics.cardinality.communities}`);

    // Check existence of supporting tables
    const tableNames = [
      'atlas_feature_map',
      'atlas_cards',
      'nes_chrom_packets',
      'atlas_tree_nodes',
      'atlas_tree_edges',
      'atlas_svg_glyphs',
      'atlas_topology_index',
      'atlas_qdrant_mirror',
      'atlas_redis_mirror',
      'atlas_chunks',
      'atlas_summary_layers',
      'atlas_feature_cards',
      'atlas_feature_edges',
      'atlas_dependency_edges',
    ];

    metrics.derived_tables = {};

    for (const tableName of tableNames) {
      try {
        const countRes = await pool.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
        metrics.derived_tables[tableName] = {
          status: 'present',
          count: parseInt(countRes.rows[0].cnt),
        };
        logger.ok(`  ${tableName}: ${metrics.derived_tables[tableName].count} rows`);
      } catch (err) {
        metrics.derived_tables[tableName] = {
          status: 'missing',
          count: 0,
        };
        logger.warn(`  ${tableName}: missing`);
      }
    }

  } catch (err) {
    logger.error(`Postgres metrics failed: ${err.message}`);
  }

  return metrics;
}

// === QDRANT METRICS ===

async function getQdrantMetrics() {
  logger.log('\n▶ Qdrant Mirror Metrics');
  logger.log('───────────────────────');

  const metrics = {};
  const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');

  try {
    // Collection info
    const collectionsRes = await fetch(`${QDRANT_URL}/collections`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());

    const collections = ['codebase_chunks_768', 'feature_cards_768', 'summary_layers_768', 'memory_cards_768', 'glyph_vectors_768'];

    metrics.collections = {};

    for (const collName of collections) {
      try {
        const infoRes = await fetch(`${QDRANT_URL}/collections/${collName}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }).then(r => r.json());

        if (infoRes.result) {
          metrics.collections[collName] = {
            status: 'present',
            point_count: infoRes.result.points_count,
          };
          logger.ok(`  ${collName}: ${infoRes.result.points_count} points`);
        }
      } catch (err) {
        metrics.collections[collName] = { status: 'missing' };
        logger.warn(`  ${collName}: not available`);
      }
    }

    // Payload coverage sample (codebase_chunks_768 only)
    if (metrics.collections['codebase_chunks_768']?.point_count > 0) {
      const sampleRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100, with_payload: true, with_vectors: false })
      }).then(r => r.json());

      const points = sampleRes.result?.points || [];
      metrics.payload_coverage = {
        sampled: points.length,
        packet_key: points.filter(p => p.payload?.packet_key).length,
        source_ref: points.filter(p => p.payload?.source_ref).length,
        feature_id: points.filter(p => p.payload?.feature_id).length,
        feature_label: points.filter(p => p.payload?.feature_label).length,
        file_path: points.filter(p => p.payload?.file_path).length,
        community_id: points.filter(p => p.payload?.community_id).length,
        som_cluster: points.filter(p => p.payload?.som_cluster).length,
        tags: points.filter(p => p.payload?.tags).length,
      };

      logger.info(`  Payload coverage (${points.length} sampled):`);
      Object.entries(metrics.payload_coverage).forEach(([k, v]) => {
        if (k !== 'sampled') {
          const pct = ((v / points.length) * 100).toFixed(1);
          logger.info(`    ${k}: ${v}/${points.length} (${pct}%)`);
        }
      });
    }

  } catch (err) {
    logger.warn(`Qdrant metrics unavailable: ${err.message}`);
    metrics.status = 'not_available';
  }

  return metrics;
}

// === REDIS METRICS ===

async function getRedisMetrics() {
  logger.log('\n▶ Redis Cache Metrics');
  logger.log('─────────────────────');

  const metrics = {};

  try {
    await redis.connect();

    // Count Karpathy scores
    const karpathyKeys = await redis.keys('gpu:karpathy:scores*');
    const encodedKeys = await redis.keys('gpu:karpathy:encoded*');
    const centroidKeys = await redis.keys('centroid:*');
    const somKeys = await redis.keys('som:*');
    const bifrostKeys = await redis.keys('bifrost:*');

    metrics.redis = {
      status: 'present',
      karpathy_scores_keys: karpathyKeys.length,
      karpathy_encoded_keys: encodedKeys.length,
      centroid_keys: centroidKeys.length,
      som_keys: somKeys.length,
      bifrost_keys: bifrostKeys.length,
      total_keys: karpathyKeys.length + encodedKeys.length + centroidKeys.length + somKeys.length + bifrostKeys.length,
    };

    logger.ok(`  gpu:karpathy:scores: ${metrics.redis.karpathy_scores_keys} keys`);
    logger.ok(`  gpu:karpathy:encoded: ${metrics.redis.karpathy_encoded_keys} keys`);
    logger.ok(`  centroid:*: ${metrics.redis.centroid_keys} keys`);
    logger.ok(`  som:*: ${metrics.redis.som_keys} keys`);
    logger.ok(`  bifrost:*: ${metrics.redis.bifrost_keys} keys`);
    logger.info(`  Total: ${metrics.redis.total_keys} cached keys`);

  } catch (err) {
    logger.warn(`Redis metrics unavailable: ${err.message}`);
    metrics.redis = { status: 'not_available' };
  } finally {
    try {
      if (redis.status !== 'close') await redis.quit();
    } catch (e) {
      redis.disconnect();
    }
  }

  return metrics;
}

// === MAIN LOGGER ===

async function logClusteringHealth() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log('║  Parent Atlas Analytics & Clustering Health Logger             ║');
  logger.log('╚════════════════════════════════════════════════════════════════╝');

  try {
    mkdirSync(REPORTS_DIR, { recursive: true });

    const timestamp = new Date().toISOString();

    const postgres = await getPostgresMetrics();
    const qdrant = await getQdrantMetrics();
    const redis = await getRedisMetrics();

    // === RECOMMENDATIONS ===

    const recommendations = [];

    if (!postgres.derived_tables.atlas_tree_nodes || postgres.derived_tables.atlas_tree_nodes.status === 'missing') {
      recommendations.push({
        priority: 1,
        action: 'Create atlas_tree_nodes table',
        reason: 'Document hierarchy is load-bearing for multihop retrieval',
        blocker: true,
      });
    }

    if (!postgres.derived_tables.atlas_topology_index || postgres.derived_tables.atlas_topology_index.status === 'missing') {
      recommendations.push({
        priority: 2,
        action: 'Create atlas_topology_index table',
        reason: '4D positioning (x_cosine, y_graph, z_som, w_authority) needed for ACE reranking',
        blocker: false,
      });
    }

    if (!postgres.derived_tables.atlas_svg_glyphs || postgres.derived_tables.atlas_svg_glyphs.status === 'missing') {
      recommendations.push({
        priority: 3,
        action: 'Create atlas_svg_glyphs table',
        reason: 'Multimodal retrieval foundation (SVG/OCR/UTF8 embeddings)',
        blocker: false,
      });
    }

    if (postgres.atlas_packets?.coverage?.packet_key_pct < 95) {
      recommendations.push({
        priority: 0,
        action: 'Run compute-missing-packet-keys.mjs',
        reason: `packet_key coverage is only ${postgres.atlas_packets.coverage.packet_key_pct}% — blocks identity gate`,
        blocker: true,
      });
    }

    // === REPORT ===

    const report = {
      timestamp,
      postgres,
      qdrant,
      redis,
      recommendations: recommendations.sort((a, b) => a.priority - b.priority),
      readiness: {
        identity_gate_pass: postgres.atlas_packets?.coverage?.packet_key_pct >= 95,
        enrichment_mirrors_present: Object.keys(qdrant.collections || {}).length > 0 && redis.redis?.status === 'present',
        derived_tables_present: Object.values(postgres.derived_tables || {}).some(t => t.status === 'present'),
      },
    };

    // JSON
    writeFileSync(
      resolve(REPORTS_DIR, 'atlas-clustering-health.json'),
      JSON.stringify(report, null, 2)
    );
    logger.ok(`\n✅ Report: ${resolve(REPORTS_DIR, 'atlas-clustering-health.json')}`);

    // Markdown
    const markdown = `# Parent Atlas Analytics & Clustering Health

**Snapshot:** ${timestamp}

## Postgres Canonical Ledgers

### atlas_packets (Identity Spine)
- **Total packets:** ${postgres.atlas_packets?.total || 0}
- **packet_key coverage:** ${postgres.atlas_packets?.coverage?.packet_key_pct || 0}% (${postgres.atlas_packets?.with_packet_key || 0}/${postgres.atlas_packets?.total || 0})
- **source_ref coverage:** ${postgres.atlas_packets?.coverage?.source_ref_pct || 0}%
- **feature_id coverage:** ${postgres.atlas_packets?.coverage?.feature_id_pct || 0}%
- **Duplicate packet_keys:** ${postgres.atlas_packets?.duplicates || 0}

### Cardinality
- **Features:** ${postgres.cardinality?.features || 0}
- **Communities:** ${postgres.cardinality?.communities || 0}

### Derived Tables Status
\`\`\`
${Object.entries(postgres.derived_tables || {}).map(([name, info]) => 
  `${name}: ${info.status === 'present' ? '✅ ' + info.count + ' rows' : '❌ missing'}`
).join('\n')}
\`\`\`

## Qdrant Enrichment Mirrors

### Collections
\`\`\`
${Object.entries(qdrant.collections || {}).map(([name, info]) =>
  `${name}: ${info.status === 'present' ? '✅ ' + info.point_count + ' points' : '❌ missing'}`
).join('\n')}
\`\`\`

### Payload Coverage (codebase_chunks_768, 100-point sample)
| Field | Coverage |
|-------|----------|
${Object.entries(qdrant.payload_coverage || {}).filter(([k]) => k !== 'sampled').map(([k, v]) => {
  const pct = ((v / (qdrant.payload_coverage?.sampled || 1)) * 100).toFixed(1);
  return `| ${k} | ${v}/${qdrant.payload_coverage?.sampled} (${pct}%) |`;
}).join('\n')}

## Redis Transient Cache

\`\`\`
gpu:karpathy:scores:  ${redis.redis?.karpathy_scores_keys || 0} keys
gpu:karpathy:encoded: ${redis.redis?.karpathy_encoded_keys || 0} keys
centroid:*:           ${redis.redis?.centroid_keys || 0} keys
som:*:                ${redis.redis?.som_keys || 0} keys
bifrost:*:            ${redis.redis?.bifrost_keys || 0} keys
TOTAL:                ${redis.redis?.total_keys || 0} keys
\`\`\`

## Readiness Summary

| Gate | Status | Notes |
|------|--------|-------|
| Identity Gate (packet_key ≥95%) | ${report.readiness.identity_gate_pass ? '✅' : '❌'} | ${postgres.atlas_packets?.coverage?.packet_key_pct || 0}% |
| Enrichment Mirrors Present | ${report.readiness.enrichment_mirrors_present ? '✅' : '❌'} | Qdrant + Redis operational |
| Derived Tables Present | ${report.readiness.derived_tables_present ? '✅' : '❌'} | ${Object.values(postgres.derived_tables || {}).filter(t => t.status === 'present').length}/${Object.keys(postgres.derived_tables || {}).length} |

## Recommendations (Ranked by Dependency)

${recommendations.map((rec, i) => 
  `${i + 1}. **${rec.action}** ${rec.blocker ? '[BLOCKER]' : ''}
   - Reason: ${rec.reason}
   - Priority: ${rec.priority}`
).join('\n\n')}

---
Generated by: \`scripts/atlas/logger-analytics-clustering-health.mjs\`
`;

    writeFileSync(
      resolve(REPORTS_DIR, 'atlas-clustering-health.md'),
      markdown
    );
    logger.ok(`✅ Markdown: ${resolve(REPORTS_DIR, 'atlas-clustering-health.md')}`);

    // JSONL history (append)
    const historyEntry = { timestamp, identity_gate_pass: report.readiness.identity_gate_pass, derived_tables_count: Object.values(postgres.derived_tables || {}).filter(t => t.status === 'present').length };
    appendFileSync(
      resolve(REPORTS_DIR, 'atlas-clustering-health-history.jsonl'),
      JSON.stringify(historyEntry) + '\n'
    );
    logger.ok(`✅ History: ${resolve(REPORTS_DIR, 'atlas-clustering-health-history.jsonl')}`);

    // Summary
    logger.log('\n╔════════════════════════════════════════════════════════════════╗');
    logger.log('║  HEALTH SUMMARY                                                ║');
    logger.log('╚════════════════════════════════════════════════════════════════╝\n');
    logger.log(`Identity Gate: ${report.readiness.identity_gate_pass ? '✅ PASS' : '❌ FAIL'} (${postgres.atlas_packets?.coverage?.packet_key_pct || 0}%)`);
    logger.log(`Blockers: ${recommendations.filter(r => r.blocker).length}`);
    logger.log(`Next actions: ${recommendations.filter(r => r.priority <= 2).length} priority items`);
    logger.log('');

  } catch (err) {
    logger.error(`Fatal: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

logClusteringHealth();
