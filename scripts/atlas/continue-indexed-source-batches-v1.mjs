import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { verifyIndexedSourceProviderReceiptV1 } from './lib/indexed-source-batch-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactDirectory = fs.realpathSync(path.join(root, '.tmp/atlas'));
const execute = promisify(execFile);
const maxPages = Number(process.argv[3] ?? 8);
const concurrency = Number(process.argv[4] ?? 2);
const cohortPath = process.argv[5] ?? null;
assert.ok(Number.isInteger(maxPages) && maxPages >= 1 && maxPages <= 1000, 'page budget must be 1..1000');
assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 2, 'worker count must be 1..2');
function localReceipt(file) {
  const absolute = fs.realpathSync(path.resolve(root, file));
  const relative = path.relative(artifactDirectory, absolute);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'receipt outside artifact directory');
  assert.ok(fs.statSync(absolute).size <= 4 * 1024 * 1024, 'oversized receipt');
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}
function verifyPage(report) {
  const { receiptChecksum, ...body } = report;
  assert.equal(receiptChecksum, `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`);
  assert.equal(report.canonicalWritesCommitted, 0);
  assert.equal(report.datastoreWritesPerformed, false);
  for (const item of report.items) {
    assert.equal(item.status, 'COMPLETED', `incomplete source: ${item.sourceRef}`);
    const provider = localReceipt(item.receiptPath);
    assert.equal(provider.status, 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED');
    assert.equal(provider.indexingOutcome, 'DRY_RUN_VALIDATED_NOT_INDEXED');
    verifyIndexedSourceProviderReceiptV1(provider, {
      ...item, status: provider.status, indexingOutcome: provider.indexingOutcome,
      canonicalAuthority: false, canonicalWritesCommitted: 0,
    });
    assert.equal(provider.source.sourceReadMode, 'MATERIALIZED_ADMITTED_SNAPSHOT');
    const snapshot = provider.source.materializedSnapshotRevision;
    assert.match(snapshot, /^sha256:[0-9a-f]{64}$/);
    const snapshotRoot = fs.realpathSync(path.join(root, '.tmp/workspace-source-snapshots', snapshot.slice(7)));
    const sourcePath = fs.realpathSync(path.resolve(snapshotRoot, item.sourceRef));
    const relative = path.relative(snapshotRoot, sourcePath);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    assert.equal(`sha256:${createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')}`, item.sourceRevision);
  }
}
const checkpointPath = process.argv[2];
assert.ok(checkpointPath, 'checkpoint report path required');
let checkpoint = localReceipt(checkpointPath);
verifyPage(checkpoint);
assert.ok(checkpoint.truncated && checkpoint.nextSourceRef, 'checkpoint has no continuation');
assert.ok(process.env.ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT, 'materialized snapshot environment required');
const output = path.join(artifactDirectory, `indexed-source-continuation-${Date.now()}.json`);
const run = { schema: 'atlas.indexed-source-continuation.v1', startedAt: new Date().toISOString(),
  processId: process.pid, checkpointPath, cohortPath, maxPages, concurrency, directory: checkpoint.directory,
  workspaceRevision: checkpoint.workspaceRevision, pages: [], status: 'RUNNING',
  verifiedNewSources: 0, lastVerifiedCursor: checkpoint.nextSourceRef, productionWritesPerformed: 0 };
const save = () => fs.writeFileSync(output, JSON.stringify(run, null, 2) + '\n');
save();
try {
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const { stdout } = await execute(process.execPath, [path.join(root, 'scripts/atlas/audit-indexed-source-batch-v1.mjs'),
      checkpoint.directory, checkpoint.workspaceRevision, '8', String(concurrency), checkpoint.nextSourceRef,
      ...(cohortPath ? [`--cohort=${cohortPath}`] : [])], {
      cwd: root, env: process.env, timeout: 1_800_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    });
    const summary = JSON.parse(stdout);
    run.pages.push({ path: summary.reportPath, verified: false });
    save();
    const next = localReceipt(summary.reportPath);
    assert.equal(next.afterSourceRef, checkpoint.nextSourceRef);
    assert.equal(next.directory, checkpoint.directory);
    assert.equal(next.workspaceRevision, checkpoint.workspaceRevision);
    if (cohortPath) assert.equal(next.cohortReceiptChecksum, localReceipt(cohortPath).receiptChecksum);
    verifyPage(next);
    assert.ok(!next.truncated || next.nextSourceRef > checkpoint.nextSourceRef, 'cursor did not advance');
    run.pages.at(-1).verified = true;
    run.verifiedNewSources += next.items.length;
    run.lastVerifiedCursor = next.nextSourceRef;
    run.status = next.truncated ? 'RUNNING' : 'COHORT_EXHAUSTED_DIAGNOSTIC_ONLY';
    checkpoint = next;
    save();
    console.log(JSON.stringify({ page: pageIndex + 1, reportPath: summary.reportPath,
      verifiedNewSources: run.verifiedNewSources, nextSourceRef: run.lastVerifiedCursor, status: run.status }));
    if (!next.truncated) break;
  }
  if (run.status === 'RUNNING') run.status = 'PAGE_BUDGET_COMPLETED_DIAGNOSTIC_ONLY';
  if (cohortPath) {
    const { stdout } = await execute(process.execPath, [path.join(root, 'scripts/atlas/audit-indexed-source-coverage-chain-v1.mjs'),
      run.pages.at(-1)?.path ?? checkpointPath, cohortPath], {
      cwd: root, env: process.env, timeout: 120_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    });
    const coverage = JSON.parse(stdout);
    assert.equal(coverage.issues.length, 0);
    assert.equal(coverage.cohort.issues.length, 0);
    run.coverageReportPath = coverage.reportPath;
    run.remainingSources = coverage.cohort.remaining;
    if (run.status === 'COHORT_EXHAUSTED_DIAGNOSTIC_ONLY') {
      assert.ok(coverage.cohort.status.startsWith('FROZEN_CORPUS_DIAGNOSTICS_COMPLETE'));
    }
  }
} catch (error) {
  run.status = 'STOPPED_AT_UNVERIFIED_PAGE';
  run.error = error.message;
  process.exitCode = 1;
} finally {
  run.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({ ...run, pages: undefined, reportPath: path.relative(root, output) }));
}
