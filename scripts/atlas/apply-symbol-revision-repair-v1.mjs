#!/usr/bin/env node
/**
 * S01-10E — transactional apply of the frozen S01-10D manifest, authorized by an explicit operator apply token
 * ("apply S01-10 placeholder repair") for this exact gate. Requires S01-10D-VERIFY to have already returned
 * S01_10_REPAIR_APPLY_READY for the SAME manifest/preview/cohort checksums (re-verified here, not trusted blindly).
 *
 * ONE bounded transaction: lock the 208 target rows (SELECT ... FOR UPDATE), revalidate each against its frozen
 * OLD precondition, apply each UPDATE under WHERE symbol_version_id = ? AND source_revision = OLD AND
 * workspace_revision = OLD (exactly the manifest's template), require exactly one row affected per statement,
 * do an in-transaction independent readback against every required invariant, and only COMMIT if every one holds.
 * Any failure -> ROLLBACK, REPAIR_PREVIEW_STALE, zero rows changed.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const APPLY_TOKEN = 'apply S01-10 placeholder repair';
const suppliedToken = process.argv.slice(2).join(' ');
if (suppliedToken !== APPLY_TOKEN) {
  console.error(`Refusing to run: exact apply token required as argv, got ${JSON.stringify(suppliedToken)}`);
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-revision-repair-apply.v1';
const previewPath = path.join(root, 'docs/reports/symbol-revision-placeholder-repair-preview-v1.json');
const manifestPath = path.join(root, 'docs/reports/symbol-revision-placeholder-repair-manifest-v1.json');
const cohortPath = path.join(root, 'docs/reports/current-source-authority-cohort-v1.json');
const admissionPath = path.join(root, 'docs/reports/symbol-revision-repair-apply-admission-v1.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
if (admission.result !== 'S01_10_REPAIR_APPLY_READY') { console.error('S01-10D-VERIFY did not return S01_10_REPAIR_APPLY_READY; refusing to apply'); process.exit(2); }
if (cohort.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN') { console.error('S01-07 cohort is no longer PROVEN; refusing to apply'); process.exit(2); }

// Re-verify the three checksums right now, independently of the admission receipt's own claim.
const previewChecksumNow = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(previewPath, 'utf8')).digest('hex');
const cohortChecksumNow = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(cohortPath, 'utf8')).digest('hex');
const manifestCoreNow = { schema: manifest.schema, previewChecksum: manifest.previewChecksum, sealedCohortChecksum: manifest.sealedCohortChecksum, admittedWorkspaceRevision: manifest.admittedWorkspaceRevision, rows: manifest.rows };
const manifestChecksumNow = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(manifestCoreNow)).digest('hex');
if (manifest.previewChecksum !== previewChecksumNow || manifest.sealedCohortChecksum !== cohortChecksumNow || manifest.manifestChecksum !== manifestChecksumNow) {
  console.error('Checksum mismatch at apply time; refusing to run');
  process.exit(2);
}

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const client = await pool.connect();
const report = { schema: SCHEMA, generatedAt: new Date().toISOString(), manifestChecksum: manifest.manifestChecksum, targetRowCount: manifest.rows.length, status: 'PENDING', reasons: [] };

async function fenceRegistry(c) {
  const r = await c.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(stable_symbol_id, ',' ORDER BY stable_symbol_id), '')) AS checksum FROM atlas_symbol_registry`);
  return r.rows[0];
}
async function fenceTreeNodes(c) {
  const r = await c.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(symbol_version_id || ':' || coalesce(upstream_node_id, ''), ',' ORDER BY symbol_version_id), '')) AS checksum FROM atlas_symbol_versions`);
  return r.rows[0];
}

try {
  await client.query('BEGIN');
  // Lock the target rows before revalidating -- prevents a concurrent writer from moving them out from under us.
  const ids = manifest.rows.map((r) => r.symbolVersionId);
  const locked = new Map((await client.query(`SELECT symbol_version_id, source_revision, workspace_revision, upstream_file_id FROM atlas_symbol_versions WHERE symbol_version_id = ANY($1::text[]) FOR UPDATE`, [ids])).rows.map((r) => [r.symbol_version_id, r]));

  const registryBefore = await fenceRegistry(client);
  const treeBefore = await fenceTreeNodes(client);

  for (const row of manifest.rows) {
    const live = locked.get(row.symbolVersionId);
    if (!live || live.source_revision !== row.precondition.oldSourceRevision || live.workspace_revision !== row.precondition.oldWorkspaceRevision) {
      throw new Error(`REPAIR_PREVIEW_STALE: ${row.symbolVersionId} no longer matches its frozen precondition`);
    }
    if (live.upstream_file_id !== null) throw new Error(`REPAIR_PREVIEW_STALE: ${row.symbolVersionId} upstream_file_id unexpectedly non-null`);
  }

  let updatedRows = 0;
  for (const row of manifest.rows) {
    const res = await client.query(
      `UPDATE atlas_symbol_versions SET source_revision = $1, workspace_revision = $2 WHERE symbol_version_id = $3 AND source_revision = $4 AND workspace_revision = $5`,
      [row.proposed.sourceRevision, row.proposed.workspaceRevision, row.symbolVersionId, row.precondition.oldSourceRevision, row.precondition.oldWorkspaceRevision],
    );
    if (res.rowCount !== 1) throw new Error(`REPAIR_PREVIEW_STALE: ${row.symbolVersionId} UPDATE affected ${res.rowCount} rows, expected exactly 1`);
    updatedRows += res.rowCount;
  }
  if (updatedRows !== manifest.rows.length) throw new Error(`updatedRows ${updatedRows} != manifest rows ${manifest.rows.length}`);

  // Independent in-transaction readback against every required invariant.
  const totals = (await client.query(`SELECT count(*)::int AS total FROM atlas_symbol_versions`)).rows[0].total;
  const nowQualified = (await client.query(`SELECT count(*)::int AS n FROM atlas_symbol_versions WHERE source_revision ~ '^sha256:[0-9a-f]{64}$'`)).rows[0].n;
  const stillBad = (await client.query(`SELECT count(*)::int AS n FROM atlas_symbol_versions WHERE source_revision ~ '^workspace:\\d+$' OR source_revision ~ '^[0-9a-f]{40}$'`)).rows[0].n;
  const targetsNowMatchProposed = (await client.query(
    `SELECT count(*)::int AS n FROM atlas_symbol_versions v JOIN (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS sr, unnest($3::text[]) AS wr) p ON v.symbol_version_id = p.id WHERE v.source_revision = p.sr AND v.workspace_revision = p.wr`,
    [ids, manifest.rows.map((r) => r.proposed.sourceRevision), manifest.rows.map((r) => r.proposed.workspaceRevision)],
  )).rows[0].n;
  const upstreamFileIdStillAllNull = (await client.query(`SELECT count(*)::int AS n FROM atlas_symbol_versions WHERE upstream_file_id IS NOT NULL`)).rows[0].n === 0;
  const registryAfter = await fenceRegistry(client);
  const treeAfter = await fenceTreeNodes(client);
  const registryUnchanged = registryAfter.n === registryBefore.n && registryAfter.checksum === registryBefore.checksum;
  // Tree-node fence intentionally changes only in the source_revision-adjacent identity token we did NOT include (we fenced
  // symbol_version_id:upstream_node_id only, which our UPDATE never touches) -- so it MUST be byte-identical before/after.
  const treeNodeRelationsUnchanged = treeAfter.n === treeBefore.n && treeAfter.checksum === treeBefore.checksum;

  const invariants = {
    updatedRowsEquals208: updatedRows === manifest.rows.length,
    totalStill479: totals === 479,
    nowQualifiedIs402: nowQualified === 402, // 194 previously-qualified + 208 newly repaired
    stillBadIs77: stillBad === 77,
    targetsNowMatchProposed: targetsNowMatchProposed === manifest.rows.length,
    upstreamFileIdStillAllNull,
    registryUnchanged,
    treeNodeRelationsUnchanged,
  };
  const allHold = Object.values(invariants).every(Boolean);
  if (!allHold) throw new Error(`REPAIR_PREVIEW_STALE: post-update invariant failure: ${JSON.stringify(invariants)}`);

  await client.query('COMMIT');
  report.status = 'REPAIR_APPLIED';
  report.updatedRows = updatedRows;
  report.readback = { totals, nowQualified, stillBad, targetsNowMatchProposed, upstreamFileIdStillAllNull, registryUnchanged, treeNodeRelationsUnchanged };
  report.invariants = invariants;
  report.registryFence = { before: registryBefore, after: registryAfter };
  report.treeNodeFence = { before: treeBefore, after: treeAfter };
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  report.status = 'REPAIR_PREVIEW_STALE';
  report.reasons.push(String(err && err.message ? err.message : err));
} finally {
  client.release();
}

// Independent post-transaction readback on a fresh connection (proves durability, not just in-transaction visibility).
if (report.status === 'REPAIR_APPLIED') {
  const post = await pool.query(`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE source_revision ~ '^sha256:[0-9a-f]{64}$')::int AS qualified,
      count(*) FILTER (WHERE source_revision ~ '^workspace:\\d+$' OR source_revision ~ '^[0-9a-f]{40}$')::int AS bad,
      count(*) FILTER (WHERE upstream_file_id IS NOT NULL)::int AS non_null_upstream_file_id
    FROM atlas_symbol_versions`);
  report.independentPostTransactionReadback = post.rows[0];
}

const body = JSON.stringify(report, null, 2);
const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
const immutable = path.join(root, 'docs/reports', `symbol-revision-repair-apply-v1.${sha12}.json`);
const pointer = path.join(root, 'docs/reports/symbol-revision-repair-apply-v1.json');
fs.writeFileSync(immutable, body + '\n', { flag: 'wx' });
fs.writeFileSync(pointer, body + '\n');
console.log(report.status, immutable);
console.log(JSON.stringify(report.invariants ?? report.reasons));
await pool.end();
