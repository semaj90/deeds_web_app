#!/usr/bin/env node

/** Read-only plan for analysis_pass_current view drift; never executes DDL. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/analysis-pass-current-reconciliation-plan-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const report = {
  schema: 'parent-atlas.analysis-pass-current-reconciliation-plan.v1',
  gate: 'ANALYSIS-PASS-CURRENT-RECONCILIATION',
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  ddlExecuted: false,
  decisionRequired: 'Admit both legacy success and current succeeded status generations, or explicitly authorize a status migration before view replacement.',
  proposedViewPolicy: {
    statusPredicate: "status IN ('success', 'succeeded')",
    orderBy: 'packet_key, source_revision, pass_type, pass_revision, input_hash, created_at DESC, id DESC',
    reason: 'Preserve readable legacy history and current typed-writer rows while making duplicate selection deterministic.',
  },
};

const pool = new pg.Pool({ connectionString });
try {
  const [statusRows, viewDef] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count FROM public.analysis_pass_results GROUP BY status ORDER BY status`),
    pool.query(`SELECT pg_get_viewdef('analysis_pass_current'::regclass, true) AS definition`),
  ]);
  report.live = {
    statusCounts: statusRows.rows,
    deployedViewDefinition: viewDef.rows[0]?.definition ?? null,
    legacySuccessRows: statusRows.rows.find((row) => row.status === 'success')?.count ?? 0,
    currentSucceededRows: statusRows.rows.find((row) => row.status === 'succeeded')?.count ?? 0,
  };
  report.status = report.live.deployedViewDefinition
    ? 'RECONCILIATION_PLAN_READY_OPERATOR_DECISION_REQUIRED'
    : 'RECONCILIATION_PLAN_BLOCKED_VIEW_MISSING';
} catch (error) {
  report.status = 'RECONCILIATION_PLAN_BLOCKED_QUERY';
  report.error = String(error?.message ?? error);
} finally {
  await pool.end();
}

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, writesPerformed: false, ddlExecuted: false }, null, 2));
if (report.status === 'RECONCILIATION_PLAN_BLOCKED_QUERY' || report.status === 'RECONCILIATION_PLAN_BLOCKED_VIEW_MISSING') process.exitCode = 1;
