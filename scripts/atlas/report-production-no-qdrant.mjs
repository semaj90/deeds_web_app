#!/usr/bin/env node
/**
 * Reports active-production Parent Atlas rows that do not have a Qdrant point.
 *
 * This is read-only and uses the same normalized active-production filter as
 * the Qdrant-without-SOM report.
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
    COUNT(*)::int AS active_total,
    COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL)::int AS active_has_qdrant,
    COUNT(*) FILTER (WHERE qdrant_point_id IS NULL)::int AS active_no_qdrant
  FROM active
`);

const { rows: gapRows } = await pool.query(`
  ${NORMALIZED_COVERAGE_CTE}
  SELECT source_ref, feature_id, som_cluster, centroid_id
  FROM active
  WHERE qdrant_point_id IS NULL
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
  active_production: {
    total: coverageRows[0].active_total,
    has_qdrant: coverageRows[0].active_has_qdrant,
    no_qdrant: coverageRows[0].active_no_qdrant,
  },
  sample_buckets: [...buckets.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => b.count - a.count),
  sample_rows: gapRows,
  next_decision: Number(coverageRows[0].active_no_qdrant) === 0
    ? 'no_active_qdrant_gap'
    : 'run_focused_ingest_for_missing_qdrant_source_refs',
};

const reportJson = path.join(ROOT, 'docs', 'reports', 'production-no-qdrant-report.json');
const reportMd = path.join(ROOT, 'docs', 'reports', 'production-no-qdrant-report.md');
fs.mkdirSync(path.dirname(reportJson), { recursive: true });
fs.writeFileSync(reportJson, JSON.stringify(report, null, 2), 'utf8');

const md = [
  '# Production No-Qdrant Report',
  '',
  `Generated: ${report.timestamp}`,
  '',
  '## Active Production Coverage',
  '',
  `- active total: ${report.active_production.total}`,
  `- active has Qdrant: ${report.active_production.has_qdrant}`,
  `- active no Qdrant: ${report.active_production.no_qdrant}`,
  '',
  '## Sample Buckets',
  '',
  ...report.sample_buckets.map((row) => `- ${row.bucket}: ${row.count}`),
  '',
  '## Sample Rows',
  '',
  ...report.sample_rows.map((row) => `- ${row.source_ref} | feature=${row.feature_id ?? 'null'} | som=${row.som_cluster ?? 'null'} | centroid=${row.centroid_id ?? 'null'}`),
  '',
  '## Next Decision',
  '',
  report.next_decision,
  '',
].join('\n');

fs.writeFileSync(reportMd, md, 'utf8');

console.log(JSON.stringify({
  reportJson,
  reportMd,
  activeProduction: report.active_production,
  sampleBuckets: report.sample_buckets,
  nextDecision: report.next_decision,
}, null, 2));
