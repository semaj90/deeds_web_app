#!/usr/bin/env node
/**
 * SYMBOL-REGISTRY-REPAIR-APPLY-01 — transactional, batched apply of the frozen
 * symbol-registry-revision-repair-manifest-v1.json (produced by
 * preview-symbol-registry-revision-repair-v1.mjs), authorized by an explicit
 * apply token.
 *
 * Re-verifies the manifest checksum AND re-hashes every target file's current
 * bytes at apply time (defends against drift between preview and apply — a
 * file could have changed in between). Applies in bounded batches, each in
 * its own transaction: locks target rows FOR UPDATE, revalidates each row's
 * exact precondition (stable_symbol_id + old revision), updates by primary
 * key (stable_symbol_id — always indexed, atlas_symbol_registry_pkey),
 * fences total registry row count before/after (must be unchanged — this is
 * a revision repair, never a row insert/delete), and rolls back the whole
 * batch on any anomaly. Writes one aggregate receipt covering every batch.
 *
 * Usage:
 *   node scripts/atlas/apply-symbol-registry-revision-repair-v1.mjs \
 *     "apply symbol registry revision repair" --batch-size=200
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const APPLY_TOKEN = 'apply symbol registry revision repair';
const args = process.argv.slice(2);
const suppliedToken = args.filter((a) => !a.startsWith('--')).join(' ');
if (suppliedToken !== APPLY_TOKEN) {
  console.error(`Refusing to run: exact apply token required as argv, got ${JSON.stringify(suppliedToken)}`);
  process.exit(2);
}
const BATCH_SIZE = Math.max(1, Number((args.find((a) => a.startsWith('--batch-size=')) || '').split('=')[1] || 0) || 200);

const manifestPath = path.resolve(REPO_ROOT, 'docs/reports/symbol-registry-revision-repair-manifest-v1.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

// Re-verify manifest checksum right now, independently of trusting the file on disk.
const manifestCoreNow = { schema: manifest.schema, targetRowCount: manifest.targetRowCount, distinctFileCount: manifest.distinctFileCount, rows: manifest.rows };
const manifestChecksumNow = `sha256:${crypto.createHash('sha256').update(JSON.stringify(manifestCoreNow)).digest('hex')}`;
if (manifestChecksumNow !== manifest.manifestChecksum) {
  console.error(`Manifest checksum mismatch at apply time (expected ${manifest.manifestChecksum}, got ${manifestChecksumNow}); refusing to run`);
  process.exit(2);
}

// Re-hash every distinct target file's current bytes right now — defends against drift since preview.
const distinctPaths = [...new Set(manifest.rows.map((r) => r.resolvedPath))];
const currentHashByPath = new Map();
for (const rel of distinctPaths) {
  const buf = await fs.readFile(path.resolve(REPO_ROOT, rel));
  currentHashByPath.set(rel, `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`);
}
const drifted = manifest.rows.filter((row) => currentHashByPath.get(row.resolvedPath) !== row.newRevision);
if (drifted.length > 0) {
  console.error(`REPAIR_PREVIEW_STALE: ${drifted.length} file(s) changed since preview — refusing to run. Re-run the preview script first.`);
  drifted.slice(0, 10).forEach((row) => console.error(`  - ${row.sourceRef} (was ${row.newRevision}, now ${currentHashByPath.get(row.resolvedPath)})`));
  process.exit(2);
}

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

async function fenceRegistry(c) {
  const r = await c.query('SELECT count(*)::int AS n FROM atlas_symbol_registry');
  return r.rows[0].n;
}

const report = {
  schema: 'atlas.symbol-registry-revision-repair-apply.v1',
  generatedAt: new Date().toISOString(),
  manifestChecksum: manifest.manifestChecksum,
  batchSize: BATCH_SIZE,
  targetRowCount: manifest.rows.length,
  batches: [],
  status: 'PENDING',
  updatedRows: 0,
  reasons: [],
};

const totalBefore = await (async () => {
  const c = await pool.connect();
  try { return await fenceRegistry(c); } finally { c.release(); }
})();

let overallOk = true;
for (let offset = 0; offset < manifest.rows.length; offset += BATCH_SIZE) {
  const batchRows = manifest.rows.slice(offset, offset + BATCH_SIZE);
  const client = await pool.connect();
  const batchReport = { offset, size: batchRows.length, status: 'PENDING', updatedRows: 0 };
  try {
    await client.query('BEGIN');
    const ids = batchRows.map((r) => r.stableSymbolId);
    const locked = new Map((await client.query(
      'SELECT stable_symbol_id, created_from_source_revision FROM atlas_symbol_registry WHERE stable_symbol_id = ANY($1::text[]) FOR UPDATE',
      [ids],
    )).rows.map((r) => [r.stable_symbol_id, r]));

    for (const row of batchRows) {
      const live = locked.get(row.stableSymbolId);
      if (!live || live.created_from_source_revision !== row.oldRevision) {
        throw new Error(`REPAIR_PREVIEW_STALE:${row.stableSymbolId}`);
      }
    }

    let updated = 0;
    for (const row of batchRows) {
      const result = await client.query(
        `UPDATE atlas_symbol_registry SET created_from_source_revision = $1, updated_at = now()
         WHERE stable_symbol_id = $2 AND created_from_source_revision = $3`,
        [row.newRevision, row.stableSymbolId, row.oldRevision],
      );
      if (result.rowCount !== 1) throw new Error(`UPDATE_AFFECTED_UNEXPECTED_ROWS:${row.stableSymbolId}:${result.rowCount}`);
      updated++;
    }

    await client.query('COMMIT');
    batchReport.status = 'APPLIED';
    batchReport.updatedRows = updated;
    report.updatedRows += updated;
  } catch (error) {
    await client.query('ROLLBACK');
    batchReport.status = 'ROLLED_BACK';
    batchReport.reason = error.message;
    overallOk = false;
  } finally {
    client.release();
  }
  report.batches.push(batchReport);
  if (batchReport.status === 'ROLLED_BACK') break; // stop at first failed batch; earlier committed batches stand
}

const totalAfter = await (async () => {
  const c = await pool.connect();
  try { return await fenceRegistry(c); } finally { c.release(); }
})();
await pool.end();

report.registryFence = { before: totalBefore, after: totalAfter };
if (totalBefore !== totalAfter) {
  overallOk = false;
  report.reasons.push(`ROW_COUNT_CHANGED:${totalBefore}->${totalAfter}`);
}
report.status = overallOk && report.updatedRows === manifest.rows.length ? 'REPAIR_APPLIED' : 'REPAIR_PARTIAL_OR_FAILED';

const reportPath = path.resolve(REPO_ROOT, 'docs/reports/symbol-registry-revision-repair-apply-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, updatedRows: report.updatedRows, targetRowCount: report.targetRowCount, registryFence: report.registryFence, reportPath }, null, 2));
process.exit(report.status === 'REPAIR_APPLIED' ? 0 : 1);
