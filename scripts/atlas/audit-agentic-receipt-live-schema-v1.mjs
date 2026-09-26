/**
 * Read-only audit for the existing agent-work receipt persistence owner.
 *
 * This does not migrate, insert, update, or delete anything. It only verifies
 * that the live PostgreSQL shim exposes the columns and uniqueness contract
 * required by agent-work-receipt-store-v1.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { buildDatabaseConnectionFingerprint, connectionSource } from './lib/database-connection-fingerprint.mjs';

const reportPath = path.resolve(
  process.env.ATLAS_AGENTIC_RECEIPT_SCHEMA_REPORT_PATH ??
    path.join(REPO_ROOT, 'docs', 'reports', 'agentic-receipt-live-schema-v1.json'),
);

const requiredColumns = [
  'id',
  'outcome_type',
  'metadata',
  'receipt_id',
  'run_id',
  'receipt_schema',
  'receipt_status',
  'writes_performed',
  'completion_checksum',
];

const env = loadRepoEnv(process.env);
const report = {
  schema: 'atlas.agentic-receipt-live-schema-audit.v1',
  generatedAt: new Date().toISOString(),
  status: 'UNREAD',
  table: 'public.outcome_ledger',
  requiredColumns,
  observedColumns: [],
  missingColumns: [],
  receiptIdUniqueIndex: null,
  rowCount: null,
  existingReadback: {
    agentWorkReceiptRows: null,
    rowsWithReceiptId: null,
    rowsWithCompletionChecksum: null,
    latest: null,
  },
  databaseConnection: {
    source: connectionSource(env),
    fingerprint: null,
    status: 'UNREAD',
  },
  canonicalAuthority: false,
  writesPerformed: false,
};

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
});

try {
  report.databaseConnection.fingerprint = buildDatabaseConnectionFingerprint(env);
  const exists = await pool.query(`
    SELECT to_regclass('public.outcome_ledger') IS NOT NULL AS present
  `);
  if (!exists.rows[0]?.present) {
    report.status = 'LIVE_RECEIPT_TABLE_MISSING';
  } else {
    const columns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'outcome_ledger'
      ORDER BY ordinal_position
    `);
    report.observedColumns = columns.rows.map((row) => row.column_name);
    report.missingColumns = requiredColumns.filter((column) => !report.observedColumns.includes(column));

    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'outcome_ledger'
    `);
    report.receiptIdUniqueIndex = indexes.rows.some((row) =>
      /unique/i.test(row.indexdef) && /receipt_id/i.test(row.indexdef),
    );

    const count = await pool.query('SELECT count(*)::integer AS count FROM public.outcome_ledger');
    report.rowCount = count.rows[0]?.count ?? null;
    const receiptRows = await pool.query(`
      SELECT
        count(*) FILTER (WHERE outcome_type = 'agent_work_receipt')::integer AS agent_work_receipt_rows,
        count(*) FILTER (WHERE receipt_id IS NOT NULL)::integer AS rows_with_receipt_id,
        count(*) FILTER (WHERE completion_checksum IS NOT NULL)::integer AS rows_with_completion_checksum
      FROM public.outcome_ledger
    `);
    const receiptRow = receiptRows.rows[0] ?? {};
    report.existingReadback.agentWorkReceiptRows = receiptRow.agent_work_receipt_rows ?? 0;
    report.existingReadback.rowsWithReceiptId = receiptRow.rows_with_receipt_id ?? 0;
    report.existingReadback.rowsWithCompletionChecksum = receiptRow.rows_with_completion_checksum ?? 0;

    const latest = await pool.query(`
      SELECT id::text, receipt_id, run_id, receipt_schema, receipt_status,
             writes_performed, completion_checksum
      FROM public.outcome_ledger
      WHERE outcome_type = 'agent_work_receipt'
      ORDER BY COALESCE(created_at, recorded_at) DESC
      LIMIT 1
    `);
    report.existingReadback.latest = latest.rows[0] ?? null;

    report.status = report.missingColumns.length === 0 && report.receiptIdUniqueIndex
      ? (report.existingReadback.agentWorkReceiptRows > 0
        ? 'LIVE_RECEIPT_SCHEMA_AND_EXISTING_ROWS_OBSERVED_NEW_WRITE_DEFERRED'
        : 'LIVE_RECEIPT_SCHEMA_READY_READBACK_DEFERRED')
      : 'LIVE_RECEIPT_SCHEMA_INCOMPLETE';
  }
} catch (error) {
  report.status = 'LIVE_RECEIPT_SCHEMA_UNAVAILABLE';
  report.databaseConnection.status = 'ERROR';
  report.error = { name: error?.name ?? 'Error', message: String(error?.message ?? error) };
} finally {
  await pool.end().catch(() => {});
}

report.databaseConnection.status = report.databaseConnection.status === 'ERROR' ? 'ERROR' : 'READ_ONLY_OK';
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const temporary = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temporary, reportPath);
console.log(JSON.stringify(report, null, 2));
process.exitCode = [
  'LIVE_RECEIPT_SCHEMA_READY_READBACK_DEFERRED',
  'LIVE_RECEIPT_SCHEMA_AND_EXISTING_ROWS_OBSERVED_NEW_WRITE_DEFERRED',
].includes(report.status) ? 0 : 1;
