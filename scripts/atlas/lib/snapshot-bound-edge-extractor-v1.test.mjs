import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  resolveSnapshotSourceFile,
  buildSnapshotBoundEdgeProposal,
  validateProposalsForPersistence,
  sha256,
  verifySnapshotUtf8ByteSpan,
} from './snapshot-bound-edge-extractor-v1.mjs';

const VALID_WS_REVISION = `sha256:${'a'.repeat(64)}`;
const VALID_SRC_REVISION = `sha256:${'b'.repeat(64)}`;

test('verifies exact UTF-8 byte spans and derives evidence lines', () => {
  const bytes = Buffer.from('const label = "🛰️";\ninvoke();', 'utf8');
  const start = bytes.indexOf(Buffer.from('invoke();'));
  const result = verifySnapshotUtf8ByteSpan({ bytes, byteSpan: [start, start + Buffer.byteLength('invoke();')] });

  assert.equal(result.text, 'invoke();');
  assert.equal(result.startLine, 2);
  assert.equal(result.endLine, 2);
  assert.equal(result.digest, sha256(Buffer.from('invoke();')));
});

test('rejects invalid and UTF-8-splitting byte spans', () => {
  const bytes = Buffer.from('x🛰️y', 'utf8');
  const emojiStart = bytes.indexOf(Buffer.from('🛰️', 'utf8'));

  assert.throws(() => verifySnapshotUtf8ByteSpan({ bytes, byteSpan: [0, bytes.length + 1] }), /SOURCE_BYTE_SPAN_INVALID/);
  assert.throws(() => verifySnapshotUtf8ByteSpan({ bytes, byteSpan: [emojiStart + 1, emojiStart + 4] }), /SOURCE_BYTE_SPAN_NOT_UTF8_ALIGNED/);
});

function createFixtureSnapshot() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-snapshot-test-'));
  const validFileRel = 'src/test-file.ts';
  const validFilePath = path.join(tmpDir, 'src', 'test-file.ts');
  fs.mkdirSync(path.dirname(validFilePath), { recursive: true });

  const content = 'export function testCall() { helper(); }';
  fs.writeFileSync(validFilePath, content, 'utf8');
  const digest = crypto.createHash('sha256').update(content).digest('hex');

  const manifestIndex = new Map([
    [validFileRel, {
      sourceRef: validFileRel,
      sourceRevision: `sha256:${digest}`,
      contentDigest: `sha256:${digest}`,
      byteLength: Buffer.byteLength(content),
    }],
  ]);

  return { tmpDir, manifestIndex, validFileRel, validFilePath, content, digest };
}

