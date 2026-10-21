import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileIndexedSourceCohortV1 } from './lib/indexed-source-cohort-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, '.tmp/atlas');
const latestPath = path.resolve(process.argv[2] ?? path.join(directory, 'indexed-source-batch-1792552543568.json'));
const digest = value => createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const latest = read(latestPath);
const candidates = fs.readdirSync(directory).filter(name => /^indexed-source-batch-\d+\.json$/.test(name)).map(name => {
  const file = path.join(directory, name);
  return { file, timestamp: Number(name.match(/\d+/)[0]), report: read(file) };
}).filter(candidate => candidate.report.directory === latest.directory && candidate.report.workspaceRevision === latest.workspaceRevision);
const chain = [];
const issues = [];
let current = candidates.find(candidate => candidate.file === latestPath);
assert.ok(current, 'latest report belongs to the coverage cohort');
while (current) {
  chain.unshift(current);
  if (current.report.afterSourceRef === null) break;
  const previous = candidates.filter(candidate => candidate.timestamp < current.timestamp &&
    candidate.report.nextSourceRef === current.report.afterSourceRef &&
    candidate.report.counts.FAILED === 0 && candidate.report.counts.PARTIAL === 0 && candidate.report.counts.EXCLUDED === 0)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  if (!previous) { issues.push({ report: current.file, reason: 'PREDECESSOR_RECEIPT_MISSING' }); break; }
  current = previous;
}
const sourceRefs = new Set();
const verifiedItems = [];
const observations = [];
const snapshots = new Set();
let verified = 0;
for (const page of chain) {
  try {
    const { receiptChecksum, ...body } = page.report;
    assert.equal(receiptChecksum, `sha256:${digest(JSON.stringify(body))}`);
    assert.equal(page.report.canonicalWritesCommitted, 0);
    assert.equal(page.report.datastoreWritesPerformed, false);
    for (const item of page.report.items) {
      assert.equal(item.status, 'COMPLETED');
      assert.equal(sourceRefs.has(item.sourceRef), false, 'duplicate source across pages');
      const receiptPath = path.resolve(root, item.receiptPath);
      const receiptRelative = path.relative(directory, fs.realpathSync(receiptPath));
      assert.ok(receiptRelative && !receiptRelative.startsWith('..') && !path.isAbsolute(receiptRelative));
      const { receiptChecksum: providerChecksum, ...provider } = read(receiptPath);
      assert.equal(providerChecksum, digest(JSON.stringify(provider)));
      assert.equal(providerChecksum, item.receiptChecksum);
      assert.equal(provider.source.sourceRef, item.sourceRef);
      assert.equal(provider.source.sourceRevision, item.sourceRevision);
      assert.equal(provider.source.exactByteSha256, item.sourceRevision);
      assert.equal(provider.source.workspaceRevision, latest.workspaceRevision);
      assert.equal(provider.source.sourceReadMode, 'MATERIALIZED_ADMITTED_SNAPSHOT');
      assert.match(provider.source.materializedSnapshotRevision, /^sha256:[0-9a-f]{64}$/);
      snapshots.add(provider.source.materializedSnapshotRevision);
      assert.equal(snapshots.size, 1, 'mixed frozen snapshots');
      assert.ok(Object.values(provider.providers).every(result => result.status === 'COMPLETED'));
      const snapshotRoot = path.resolve(root, '.tmp/workspace-source-snapshots', provider.source.materializedSnapshotRevision.slice(7));
      const source = fs.realpathSync(path.resolve(snapshotRoot, item.sourceRef));
      const relative = path.relative(snapshotRoot, source);
      assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
      assert.equal(`sha256:${digest(fs.readFileSync(source))}`, item.sourceRevision);
      assert.equal(provider.canonicalWritesCommitted, 0);
      assert.equal(provider.indexingOutcome, 'DRY_RUN_VALIDATED_NOT_INDEXED');
      const ast = provider.providers.treeSitterAndAstGrep?.result;
      let syntaxStatus = 'UNKNOWN';
      let syntaxDiagnostic = null;
      if (ast?.outPath) {
        const artifactPath = fs.realpathSync(path.resolve(root, ast.outPath));
        const artifactRelative = path.relative(directory, artifactPath);
        assert.ok(artifactRelative && !artifactRelative.startsWith('..') && !path.isAbsolute(artifactRelative));
        const { receiptChecksum: astChecksum, ...artifact } = read(artifactPath);
        assert.equal(astChecksum, `sha256:${digest(JSON.stringify(artifact))}`);
        assert.equal(astChecksum, ast.receiptChecksum);
        assert.equal(artifact.source.disk_sha256, item.sourceRevision);
        syntaxStatus = artifact.sidecar?.syntax_status ?? 'UNKNOWN';
        syntaxDiagnostic = artifact.sidecar?.error_tag ?? null;
      }
      const astSummary = provider.providers.treeSitterAndAstGrep?.result;
      const lspSummary = provider.providers.lsp?.result;
      const nlpSummary = provider.providers.nlpSidecar?.result;
      observations.push({ ...item, providerReceiptPath: item.receiptPath, providerReceiptChecksum: providerChecksum,
        language: ast?.source?.language ?? lspSummary?.languageId ?? null,
        providerStatuses: Object.fromEntries(Object.entries(provider.providers).map(([name, result]) => [name, result.status])),
        syntaxStatus, syntaxDiagnostic, astStages: astSummary?.stageStatus ?? [],
        nativeChunkCount: astSummary?.counts?.nativeChunks ?? null,
        astGrepMatchCount: astSummary?.counts?.astGrepMatches ?? null,
        astGrepAgreement: astSummary?.agreement ?? null,
        lspStatus: lspSummary?.status ?? null, lspSymbolCount: lspSummary?.symbolCount ?? null,
        nlpStatus: nlpSummary?.status ?? null, nlpPassCount: nlpSummary?.passCount ?? null,
        nlpExactRevisionPassCount: nlpSummary?.exactRevisionPassCount ?? null,
        classificationProposalPresent: nlpSummary?.classificationProposalPresent ?? null });
      verifiedItems.push(item);
      sourceRefs.add(item.sourceRef);
      verified++;
    }
  } catch (error) {
    issues.push({ report: path.relative(root, page.file), reason: error.message });
  }
}
const report = {
  schema: 'atlas.indexed-source-coverage-chain.v1', observedAt: new Date().toISOString(),
  status: issues.length ? 'PARTIAL_RECEIPT_READBACK' : 'FROZEN_SNAPSHOT_DIAGNOSTIC_READBACK_PROVEN',
  directory: latest.directory, workspaceRevision: latest.workspaceRevision,
  snapshotRevisions: [...snapshots],
  pages: chain.map(page => ({ path: path.relative(root, page.file), receiptChecksum: page.report.receiptChecksum })),
  verifiedPageCount: issues.length ? null : chain.length, verifiedSourceCount: verified,
  cohortExhausted: !latest.truncated, nextSourceRef: latest.nextSourceRef,
  issues, canonicalAuthority: false, productionWritesPerformed: 0,
};
if (process.argv[3]) {
  const cohort = read(path.resolve(process.argv[3]));
  assert.equal(cohort.directory, latest.directory);
  assert.equal(cohort.workspaceRevision, latest.workspaceRevision);
  assert.deepEqual([...snapshots], [cohort.snapshotRevision]);
  report.cohort = reconcileIndexedSourceCohortV1(cohort, verifiedItems, !latest.truncated);
  report.cohort.successfulParses = observations.filter(item => item.syntaxStatus === 'CLEAN').length;
  report.cohort.recoverableDiagnostics = observations.filter(item => item.syntaxStatus !== 'CLEAN' && item.syntaxStatus !== 'UNKNOWN').length;
  report.cohort.unknownParseStatus = observations.filter(item => item.syntaxStatus === 'UNKNOWN').length;
  const manifestPath = path.join(directory, 'indexed-source-server-outcomes-v1.jsonl');
  const manifestBytes = observations.map(item => JSON.stringify(item) + '\n').join('');
  fs.writeFileSync(manifestPath, manifestBytes);
  report.outcomeManifest = { path: path.relative(root, manifestPath), sha256: `sha256:${digest(manifestBytes)}`, rows: observations.length };
}
const outputPath = path.join(directory, 'indexed-source-server-coverage-chain-v1.json');
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, pages: undefined,
  cohort: report.cohort ? { ...report.cohort, remainingSourceRefs: undefined } : undefined,
  reportPath: path.relative(root, outputPath) }));
if (issues.length) process.exitCode = 1;
