import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { deriveFeatureOntologyCrosswalkRows } from './lib/feature-ontology-crosswalk-v1.mjs';

const reportPath = path.resolve(REPO_ROOT, 'docs/reports/feature-ontology-crosswalk-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const client = await pool.connect();

try {
  await client.query('BEGIN READ ONLY');
  const table = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'feature_registry'
    ) AS present
  `);
  const present = Boolean(table.rows[0]?.present);
  const rows = present
    ? (await client.query(`
        SELECT feature_key, title, description, status, source_refs, code_refs,
               test_refs, cluster_id, trust_tier, last_verified_at
        FROM public.feature_registry
        ORDER BY feature_key
      `)).rows
    : [];
  const crosswalk = deriveFeatureOntologyCrosswalkRows(rows);
  await client.query('ROLLBACK');

  const report = {
    schema: 'atlas.feature-ontology-crosswalk-report.v1',
    status: present ? 'READ_ONLY_CROSSWALK_COMPLETE' : 'REGISTRY_TABLE_UNAVAILABLE',
    owner: 'atlas-feature-intelligence',
    source: 'public.feature_registry',
    tablePresent: present,
    records: crosswalk.records,
    rejected: crosswalk.rejected,
    counts: {
      rowsRead: rows.length,
      records: crosswalk.records.length,
      rejected: crosswalk.rejected.length,
      classified: crosswalk.records.filter((record) => record.classification.status === 'CLASSIFIED').length,
      unverified: crosswalk.records.filter((record) => record.classification.status !== 'CLASSIFIED').length,
    },
    effects: {
      transactionMode: 'READ ONLY',
      canonicalWrites: false,
      datastoreWrites: false,
      cacheWrites: false,
      modelCalls: false,
    },
    authority: {
      featureIdentity: 'existing feature_registry.feature_key only',
      sourceIdentity: 'not created by this report',
      liveImplementationMembership: 'UNPROVEN',
      dependencyEdges: 'UNPROVEN',
    },
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, reportPath: path.relative(REPO_ROOT, reportPath).replaceAll('\\', '/'), counts: report.counts, effects: report.effects }, null, 2));
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
