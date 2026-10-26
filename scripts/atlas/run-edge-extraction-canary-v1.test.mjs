import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runSnapshotBoundEdgeExtractionCanaryV1 } from './run-edge-extraction-canary-v1.mjs';

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const snapshotRevision = `sha256:${'b'.repeat(64)}`;

async function makeFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-edge-canary-'));
  const snapshotRoot = path.join(root, '.tmp/workspace-source-snapshots', snapshotRevision.slice(7));
  const manifestSources = [];
  for (const [sourceRef, text] of Object.entries(files)) {
    const bytes = Buffer.from(text, 'utf8');
    const fullPath = path.join(snapshotRoot, ...sourceRef.split('/'));
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, bytes);
    manifestSources.push({
      sourceRef,
      repositoryRelativePath: sourceRef,
      sourceRevision: sha256(bytes),
      contentDigest: sha256(bytes),
      byteLength: bytes.length,
    });
  }
  const manifestPath = 'docs/reports/snapshot.json';
  const fullManifestPath = path.join(root, manifestPath);
  fs.mkdirSync(path.dirname(fullManifestPath), { recursive: true });
  fs.writeFileSync(fullManifestPath, JSON.stringify({ snapshotRevision, sources: manifestSources }));
  const admissionPath = path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json');
  fs.writeFileSync(admissionPath, JSON.stringify({
    status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
    authority: true,
    workspaceRevision,
    snapshotRevision,
    manifestPath,
  }));
  return { root, snapshotRoot };
}

function sidecarFetch({ mismatchRevision = false, invalidSpan = false } = {}) {
  const requests = [];
  const fetchImpl = async (_url, request) => {
    const body = JSON.parse(request.body);
    requests.push(body);
    const bytes = Buffer.from(body.source, 'utf8');
    const start = bytes.indexOf(Buffer.from('target()'));
    const span = invalidSpan ? [start, bytes.length + 1] : [start, start + Buffer.byteLength('target()')];
    return {
      ok: true,
      async json() {
        return {
          file_path: body.file_path,
          source_revision: mismatchRevision ? sha256('wrong') : body.source_revision,
          syntax_status: 'CLEAN',
          engine: 'treesitter-chunker',
          engine_version: '4.0.0',
          edges: [{
            type: 'CALLS',
            from_evidence_key: 'callerFn',
            to_evidence_key: 'target()',
            occurrence_byte_spans: [span],
          }],
          diagnostics: [],
        };
      },
    };
  };
  return { fetchImpl, requests };
}

test('uses 8095 for code, skips markdown, and emits only review-gated CALLS', async (t) => {
  const { root } = await makeFixture({ 'src/caller.ts': 'function callerFn(){ target(); }', '.claude/AGENT_CONSTITUTION.md': 'Use PostgreSQL and npm run tests.' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { fetchImpl, requests } = sidecarFetch();
  const receipt = await runSnapshotBoundEdgeExtractionCanaryV1({
    root,
    sourceRefs: ['src/caller.ts', '.claude/AGENT_CONSTITUTION.md'],
    fetchImpl,
    runId: 'test-run',
  });

  assert.equal(requests.length, 1);
  assert.equal(receipt.canaryFileCount, 2);
  assert.equal(receipt.canaryFiles[1].status, 'SKIPPED_NON_CODE_NO_REGEX');
  assert.equal(receipt.relationCounts.CALLS, 1);
  assert.equal(receipt.relationCounts.USES_DB, 0);
  assert.equal(receipt.relationCounts.USES_TOOL, 0);
  assert.equal(receipt.databaseWritesPerformed, false);
  assert.equal(receipt.canonicalAuthority, false);
  assert.equal(receipt.terminalExecutionLinkage, 'UNPROVEN');
  assert.equal(receipt.persistenceValidation.allowed, false);
  assert.equal(receipt.persistenceValidation.reason, 'PERSISTENCE_REFUSED_MISSING_TERMINAL_RECEIPT');
  assert.equal(receipt.extractorImplementation.length, 2);
  assert.ok(receipt.extractorImplementation.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.sha256)));

  const proposals = fs.readFileSync(path.join(root, receipt.proposalArtifact.path), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].resolution_status, 'SYNTAX_ONLY');
  assert.equal(proposals[0].admission_status, 'REVIEW_REQUIRED');
  assert.equal(proposals[0].source_revision, receipt.canaryFiles[0].sourceRevision);
  assert.equal(proposals[0].evidence_span.digest, sha256(Buffer.from('target()')));
});

test('rejects sidecar source-revision mismatch without proposing edges', async (t) => {
  const { root } = await makeFixture({ 'src/caller.ts': 'function callerFn(){ target(); }' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { fetchImpl } = sidecarFetch({ mismatchRevision: true });
  const receipt = await runSnapshotBoundEdgeExtractionCanaryV1({ root, sourceRefs: ['src/caller.ts'], fetchImpl, runId: 'lineage-mismatch' });

  assert.equal(receipt.sidecarFailures, 1);
  assert.equal(receipt.canaryFiles[0].status, 'SIDECAR_LINEAGE_MISMATCH');
  assert.equal(receipt.proposalCount, 0);
});

test('rejects invalid AST byte spans and verifies the checksummed receipt', async (t) => {
  const { root } = await makeFixture({ 'src/caller.ts': 'function callerFn(){ target(); }' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { fetchImpl } = sidecarFetch({ invalidSpan: true });
  const receipt = await runSnapshotBoundEdgeExtractionCanaryV1({ root, sourceRefs: ['src/caller.ts'], fetchImpl, runId: 'invalid-span' });
  const { checksumSha256, ...body } = receipt;

  assert.equal(receipt.invalidSpans, 1);
  assert.equal(receipt.proposalCount, 0);
  assert.equal(receipt.status, 'PROPOSAL_CANARY_PARTIAL');
  assert.equal(checksumSha256, sha256(JSON.stringify(body)));
});
