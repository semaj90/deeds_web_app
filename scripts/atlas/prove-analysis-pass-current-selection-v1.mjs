/** Read-only proof of the existing analysis_pass_current selector/view. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/analysis-pass-current-selection-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const hash = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

const report = {
  schema: 'parent-atlas.analysis-pass-current-selection.v1',
  gate: 'ANALYSIS-PASS-CURRENT-SELECTION',
  status: 'BLOCKED_UNPROVEN',
  selectionOwner: 'analysis_pass_current',
  historyOwner: 'analysis_pass_results',
  selectionPolicy: ['exact packet/source identity', 'successful/current view', 'pass revision', 'recency tie-breaker'],
  writesPerformed: false,
  canonicalAuthority: false,
};
const pool = new pg.Pool({ connectionString });
try {
  const relation = await pool.query(`
    SELECT c.relkind
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'analysis_pass_current'
  `);
  report.viewPresent = relation.rowCount === 1 && relation.rows[0].relkind === 'v';
  if (!report.viewPresent) report.reason = 'CURRENT_SELECTOR_VIEW_MISSING';
  else {
    const rows = await pool.query(`
      SELECT id, packet_key, source_revision, pass_type, pass_revision, input_hash, created_at
        FROM public.analysis_pass_current
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT 5
    `);
    report.rowsRead = rows.rowCount;
    report.selected = rows.rows[0] ?? null;
    report.readbackChecksum = hash(rows.rows);
    report.selectionChecks = {
      deterministicOrder: true,
      currentViewOnly: true,
      selectedRowAvailable: Boolean(report.selected),
      sourceRevisionPresent: Boolean(report.selected?.source_revision),
      passRevisionPresent: Boolean(report.selected?.pass_revision),
      packetIdentityPresent: Boolean(report.selected?.packet_key),
    };
    report.status = report.selected && report.selectionChecks.sourceRevisionPresent
      && report.selectionChecks.passRevisionPresent && report.selectionChecks.packetIdentityPresent
      ? 'READ_ONLY_PROVEN'
      : 'BLOCKED_INCOMPLETE_SELECTION_METADATA';
  }
} catch (error) {
  report.status = 'BLOCKED_QUERY';
  report.reason = String(error?.message ?? error);
} finally {
  await pool.end();
}
report.reportChecksum = hash({ ...report, reportChecksum: undefined });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, rowsRead: report.rowsRead ?? 0, writesPerformed: false }));
if (report.status === 'BLOCKED_QUERY') process.exitCode = 1;
