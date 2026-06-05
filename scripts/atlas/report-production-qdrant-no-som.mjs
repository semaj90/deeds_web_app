#!/usr/bin/env node
/**
 * Reports production atlas rows that have Qdrant points but no SOM cluster.
 *
 * This is read-only. It exists to decide whether the remaining rows are real
 * app files that need clustering or generated/cache surfaces that should be
 * quarantined out of production coverage reports.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { bucketFor, NORMALIZED_COVERAGE_CTE } from './report-production-qdrant-no-som.lib.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limitIndex = process.argv.indexOf('--limit');
const LIMIT = Number(
  limitArg?.split('=')[1]
  ?? (limitIndex >= 0 ? process.argv[limitIndex + 1] : null)
  ?? process.env.npm_config_limit
  ?? '50'
);

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

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const { rows: coverageRows } = await pool.query(`
  ${NORMALIZED_COVERAGE_CTE}
  SELECT
    (SELECT COUNT(*)::int FROM normalized_afm) AS raw_total,
    (SELECT COUNT(*)::int FROM normalized_afm WHERE som_cluster IS NOT NULL) AS raw_has_som,
    (SELECT COUNT(*)::int FROM normalized_afm WHERE qdrant_point_id IS NOT NULL) AS raw_has_qdrant,
    (SELECT COUNT(*)::int FROM normalized_afm WHERE som_cluster IS NULL AND qdrant_point_id IS NOT NULL) AS raw_qdrant_no_som,
    COUNT(*)::int AS active_total,
    COUNT(*) FILTER (WHERE som_cluster IS NOT NULL)::int AS active_has_som,
    COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL)::int AS active_has_qdrant,
    COUNT(*) FILTER (WHERE som_cluster IS NULL AND qdrant_point_id IS NOT NULL)::int AS active_qdrant_no_som,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE som_cluster IS NOT NULL) / NULLIF(COUNT(*), 0),
      1
    )::numeric(5,1) AS active_som_pct
  FROM active
`);

const { rows: gapRows } = await pool.query(`
  ${NORMALIZED_COVERAGE_CTE}
  SELECT source_ref, feature_id, qdrant_point_id
  FROM active
  WHERE qdrant_point_id IS NOT NULL
    AND som_cluster IS NULL
  ORDER BY source_ref
  LIMIT $1
`, [LIMIT]);

await pool.end();

const buckets = new Map();
for (const row of gapRows) {
  const bucket = bucketFor(row.source_ref);
  buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
}

const report = {
  timestamp: new Date().toISOString(),
  limit: LIMIT,
  raw_inventory: {
    total: coverageRows[0].raw_total,
    has_som: coverageRows[0].raw_has_som,
    has_qdrant: coverageRows[0].raw_has_qdrant,
    qdrant_no_som: coverageRows[0].raw_qdrant_no_som,
  },
  active_production: {
    total: coverageRows[0].active_total,
    has_som: coverageRows[0].active_has_som,
    has_qdrant: coverageRows[0].active_has_qdrant,
    qdrant_no_som: coverageRows[0].active_qdrant_no_som,
    som_pct: coverageRows[0].active_som_pct,
  },
  // Back-compat alias for older consumers.
  coverage: {
    raw_total: coverageRows[0].raw_total,
    raw_has_som: coverageRows[0].raw_has_som,
    raw_has_qdrant: coverageRows[0].raw_has_qdrant,
    raw_qdrant_no_som: coverageRows[0].raw_qdrant_no_som,
    production_total: coverageRows[0].active_total,
    production_has_som: coverageRows[0].active_has_som,
    production_has_qdrant: coverageRows[0].active_has_qdrant,
    production_qdrant_no_som: coverageRows[0].active_qdrant_no_som,
    production_som_pct: coverageRows[0].active_som_pct,
  },
  sample_buckets: [...buckets.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => b.count - a.count),
  sample_rows: gapRows,
  next_decision: Number(coverageRows[0].active_qdrant_no_som) === 0
    ? 'no_active_qdrant_without_som_gap'
    : gapRows.some((row) => String(row.source_ref).includes('/reports/') || String(row.source_ref).includes('/_cache/'))
      ? 'quarantine_generated_or_cache_rows'
      : 'run_graphify_semantic_cluster_force',
};

const reportJson = path.join(ROOT, 'docs', 'reports', 'production-qdrant-no-som-report.json');
const reportMd = path.join(ROOT, 'docs', 'reports', 'production-qdrant-no-som-report.md');
fs.mkdirSync(path.dirname(reportJson), { recursive: true });
fs.writeFileSync(reportJson, JSON.stringify(report, null, 2), 'utf8');

const md = [
  '# Production Qdrant Without SOM Report',
  '',
  `Generated: ${report.timestamp}`,
  '',
  '## Coverage',
  '',
  '### Raw Inventory Coverage',
  '',
  `- raw total: ${report.raw_inventory.total}`,
  `- raw has SOM: ${report.raw_inventory.has_som}`,
  `- raw has Qdrant: ${report.raw_inventory.has_qdrant}`,
  `- raw Qdrant without SOM: ${report.raw_inventory.qdrant_no_som}`,
  '',
  '### Active Production Coverage',
  '',
  `- active total: ${report.active_production.total}`,
  `- active has SOM: ${report.active_production.has_som}`,
  `- active has Qdrant: ${report.active_production.has_qdrant}`,
  `- active Qdrant without SOM: ${report.active_production.qdrant_no_som}`,
  `- active SOM coverage: ${report.active_production.som_pct}%`,
  '',
  '## Sample Buckets',
  '',
  ...report.sample_buckets.map((row) => `- ${row.bucket}: ${row.count}`),
  '',
  '## Sample Rows',
  '',
  ...report.sample_rows.map((row) => `- ${row.source_ref} | feature=${row.feature_id ?? 'null'} | qdrant=${row.qdrant_point_id}`),
  '',
  `Next decision: ${report.next_decision}`,
  '',
].join('\n');
fs.writeFileSync(reportMd, md, 'utf8');

console.log(JSON.stringify({
  reportJson,
  reportMd,
  rawInventory: report.raw_inventory,
  activeProduction: report.active_production,
  sampleBuckets: report.sample_buckets.slice(0, 10),
  nextDecision: report.next_decision,
}, null, 2));
