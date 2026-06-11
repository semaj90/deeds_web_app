#!/usr/bin/env node
/**
 * Phase 3C: Classify Packet Temperature
 *
 * HOT: frequently accessed in ACE context, cached in Redis
 * WARM: occasionally accessed, in Postgres but not Redis
 * COLD: archived, in SeaweedFS or DuckDB only
 *
 * Output: docs/reports/packet-temperature-report.json
 * No mutations. Read-only analysis.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// Environment
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? 'legal_password'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;

// ══════════════════════════════════════════════════════════════════════════════
// CLASSIFY PACKETS BY TEMPERATURE
// ══════════════════════════════════════════════════════════════════════════════

async function classifyPacketTemperature(pool) {
  console.log('\n🌡️  Classifying packets by temperature...');

  // HOT packets: in ACE context, recent access, high feature_id count
  const hotResult = await pool.query(`
    SELECT
      'HOT' as temperature,
      COUNT(*) as packet_count,
      COUNT(DISTINCT feature_id) as unique_features,
      AVG(CAST(LENGTH(COALESCE(som_cluster::text, '')) AS NUMERIC)) as avg_payload_size,
      MAX(indexed_at) as last_updated
    FROM atlas_feature_map
    WHERE feature_id IN (
      SELECT feature_id FROM atlas_feature_map
      WHERE indexed_at > NOW() - INTERVAL '7 days'
      GROUP BY feature_id
      HAVING COUNT(*) > 5
    )
  `);

  // WARM packets: in Postgres, less frequently accessed
  const warmResult = await pool.query(`
    SELECT
      'WARM' as temperature,
      COUNT(*) as packet_count,
      COUNT(DISTINCT feature_id) as unique_features,
      AVG(CAST(LENGTH(COALESCE(som_cluster::text, '')) AS NUMERIC)) as avg_payload_size,
      MAX(indexed_at) as last_updated
    FROM atlas_feature_map
    WHERE indexed_at BETWEEN NOW() - INTERVAL '30 days' AND NOW() - INTERVAL '7 days'
  `);

  // COLD packets: infrequently accessed or archival
  const coldResult = await pool.query(`
    SELECT
      'COLD' as temperature,
      COUNT(*) as packet_count,
      COUNT(DISTINCT feature_id) as unique_features,
      AVG(CAST(LENGTH(COALESCE(som_cluster::text, '')) AS NUMERIC)) as avg_payload_size,
      MAX(indexed_at) as last_updated
    FROM atlas_feature_map
    WHERE indexed_at < NOW() - INTERVAL '30 days'
  `);

  const hot = hotResult.rows[0] || {};
  const warm = warmResult.rows[0] || {};
  const cold = coldResult.rows[0] || {};

  console.log(`  ✓ Hot:  ${hot.packet_count || 0} packets`);
  console.log(`  ✓ Warm: ${warm.packet_count || 0} packets`);
  console.log(`  ✓ Cold: ${cold.packet_count || 0} packets`);

  return [
    {
      temperature: 'HOT',
      packet_count: hot.packet_count || 0,
      unique_features: hot.unique_features || 0,
      avg_payload_size: parseFloat(hot.avg_payload_size || 0).toFixed(2),
      last_updated: hot.last_updated || null,
      criteria: 'accessed in last 7 days, feature_count > 5',
      storage_location: 'Redis hot cache + Postgres',
    },
    {
      temperature: 'WARM',
      packet_count: warm.packet_count || 0,
      unique_features: warm.unique_features || 0,
      avg_payload_size: parseFloat(warm.avg_payload_size || 0).toFixed(2),
      last_updated: warm.last_updated || null,
      criteria: 'accessed 7-30 days ago',
      storage_location: 'Postgres only',
    },
    {
      temperature: 'COLD',
      packet_count: cold.packet_count || 0,
      unique_features: cold.unique_features || 0,
      avg_payload_size: parseFloat(cold.avg_payload_size || 0).toFixed(2),
      last_updated: cold.last_updated || null,
      criteria: 'last accessed > 30 days ago',
      storage_location: 'DuckDB / SeaweedFS (planned)',
    },
  ];
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   Phase 3C: Packet Temperature Classifier');
    console.log('═══════════════════════════════════════════════════════════');

    const temperatures = await classifyPacketTemperature(pool);

    const report = {
      timestamp: new Date().toISOString(),
      classification_rules: {
        HOT: 'Accessed in last 7 days, feature_count > 5, cached in Redis',
        WARM: 'Accessed 7-30 days ago, in Postgres only',
        COLD: 'Last accessed > 30 days ago, candidate for SeaweedFS archival',
      },
      packet_temperatures: temperatures,
      total_packets: temperatures.reduce((sum, t) => sum + (t.packet_count || 0), 0),
      distribution: {
        hot_pct: (temperatures[0].packet_count / (temperatures.reduce((sum, t) => sum + (t.packet_count || 0), 0) || 1) * 100).toFixed(1),
        warm_pct: (temperatures[1].packet_count / (temperatures.reduce((sum, t) => sum + (t.packet_count || 0), 0) || 1) * 100).toFixed(1),
        cold_pct: (temperatures[2].packet_count / (temperatures.reduce((sum, t) => sum + (t.packet_count || 0), 0) || 1) * 100).toFixed(1),
      },
    };

    // Write report
    const reportDir = path.join(ROOT, 'docs', 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const jsonPath = path.join(reportDir, 'packet-temperature-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    console.log(`\n✅ Temperature report written to ${jsonPath}`);
    console.log(`\n🌡️  Packet Distribution:`);
    console.log(`  HOT:  ${report.packet_temperatures[0].packet_count.toString().padStart(6)} packets (${report.distribution.hot_pct}%)`);
    console.log(`  WARM: ${report.packet_temperatures[1].packet_count.toString().padStart(6)} packets (${report.distribution.warm_pct}%)`);
    console.log(`  COLD: ${report.packet_temperatures[2].packet_count.toString().padStart(6)} packets (${report.distribution.cold_pct}%)`);
    console.log(`\n  Total: ${report.total_packets} packets`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
