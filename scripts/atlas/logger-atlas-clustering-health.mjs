#!/usr/bin/env node
/**
 * Atlas Clustering Health Baseline Logger
 *
 * Read-only diagnostic of current Parent Atlas state across Postgres/Qdrant/Redis.
 * No mutations. No DDL. Outputs reports only.
 *
 * Purpose: Establish baseline before adding new schema.
 * Each future table migration must measurably improve coverage vs this baseline.
 *
 * Usage:
 *   node scripts/atlas/logger-atlas-clustering-health.mjs [--json] [--detailed]
 *
 * Outputs:
 *   docs/reports/atlas-clustering-health.json (structured)
 *   docs/reports/atlas-clustering-health.md (human)
 *   docs/reports/atlas-clustering-health-history.jsonl (append-only)
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import ioredis from 'ioredis';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const ROOT = resolve('.');
const REPORT_DIR = resolve(ROOT, 'docs/reports');
const JSON_REPORT = resolve(REPORT_DIR, 'atlas-clustering-health.json');
const MD_REPORT = resolve(REPORT_DIR, 'atlas-clustering-health.md');
const HISTORY_REPORT = resolve(REPORT_DIR, 'atlas-clustering-health-history.jsonl');

const flags = {
  json: process.argv.includes('--json'),
  detailed: process.argv.includes('--detailed')
};

mkdirSync(REPORT_DIR, { recursive: true });

// ────────────────────────────────────────────────────────────────
// Postgres Connection
// ────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

// ────────────────────────────────────────────────────────────────
// Redis Connection (fail-open)
// ────────────────────────────────────────────────────────────────

let redis = null;
try {
  redis = new ioredis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });
} catch (err) {
  // Fail-open: continue without Redis
}

// ────────────────────────────────────────────────────────────────
// Postgres Diagnostics
// ────────────────────────────────────────────────────────────────

async function diagnosePostgres() {
  console.log('📊 PostgreSQL Diagnostics\n');

  const report = {
    tables: {},
    indexes: {},
    coverage: {},
    issues: []
  };

  // 1. Table counts
  const tables = ['atlas_codebase_packets', 'atlas_feature_map', 'atlas_cards'];
  for (const table of tables) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      report.tables[table] = parseInt(result.rows[0].count);
      console.log(`   ✅ ${table}: ${result.rows[0].count} rows`);
    } catch (err) {
      report.tables[table] = 0;
      console.log(`   ⚠️  ${table}: not found`);
      report.issues.push(`Table ${table} does not exist`);
    }
  }

  // 2. Critical field coverage
  console.log('\n   Field Coverage (atlas_codebase_packets):\n');

  const fields = [
    'packet_key',
    'source_ref',
    'feature_id',
    'feature_label',
    'file_path',
    'community_id'
  ];

  for (const field of fields) {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as total, COUNT(${field}) as filled FROM atlas_packets`
      );
      const total = parseInt(result.rows[0].total);
      const filled = parseInt(result.rows[0].filled);
      const coverage = ((filled / total) * 100).toFixed(1);

      report.coverage[field] = {
        total,
        filled,
        percentage: parseFloat(coverage)
      };

      const symbol = coverage >= 95 ? '✅' : (coverage >= 70 ? '⚠️ ' : '❌');
      console.log(`      ${symbol} ${field}: ${coverage}% (${filled}/${total})`);
    } catch (err) {
      console.log(`      ❌ ${field}: query failed`);
      report.issues.push(`Could not check coverage for ${field}`);
    }
  }

  // 3. Index coverage
  console.log('\n   Index Coverage:\n');

  try {
    const result = await pool.query(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'atlas_codebase_packets'
      ORDER BY indexname
    `);

    const indexes = {
      btree: [],
      gin: [],
      gist: [],
      hash: [],
      brin: [],
      other: []
    };

    for (const row of result.rows) {
      const def = row.indexdef.toLowerCase();
      if (def.includes('gin')) indexes.gin.push(row.indexname);
      else if (def.includes('gist')) indexes.gist.push(row.indexname);
      else if (def.includes('hash')) indexes.hash.push(row.indexname);
      else if (def.includes('brin')) indexes.brin.push(row.indexname);
      else indexes.btree.push(row.indexname);
    }

    report.indexes = {
      btree: indexes.btree.length,
      gin: indexes.gin.length,
      gist: indexes.gist.length,
      hash: indexes.hash.length,
      brin: indexes.brin.length,
      total: result.rows.length
    };

    console.log(`      ✅ B-tree: ${indexes.btree.length}`);
    console.log(`      ✅ GIN: ${indexes.gin.length}`);
    console.log(`      ✅ BRIN: ${indexes.brin.length}`);
    console.log(`      ✅ GIST: ${indexes.gist.length}`);
    console.log(`      ✅ HASH: ${indexes.hash.length}`);
    console.log(`      ✅ Total: ${result.rows.length}`);

    if (flags.detailed) {
      console.log('\n   Detailed Index List:\n');
      for (const type of ['btree', 'gin', 'gist', 'hash', 'brin']) {
        if (indexes[type].length > 0) {
          console.log(`      ${type.toUpperCase()}:`);
          for (const idx of indexes[type].slice(0, 5)) {
            console.log(`        - ${idx}`);
          }
          if (indexes[type].length > 5) {
            console.log(`        ... and ${indexes[type].length - 5} more`);
          }
        }
      }
    }
  } catch (err) {
    console.log(`      ❌ Index query failed: ${err.message}`);
    report.issues.push('Could not retrieve index information');
  }

  // 4. Duplicate packet_keys
  console.log('\n   Data Integrity:\n');

  try {
    const result = await pool.query(`
      SELECT COUNT(*) as duplicate_count
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      GROUP BY packet_key
      HAVING COUNT(*) > 1
    `);

    const duplicates = result.rows.length;
    const symbol = duplicates === 0 ? '✅' : '❌';
    console.log(`      ${symbol} Duplicate packet_keys: ${duplicates}`);

    if (duplicates > 0) {
      report.issues.push(`Found ${duplicates} duplicate packet_key groups`);
    }
  } catch (err) {
    console.log(`      ❌ Duplicate check failed`);
  }

  // 5. Optional tables readiness
  console.log('\n   Optional Tables (for future migrations):\n');

  const optionalTables = [
    'atlas_tree_nodes',
    'atlas_svg_glyphs',
    'atlas_topology_index',
    'atlas_summary_layers',
    'atlas_feature_cards',
    'atlas_feature_edges',
    'atlas_dependency_edges',
    'atlas_qdrant_mirror',
    'atlas_redis_mirror'
  ];

  const optionalStatus = {};

  for (const table of optionalTables) {
    try {
      await pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
      console.log(`      ✅ ${table}: exists`);
      optionalStatus[table] = 'exists';
    } catch (err) {
      console.log(`      ⏳ ${table}: not yet created`);
      optionalStatus[table] = 'missing';
    }
  }

  report.optionalTables = optionalStatus;

  return report;
}

// ────────────────────────────────────────────────────────────────
// Qdrant Diagnostics
// ────────────────────────────────────────────────────────────────

async function diagnoseQdrant() {
  console.log('\n📦 Qdrant Diagnostics\n');

  const report = {
    collections: {},
    payloadCoverage: {},
    issues: []
  };

  const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');

  // 1. Check main collections
  const collections = [
    'codebase_chunks_768',
    'feature_cards_768',
    'summary_layers_768',
    'memory_cards_768',
    'glyph_vectors_768'
  ];

  for (const coll of collections) {
    try {
      const res = await fetch(`${QDRANT_URL}/collections/${coll}`);
      if (res.ok) {
        const data = await res.json();
        const count = data.result?.points_count || 0;
        report.collections[coll] = count;
        console.log(`   ✅ ${coll}: ${count} points`);
      } else {
        report.collections[coll] = 0;
        console.log(`   ⏳ ${coll}: not found`);
      }
    } catch (err) {
      console.log(`   ❌ ${coll}: connection failed`);
      report.issues.push(`Could not reach Qdrant for ${coll}`);
    }
  }

  // 2. Sample payload coverage (from main collection)
  console.log('\n   Payload Coverage (codebase_chunks_768 sample):\n');

  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, with_payload: true })
    });

    if (res.ok) {
      const data = await res.json();
      const points = data.result?.points || [];

      if (points.length > 0) {
        const payloadFields = [
          'packet_key',
          'source_ref',
          'feature_id',
          'feature_label',
          'file_path',
          'tags',
          'som_cluster',
          'community_id',
          'lineage_version'
        ];

        const coverage = {};
        for (const field of payloadFields) {
          let count = 0;
          for (const point of points) {
            if (point.payload?.[field]) count++;
          }
          const pct = ((count / points.length) * 100).toFixed(1);
          coverage[field] = { count, percentage: parseFloat(pct) };

          const symbol = pct >= 95 ? '✅' : (pct >= 70 ? '⚠️ ' : '❌');
          console.log(`      ${symbol} ${field}: ${pct}% (${count}/${points.length})`);
        }

        report.payloadCoverage = coverage;
      } else {
        console.log(`      ⏳ No points available for sampling`);
      }
    }
  } catch (err) {
    console.log(`   ❌ Payload coverage check failed: ${err.message}`);
    report.issues.push('Could not sample Qdrant payloads');
  }

  return report;
}

// ────────────────────────────────────────────────────────────────
// Redis Diagnostics
// ────────────────────────────────────────────────────────────────

async function diagnoseRedis() {
  console.log('\n🔴 Redis/Valkey Diagnostics\n');

  const report = {
    connected: false,
    keyCounts: {},
    issues: []
  };

  if (!redis) {
    console.log('   ⏳ Redis not configured (fail-open)');
    report.issues.push('Redis connection not configured');
    return report;
  }

  try {
    await redis.connect();
    report.connected = true;
    console.log('   ✅ Connected to Redis');

    // 1. Key patterns
    const patterns = [
      { pattern: 'gpu:karpathy:scores', label: 'Karpathy authority scores' },
      { pattern: 'gpu:karpathy:encoded', label: 'Karpathy encoded latents' },
      { pattern: 'bifrost:*', label: 'Bifrost cache entries' },
      { pattern: 'centroid:*', label: 'Centroid entries' },
      { pattern: 'som:*', label: 'SOM topology entries' }
    ];

    console.log('\n   Key Counts:\n');

    for (const { pattern, label } of patterns) {
      try {
        let count = 0;
        if (pattern.includes('*')) {
          const keys = await redis.keys(pattern);
          count = keys.length;
        } else {
          const exists = await redis.exists(pattern);
          const type = await redis.type(pattern);
          if (type === 'hash') {
            count = await redis.hlen(pattern);
          } else if (type === 'set') {
            count = await redis.scard(pattern);
          } else {
            count = exists ? 1 : 0;
          }
        }

        report.keyCounts[pattern] = count;

        const symbol = count > 0 ? '✅' : '⏳';
        console.log(`      ${symbol} ${label} (${pattern}): ${count}`);
      } catch (err) {
        console.log(`      ❌ ${label}: query failed`);
      }
    }

    await redis.quit();
  } catch (err) {
    console.log(`   ⏳ Redis connection failed (fail-open): ${err.message}`);
    report.issues.push(`Redis connection error: ${err.message}`);
  }

  return report;
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Atlas Clustering Health Baseline Logger                      ║');
  console.log('║  Read-only diagnostics (no mutations)                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const timestamp = new Date().toISOString();
  const startTime = Date.now();

  try {
    const postgresReport = await diagnosePostgres();
    const qdrantReport = await diagnoseQdrant();
    const redisReport = await diagnoseRedis();

    const durationMs = Date.now() - startTime;

    // Consolidated report
    const fullReport = {
      timestamp,
      durationMs,
      postgres: postgresReport,
      qdrant: qdrantReport,
      redis: redisReport,
      recommendations: generateRecommendations(postgresReport)
    };

    // Write JSON report
    writeFileSync(JSON_REPORT, JSON.stringify(fullReport, null, 2));
    console.log(`\n📄 JSON Report: ${JSON_REPORT}\n`);

    // Write Markdown report
    const mdContent = generateMarkdownReport(fullReport);
    writeFileSync(MD_REPORT, mdContent);
    console.log(`📄 Markdown Report: ${MD_REPORT}\n`);

    // Append to history (JSONL)
    appendFileSync(HISTORY_REPORT, JSON.stringify(fullReport) + '\n');
    console.log(`📄 History Log: ${HISTORY_REPORT}\n`);

    // Console summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  BASELINE ESTABLISHED ✅                                      ║');
    console.log('║  Ready for schema migration planning                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (flags.json) {
      console.log(JSON.stringify(fullReport, null, 2));
    }

  } catch (err) {
    console.error('❌ Diagnostics failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function generateRecommendations(postgresReport) {
  const recommendations = [];

  // Check for low coverage fields
  for (const [field, coverage] of Object.entries(postgresReport.coverage)) {
    if (coverage.percentage < 95) {
      recommendations.push({
        priority: 'high',
        field,
        current: coverage.percentage,
        action: `Backfill ${field} (currently ${coverage.percentage}%)`
      });
    }
  }

  // Check for missing indexes
  if (postgresReport.indexes.gin < 3) {
    recommendations.push({
      priority: 'medium',
      area: 'indexes',
      current: postgresReport.indexes.gin,
      action: 'Add GIN indexes for JSONB payload and metadata columns'
    });
  }

  // Check for missing optional tables
  const missingTables = Object.entries(postgresReport.optionalTables)
    .filter(([, status]) => status === 'missing')
    .map(([table]) => table);

  if (missingTables.length > 0) {
    recommendations.push({
      priority: 'medium',
      area: 'schema',
      tables: missingTables,
      action: `Create missing tables in recommended order: ${missingTables.join(', ')}`
    });
  }

  return recommendations;
}

function generateMarkdownReport(report) {
  const { timestamp, durationMs, postgres, qdrant, redis, recommendations } = report;

  let md = `# Atlas Clustering Health Baseline\n\n`;
  md += `**Generated**: ${new Date(timestamp).toLocaleString()}\n`;
  md += `**Duration**: ${durationMs}ms\n\n`;

  // PostgreSQL section
  md += `## PostgreSQL\n\n`;
  md += `### Table Counts\n\n`;
  for (const [table, count] of Object.entries(postgres.tables)) {
    md += `- ${table}: ${count} rows\n`;
  }

  md += `\n### Field Coverage (atlas_codebase_packets)\n\n`;
  for (const [field, cov] of Object.entries(postgres.coverage)) {
    const status = cov.percentage >= 95 ? '✅' : (cov.percentage >= 70 ? '⚠️' : '❌');
    md += `- ${status} ${field}: ${cov.percentage}% (${cov.filled}/${cov.total})\n`;
  }

  md += `\n### Indexes\n\n`;
  md += `- B-tree: ${postgres.indexes.btree}\n`;
  md += `- GIN: ${postgres.indexes.gin}\n`;
  md += `- BRIN: ${postgres.indexes.brin}\n`;
  md += `- GIST: ${postgres.indexes.gist}\n`;
  md += `- HASH: ${postgres.indexes.hash}\n`;
  md += `- **Total**: ${postgres.indexes.total}\n`;

  // Qdrant section
  md += `\n## Qdrant\n\n`;
  md += `### Collections\n\n`;
  for (const [coll, count] of Object.entries(qdrant.collections)) {
    md += `- ${coll}: ${count} points\n`;
  }

  md += `\n### Payload Coverage Sample\n\n`;
  if (Object.keys(qdrant.payloadCoverage).length > 0) {
    for (const [field, cov] of Object.entries(qdrant.payloadCoverage)) {
      const status = cov.percentage >= 95 ? '✅' : (cov.percentage >= 70 ? '⚠️' : '❌');
      md += `- ${status} ${field}: ${cov.percentage}%\n`;
    }
  } else {
    md += `(no sample data)\n`;
  }

  // Redis section
  md += `\n## Redis/Valkey\n\n`;
  md += `**Connected**: ${redis.connected ? '✅' : '❌'}\n\n`;
  md += `### Key Counts\n\n`;
  for (const [pattern, count] of Object.entries(redis.keyCounts)) {
    md += `- ${pattern}: ${count}\n`;
  }

  // Recommendations
  if (recommendations.length > 0) {
    md += `\n## Recommendations\n\n`;
    for (const rec of recommendations) {
      md += `- **${rec.priority.toUpperCase()}**: ${rec.action}\n`;
    }
  }

  // Issues
  if (postgres.issues.length > 0 || qdrant.issues.length > 0 || redis.issues.length > 0) {
    md += `\n## Issues\n\n`;
    for (const issue of [...postgres.issues, ...qdrant.issues, ...redis.issues]) {
      md += `- ⚠️ ${issue}\n`;
    }
  }

  return md;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
