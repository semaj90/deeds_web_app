#!/usr/bin/env node
/**
 * SYMBOL-VERSION-QUARANTINE-01 — bounded repair for the 77 atlas_symbol_versions
 * rows still carrying the 'workspace:0' placeholder on BOTH source_revision and
 * workspace_revision (9 distinct files). Same technique as
 * SYMBOL-REGISTRY-REPAIR-APPLY-01: hash each file's current on-disk bytes
 * directly (never copy an existing atlas_source_refs fragment hash, never
 * infer/reuse a repo commit oid). Small set (9 files) — no worker pool needed.
 *
 * Default is read-only preview. --apply requires the exact token as argv.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT, FRONTEND_ROOT } from './connection-config.mjs';

const APPLY_TOKEN = 'apply symbol version workspace placeholder repair';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const suppliedToken = args.filter((a) => !a.startsWith('--')).join(' ');

async function resolveExistingPath(sourceRef) {
  for (const base of [REPO_ROOT, FRONTEND_ROOT]) {
    const candidate = path.join(base, sourceRef);
    try { await fs.access(candidate); return candidate; } catch { /* try next */ }
  }
  return null;
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 2 });
const client = await pool.connect();

const rows = (await client.query(
  `SELECT symbol_version_id, source_ref, source_revision, workspace_revision
   FROM atlas_symbol_versions WHERE source_revision = 'workspace:0'`,
)).rows;

const distinctRefs = [...new Set(rows.map((r) => r.source_ref))];
const resolvedByRef = new Map();
for (const ref of distinctRefs) resolvedByRef.set(ref, await resolveExistingPath(ref));

const missing = distinctRefs.filter((ref) => !resolvedByRef.get(ref));
if (missing.length > 0) {
  console.error(`[REPAIR] ${missing.length} source refs could not be resolved:`, missing);
  client.release(); await pool.end();
  process.exit(1);
}

const hashByRef = new Map();
for (const ref of distinctRefs) {
  const buf = await fs.readFile(resolvedByRef.get(ref));
  hashByRef.set(ref, `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`);
}

const plan = rows.map((r) => ({
  symbolVersionId: r.symbol_version_id,
  sourceRef: r.source_ref,
  oldSourceRevision: r.source_revision,
  oldWorkspaceRevision: r.workspace_revision,
  newRevision: hashByRef.get(r.source_ref),
}));

console.log(`[REPAIR] ${plan.length} rows across ${distinctRefs.length} files resolved. mode=${apply ? 'APPLY' : 'DRY_RUN'}`);
console.table(plan.map((p) => ({ sourceRef: p.sourceRef, newRevision: p.newRevision.slice(0, 24) + '...' })));

if (!apply) {
  console.log('[REPAIR] dry-run complete, 0 writes performed.');
  client.release(); await pool.end();
  process.exit(0);
}

if (suppliedToken !== APPLY_TOKEN) {
  console.error(`Refusing --apply: exact apply token required, got ${JSON.stringify(suppliedToken)}`);
  client.release(); await pool.end();
  process.exit(2);
}

const before = (await client.query('SELECT count(*)::int AS n FROM atlas_symbol_versions')).rows[0].n;
let updatedRows = 0;
try {
  await client.query('BEGIN');
  const ids = plan.map((p) => p.symbolVersionId);
  const locked = new Map((await client.query(
    'SELECT symbol_version_id, source_revision, workspace_revision FROM atlas_symbol_versions WHERE symbol_version_id = ANY($1::text[]) FOR UPDATE',
    [ids],
  )).rows.map((r) => [r.symbol_version_id, r]));

  for (const row of plan) {
    const live = locked.get(row.symbolVersionId);
    if (!live || live.source_revision !== row.oldSourceRevision || live.workspace_revision !== row.oldWorkspaceRevision) {
      throw new Error(`REPAIR_PREVIEW_STALE:${row.symbolVersionId}`);
    }
  }

  for (const row of plan) {
    const result = await client.query(
      `UPDATE atlas_symbol_versions SET source_revision = $1, workspace_revision = $1
       WHERE symbol_version_id = $2 AND source_revision = $3 AND workspace_revision = $4`,
      [row.newRevision, row.symbolVersionId, row.oldSourceRevision, row.oldWorkspaceRevision],
    );
    if (result.rowCount !== 1) throw new Error(`UPDATE_AFFECTED_UNEXPECTED_ROWS:${row.symbolVersionId}:${result.rowCount}`);
    updatedRows++;
  }

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(`[REPAIR] ROLLED_BACK: ${error.message}`);
  client.release(); await pool.end();
  process.exit(1);
}

const after = (await client.query('SELECT count(*)::int AS n FROM atlas_symbol_versions')).rows[0].n;
client.release();
await pool.end();

const report = {
  schema: 'atlas.symbol-version-workspace-placeholder-repair.v1',
  generatedAt: new Date().toISOString(),
  status: before === after && updatedRows === plan.length ? 'REPAIR_APPLIED' : 'REPAIR_PARTIAL',
  updatedRows,
  targetRowCount: plan.length,
  fence: { before, after },
};
await fs.writeFile(
  path.resolve(REPO_ROOT, 'docs/reports/symbol-version-workspace-placeholder-repair-apply-v1.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'REPAIR_APPLIED' ? 0 : 1);