test('1. Source path absent from manifest -> Rejects', () => {
  const { tmpDir, manifestIndex } = createFixtureSnapshot();
  try {
    assert.throws(() => {
      resolveSnapshotSourceFile({
        snapshotRoot: tmpDir,
        manifestIndex,
        sourceRef: 'src/absent-file.ts',
        expectedWorkspaceRevision: VALID_WS_REVISION,
      });
    }, /SOURCE_PATH_ABSENT_FROM_MANIFEST:src\/absent-file\.ts/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('2. Path traversal or symlink escapes snapshot -> Rejects', () => {
  const { tmpDir, manifestIndex } = createFixtureSnapshot();
  try {
    assert.throws(() => {
      resolveSnapshotSourceFile({
        snapshotRoot: tmpDir,
        manifestIndex,
        sourceRef: '../outside-file.ts',
        expectedWorkspaceRevision: VALID_WS_REVISION,
      });
    }, /PATH_TRAVERSAL_OR_ESCAPE_REJECTED/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('3. Source bytes differ from manifest digest -> Rejects', () => {
  const { tmpDir, manifestIndex, validFileRel, validFilePath } = createFixtureSnapshot();
  try {
    // Tamper with bytes
    fs.writeFileSync(validFilePath, 'tampered bytes', 'utf8');
    assert.throws(() => {
      resolveSnapshotSourceFile({
        snapshotRoot: tmpDir,
        manifestIndex,
        sourceRef: validFileRel,
        expectedWorkspaceRevision: VALID_WS_REVISION,
      });
    }, /SOURCE_BYTES_DIGEST_MISMATCH/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('4. Source or workspace revision missing -> Rejects', () => {
  assert.throws(() => {
    buildSnapshotBoundEdgeProposal({
      sourceRef: 'src/foo.ts',
      sourceRevision: null,
      workspaceRevision: VALID_WS_REVISION,
      relation: 'CALLS',
      targetLabel: 'bar',
    });
  }, /REVISION_REQUIRED/);

  assert.throws(() => {
    buildSnapshotBoundEdgeProposal({
      sourceRef: 'src/foo.ts',
      sourceRevision: VALID_SRC_REVISION,
      workspaceRevision: '',
      relation: 'CALLS',
      targetLabel: 'bar',
    });
  }, /REVISION_REQUIRED/);
});

test('5. Proposal references a different revision in terminal validation -> Rejects', () => {
  const proposal = buildSnapshotBoundEdgeProposal({
    sourceRef: 'src/foo.ts',
    sourceRevision: VALID_SRC_REVISION,
    workspaceRevision: VALID_WS_REVISION,
    relation: 'CALLS',
    targetLabel: 'bar',
  });

  const differentReceipt = {
    status: 'COMPLETED',
    workspaceRevision: `sha256:${'f'.repeat(64)}`,
  };

  const validation = validateProposalsForPersistence({
    proposals: [proposal],
    terminalExecutionReceipt: differentReceipt,
    expectedWorkspaceRevision: VALID_WS_REVISION,
  });

  assert.equal(validation.allowed, false);
  assert.match(validation.reason, /PROPOSAL_REVISION_MISMATCH/);
});

test('6. Alias-only symbol match -> Degraded proposal', () => {
  const proposal = buildSnapshotBoundEdgeProposal({
    sourceRef: 'src/foo.ts',
    sourceRevision: VALID_SRC_REVISION,
    workspaceRevision: VALID_WS_REVISION,
    relation: 'CALLS',
    targetLabel: 'bar',
    subjectSymbol: { symbol_id: 'sym-alias-1' },
    symbolMatchKind: 'alias',
  });

  assert.equal(proposal.admission_status, 'DEGRADED_ALIAS_MATCH');
  assert.equal(proposal.canonical_authority, false);
});

test('7. Duplicate edge under same revision -> Deterministic deduplication', () => {
  const edgeInput = {
    sourceRef: 'src/foo.ts',
    sourceRevision: VALID_SRC_REVISION,
    workspaceRevision: VALID_WS_REVISION,
    relation: 'CALLS',
    targetLabel: 'bar',
    byteSpan: [10, 25],
    subjectSymbol: { symbol_id: 'sym-1' },
    symbolMatchKind: 'exact',
  };

  const p1 = buildSnapshotBoundEdgeProposal(edgeInput);
  const p2 = buildSnapshotBoundEdgeProposal(edgeInput);

  assert.equal(p1.proposal_id, p2.proposal_id);

  const receipt = { status: 'COMPLETED', workspaceRevision: VALID_WS_REVISION };
  const validation = validateProposalsForPersistence({
    proposals: [p1, p2],
    terminalExecutionReceipt: receipt,
    expectedWorkspaceRevision: VALID_WS_REVISION,
  });

  assert.equal(validation.totalProposals, 2);
  assert.equal(validation.distinctProposals, 1);
});

test('8. Exact canonical symbol and revisions -> Eligible for admission review', () => {
  const proposal = buildSnapshotBoundEdgeProposal({
    sourceRef: 'src/foo.ts',
    sourceRevision: VALID_SRC_REVISION,
    workspaceRevision: VALID_WS_REVISION,
    relation: 'CALLS',
    targetLabel: 'bar',
    byteSpan: [10, 25],
    subjectSymbol: { symbol_id: 'sym-exact-1' },
    symbolMatchKind: 'exact',
  });

  assert.equal(proposal.admission_status, 'CANONICAL_ELIGIBLE');
  assert.equal(proposal.resolution.subject_symbol_id, 'sym-exact-1');
});

test('9. Missing terminal execution receipt -> No persistence', () => {
  const proposal = buildSnapshotBoundEdgeProposal({
    sourceRef: 'src/foo.ts',
    sourceRevision: VALID_SRC_REVISION,
    workspaceRevision: VALID_WS_REVISION,
    relation: 'CALLS',
    targetLabel: 'bar',
    subjectSymbol: { symbol_id: 'sym-exact-1' },
    symbolMatchKind: 'exact',
  });

  const validation = validateProposalsForPersistence({
    proposals: [proposal],
    terminalExecutionReceipt: null,
    expectedWorkspaceRevision: VALID_WS_REVISION,
  });

  assert.equal(validation.allowed, false);
  assert.equal(validation.reason, 'PERSISTENCE_REFUSED_MISSING_TERMINAL_RECEIPT');
});

test('10. Repeated authorized projection -> Idempotent output', () => {
  const proposal = buildSnapshotBoundEdgeProposal({
    sourceRef: 'src/foo.ts',
    sourceRevision: VALID_SRC_REVISION,
    workspaceRevision: VALID_WS_REVISION,
    relation: 'CALLS',
    targetLabel: 'bar',
    byteSpan: [10, 25],
    subjectSymbol: { symbol_id: 'sym-exact-1' },
    symbolMatchKind: 'exact',
  });

  const receipt = { status: 'COMPLETED', workspaceRevision: VALID_WS_REVISION };

  const firstRun = validateProposalsForPersistence({
    proposals: [proposal],
    terminalExecutionReceipt: receipt,
    expectedWorkspaceRevision: VALID_WS_REVISION,
  });

  const secondRun = validateProposalsForPersistence({
    proposals: [proposal],
    terminalExecutionReceipt: receipt,
    expectedWorkspaceRevision: VALID_WS_REVISION,
  });

  assert.deepEqual(firstRun, secondRun);
  assert.equal(firstRun.eligibleProposals.length, 1);
});
