import { describe, expect, it } from 'vitest';
import { buildKnowledgeSourceSnapshotV1 } from './knowledge-source-snapshot-v1.js';
import { auditKnowledgeSourceSnapshotV1, buildRawWorktreeFingerprintV1 } from './knowledge-source-snapshot-audit-v1.js';
import { sha256TextV1 } from './stable-json-v1.js';

const fileA = { sourceRef: 'src/a.ts', kind: 'FILE' as const, executable: false, contentChecksum: sha256TextV1('a'), symlinkTarget: null };
const fileB = { sourceRef: 'src/b.ts', kind: 'FILE' as const, executable: false, contentChecksum: sha256TextV1('b'), symlinkTarget: null };

function snapshot(rawWorktreeFingerprint: string | null) {
  return buildKnowledgeSourceSnapshotV1({
    snapshotRevision: 'snapshot:r1',
    workspaceRevision: 'workspace:r1',
    sources: [
      { sourceRef: 'src/a.ts', sourceRevision: 'source:a', sourceContentChecksum: sha256TextV1('a') },
      { sourceRef: 'src/b.ts', sourceRevision: 'source:b', sourceContentChecksum: sha256TextV1('b') },
    ],
    openspecRevision: 'openspec:r1',
    testRevision: 'tests:r1',
    reportRevisions: [],
    rawWorktreeFingerprint,
  });
}

const observed = [
  { sourceRef: 'src/a.ts', sourceRevision: 'source:a', workspaceRevision: 'workspace:r1', sourceInventoryRevision: 'inventory:r1', sourceContentChecksum: sha256TextV1('a') },
  { sourceRef: 'src/b.ts', sourceRevision: 'source:b', workspaceRevision: 'workspace:r1', sourceInventoryRevision: 'inventory:r1', sourceContentChecksum: sha256TextV1('b') },
];

describe('KnowledgeSourceSnapshotAuditV1', () => {
  it('builds a raw worktree fingerprint independent of input ordering', () => {
    expect(buildRawWorktreeFingerprintV1([fileA, fileB])).toBe(buildRawWorktreeFingerprintV1([fileB, fileA]));
  });

  it('proves only exact registry plus raw-worktree parity', () => {
    const fingerprint = buildRawWorktreeFingerprintV1([fileA, fileB]);
    const receipt = auditKnowledgeSourceSnapshotV1({ snapshot: snapshot(fingerprint), observedRegistryRows: observed, observedRawWorktreeFingerprint: fingerprint });
    expect(receipt.status).toBe('PROVEN');
    expect(receipt.exactRegistryMatches).toBe(2);
    expect(receipt.sourceRegistryParity).toBe(true);
    expect(receipt.worktreeFingerprintParity).toBe(true);
  });

  it('fails closed on registry drift or an unbound worktree fingerprint', () => {
    const drifted = auditKnowledgeSourceSnapshotV1({
      snapshot: snapshot(null),
      observedRegistryRows: [{ ...observed[0]!, sourceRevision: 'source:changed' }, observed[1]!],
      observedRawWorktreeFingerprint: buildRawWorktreeFingerprintV1([fileA, fileB]),
    });
    expect(drifted.status).toBe('BLOCKED');
    expect(drifted.issues.map((issue) => issue.kind)).toContain('SOURCE_REVISION_MISMATCH');
    expect(drifted.issues.map((issue) => issue.kind)).toContain('WORKTREE_FINGERPRINT_UNBOUND');
  });
});
