/** Read-only audit of metadata needed before analysis-pass promotion. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/analysis-pass-metadata-gaps-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

const report = {
  schema: 'parent-atlas.analysis-pass-metadata-gaps.v1',
  gate: 'ANALYSIS-PASS-METADATA-ENRICHMENT',
  status: 'BLOCKED_UNPROVEN',
  readOnly: true,
  writesPerformed: false,
  requiredForPromotion: ['source_ref', 'source_revision', 'pass_revision', 'input_hash'],
};
const pool = new pg.Pool({ connectionString });
try {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE source_ref IS NULL)::int AS missing_source_ref,
           COUNT(*) FILTER (WHERE source_revision IS NULL)::int AS missing_source_revision,
           COUNT(*) FILTER (WHERE pass_revision IS NULL)::int AS missing_pass_revision,
           COUNT(*) FILTER (WHERE input_hash IS NULL)::int AS missing_input_hash,
           COUNT(*) FILTER (WHERE provenance->>'workspaceRevision' IS NULL)::int AS missing_workspace_revision,
           COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded
      FROM public.analysis_pass_results
  `);
  report.totals = result.rows[0];
  const groups = await pool.query(`
    SELECT COALESCE(pass_type, '<null>') AS pass_type,
           COUNT(*)::int AS rows,
           COUNT(*) FILTER (WHERE source_revision IS NULL)::int AS missing_source_revision,
           COUNT(*) FILTER (WHERE pass_revision IS NULL)::int AS missing_pass_revision,
           COUNT(*) FILTER (WHERE provenance->>'workspaceRevision' IS NULL)::int AS missing_workspace_revision
      FROM public.analysis_pass_results
     GROUP BY pass_type
     ORDER BY rows DESC, pass_type
     LIMIT 100
  `);
  report.byPassType = groups.rows;
  report.status = Number(report.totals.total) > 0 && Number(report.totals.missing_source_revision) === 0
    && Number(report.totals.missing_pass_revision) === 0 ? 'READ_ONLY_PROVEN' : 'BLOCKED_METADATA_GAPS';
} catch (error) {
  report.status = 'BLOCKED_QUERY';
  report.error = String(error?.message ?? error);
} finally {
  await pool.end();
}
report.reportChecksum = digest({ ...report, reportChecksum: undefined });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, writesPerformed: false }));
if (report.status === 'BLOCKED_QUERY') process.exitCode = 1;
