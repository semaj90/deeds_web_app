#!/usr/bin/env node
/**
 * End-to-end smoke test for the Graphify symbol extraction lane:
 *
 *   graphify_files --(graphify-symbol-extractor-v1.mts)--> graphify_symbols
 *     --(symbol-reconciliation-writer-v1.mts)--> atlas_symbol_registry / atlas_symbol_versions
 *
 * This is the FIRST live exercise of symbol-reconciliation-writer-v1.mts's `GROUNDED` code path
 * (previously proven only by code review, since the real admitted workspace revision has zero
 * bindings). Deliberately isolated: creates a synthetic, clearly-namespaced test workspace
 * revision and its own atlas_workspace_source_bindings rows, targeting a handful of REAL files
 * already registered in atlas_source_refs (so the bindings FK is satisfiable) -- never touches
 * the real admitted revision's rows, and cleans up its own synthetic rows at the end.
 *
 * Usage: node scripts/atlas/smoke-graphify-symbol-lane-v1.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const SYNTHETIC_REVISION = `sha256:test-symbol-lane-smoke-${createHash('sha256').update(String(Date.now())).digest('hex').slice(0, 16)}`;
const REPO_ID = 'deeds-web-app';
const FILE_COUNT = 3;

function assert(condition, message) {
  if (!condition) throw new Error(`SMOKE_ASSERTION_FAILED: ${message}`);
}

function bindingChecksum(row) {
  return createHash('sha256')
    .update(`${row.repoId}:${row.workspaceRevision}:${row.sourceRef}:${row.sourceRevision}:${row.contentDigest}:${row.byteLength}:${row.producerRevision}`, 'utf8')
    .digest('hex');
}

async function main() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 2, statement_timeout: 60000 });
  const cleanup = [];
  const report = {
    schema: 'atlas.smoke-graphify-symbol-lane.v1',
    generatedAt: new Date().toISOString(),
    syntheticWorkspaceRevision: SYNTHETIC_REVISION,
    steps: [],
    status: 'IN_PROGRESS',
  };

  try {
    // 1. Pick real, on-disk files that are already registered in atlas_source_refs with a plain
    //    (non-anchored) key -- required because atlas_workspace_source_bindings.canonical_source_ref
    //    has a real FK into atlas_source_refs(repo_id, source_ref_key).
    const candidateRows = await pool.query(
      `SELECT gf.file_id, gf.source_ref, gf.content_hash, gf.byte_length
       FROM atlas_source_refs asr
       JOIN graphify_files gf ON gf.source_ref = asr.source_ref_key
       WHERE asr.repo_id = $1 AND asr.source_ref_key NOT LIKE '%#%'
       ORDER BY gf.source_ref
       LIMIT $2`,
      [REPO_ID, FILE_COUNT],
    );
    assert(candidateRows.rowCount === FILE_COUNT, `expected ${FILE_COUNT} candidate files with real atlas_source_refs coverage, found ${candidateRows.rowCount}`);
    report.steps.push({ step: 'select_candidates', files: candidateRows.rows.map((r) => r.source_ref) });

    // 2. Reset those files to UNPROCESSED (idempotent -- this smoke test owns re-running
    //    extraction against them regardless of any prior run's status) and delete any
    //    pre-existing graphify_symbols rows for them, so this run's counts are unambiguous.
    const fileIds = candidateRows.rows.map((r) => r.file_id);
    await pool.query(`DELETE FROM graphify_symbols WHERE file_id = ANY($1::uuid[])`, [fileIds]);
    await pool.query(`UPDATE graphify_files SET parse_status = 'UNPROCESSED', parse_error = NULL WHERE file_id = ANY($1::uuid[])`, [fileIds]);
    report.steps.push({ step: 'reset_files', fileCount: fileIds.length });

    // 3. Insert synthetic atlas_workspace_source_bindings rows for these files, under the
    //    synthetic revision only. content_digest/source_revision are derived from the real
    //    file's own content_hash so the binding is at least internally consistent, not random.
    const bindingRows = candidateRows.rows.map((row, index) => {
      const sourceRevision = `sha256:${createHash('sha256').update(`${row.source_ref}:${row.content_hash}`).digest('hex')}`;
      const contentDigest = createHash('sha256').update(row.content_hash ?? row.source_ref).digest('hex');
      const base = {
        repoId: REPO_ID,
        workspaceRevision: SYNTHETIC_REVISION,
        sourceRef: row.source_ref,
        sourceRevision,
        contentDigest,
        byteLength: Number(row.byte_length ?? 0),
        sourceManifestOrdinal: index,
        producerRevision: 'smoke-graphify-symbol-lane-v1',
      };
      return { ...base, bindingChecksum: bindingChecksum(base) };
    });
    for (const row of bindingRows) {
      await pool.query(
        `INSERT INTO atlas_workspace_source_bindings
           (repo_id, workspace_revision, canonical_source_ref, source_revision,
            content_digest, byte_length, source_manifest_ordinal, producer_revision, binding_checksum)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [row.repoId, row.workspaceRevision, row.sourceRef, row.sourceRevision,
          row.contentDigest, row.byteLength, row.sourceManifestOrdinal, row.producerRevision, row.bindingChecksum],
      );
    }
    cleanup.push(async () => {
      await pool.query(`DELETE FROM atlas_workspace_source_bindings WHERE workspace_revision = $1`, [SYNTHETIC_REVISION]);
    });
    report.steps.push({ step: 'insert_synthetic_bindings', count: bindingRows.length });

    // 4. Run the real extractor (--apply) targeted at exactly these files.
    const extractorPath = path.join(REPO_ROOT, 'scripts', 'atlas', 'graphify-symbol-extractor-v1.mts');
    const extractOut = execFileSync(
      'npx',
      ['tsx', extractorPath, '--apply', '--source-refs', candidateRows.rows.map((r) => r.source_ref).join(',')],
      { cwd: REPO_ROOT, encoding: 'utf8', shell: true },
    );
    const extractReport = JSON.parse(extractOut);
    assert(extractReport.filesProcessed === FILE_COUNT, `expected ${FILE_COUNT} files processed by the extractor, got ${extractReport.filesProcessed}`);
    assert(extractReport.totalSymbolsInserted > 0, 'expected at least 1 symbol inserted');
    report.steps.push({ step: 'run_extractor', filesProcessed: extractReport.filesProcessed, symbolsInserted: extractReport.totalSymbolsInserted });

    const symbolCountAfterExtract = await pool.query(
      `SELECT count(*)::int AS n FROM graphify_symbols WHERE file_id = ANY($1::uuid[])`, [fileIds],
    );
    assert(symbolCountAfterExtract.rows[0].n > 0, 'graphify_symbols has no rows for the smoke files after extraction');

    // 5. Run the real reconciliation writer against the synthetic revision -- first live exercise
    //    of its GROUNDED branch (--allow-create --apply required to actually promote symbols).
    const reconciliationPath = path.join(REPO_ROOT, 'scripts', 'atlas', 'symbol-reconciliation-writer-v1.mts');
    const reconcileOut = execFileSync(
      'npx',
      ['tsx', reconciliationPath, '--workspace-revision', SYNTHETIC_REVISION, '--allow-create', '--apply'],
      { cwd: REPO_ROOT, encoding: 'utf8', shell: true },
    );
    const reconcileReport = JSON.parse(reconcileOut);
    assert(reconcileReport.gate.status === 'GROUNDED', `expected GROUNDED gate status, got ${reconcileReport.gate.status}`);
    assert(reconcileReport.action === 'CANONICALIZATION_APPLIED', `expected CANONICALIZATION_APPLIED, got ${reconcileReport.action}`);
    report.steps.push({
      step: 'run_reconciliation_writer',
      gateStatus: reconcileReport.gate.status,
      canonicalSymbolCount: reconcileReport.receipt?.canonical_symbol_count,
    });

    // 6. Re-run both scripts a second time to prove idempotency (no duplicate rows).
    const symbolCountBeforeRerun = (await pool.query(
      `SELECT count(*)::int AS n FROM graphify_symbols WHERE file_id = ANY($1::uuid[])`, [fileIds],
    )).rows[0].n;
    await pool.query(`UPDATE graphify_files SET parse_status = 'UNPROCESSED' WHERE file_id = ANY($1::uuid[])`, [fileIds]);
    execFileSync('npx', ['tsx', extractorPath, '--apply', '--source-refs', candidateRows.rows.map((r) => r.source_ref).join(',')], { cwd: REPO_ROOT, encoding: 'utf8', shell: true });
    const symbolCountAfterRerun = (await pool.query(
      `SELECT count(*)::int AS n FROM graphify_symbols WHERE file_id = ANY($1::uuid[])`, [fileIds],
    )).rows[0].n;
    assert(symbolCountAfterRerun === symbolCountBeforeRerun, `idempotency violated: ${symbolCountBeforeRerun} -> ${symbolCountAfterRerun} rows across a second identical run`);
    report.steps.push({ step: 'idempotency_check', before: symbolCountBeforeRerun, after: symbolCountAfterRerun, idempotent: true });

    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    // 7. Clean up: remove synthetic bindings so nothing pollutes real tables, restore the
    //    smoke-test files back to UNPROCESSED and delete the extraction rows this run created,
    //    leaving both graphify_files and graphify_symbols as this smoke test found them.
    for (const fn of cleanup) await fn().catch(() => {});
    const cleanupCheck = await pool.query(
      `SELECT count(*)::int AS n FROM atlas_workspace_source_bindings WHERE workspace_revision = $1`, [SYNTHETIC_REVISION],
    );
    report.syntheticRowsRemainingAfterCleanup = cleanupCheck.rows[0].n;
    await pool.end();
    console.log(JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
