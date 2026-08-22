import { describe, expect, it } from 'vitest';
import { buildGraphifyWorkspaceManifestReceiptV1 } from './graphify-workspace-manifest-receipt-v1.js';

const workspaceRecord = {
  workspaceRevision: `sha256:${'a'.repeat(64)}`,
  sourceManifestDigest: 'a'.repeat(64),
  sourceCount: 2,
};
const entries = [
  { sourceRef: 'a.ts', sourceRevision: `sha256:${'b'.repeat(64)}`, contentDigest: 'b'.repeat(64), byteLength: 1, gitBlobOid: null },
  { sourceRef: 'b.ts', sourceRevision: `sha256:${'c'.repeat(64)}`, contentDigest: 'c'.repeat(64), byteLength: 2, gitBlobOid: null },
];

describe('GraphifyWorkspaceManifestReceiptV1', () => {
  it('marks an exact expected/persisted set complete', () => {
    const receipt = buildGraphifyWorkspaceManifestReceiptV1({
      workspaceRecord,
      expectedEntries: entries,
      persistedBindings: entries.map(({ sourceRef, sourceRevision, contentDigest }) => ({ sourceRef, sourceRevision, contentDigest })),
      parserContractVersion: 'test:v1',
      writerRevision: 'test-writer:v1',
    });
    expect(receipt.complete).toBe(true);
    expect(receipt.readOnlyObservation).toBe(true);
    expect(receipt.canonicalAuthority).toBe(false);
  });

  it('blocks completeness on a changed persisted digest', () => {
    const receipt = buildGraphifyWorkspaceManifestReceiptV1({
      workspaceRecord,
      expectedEntries: entries,
      persistedBindings: [
        { sourceRef: entries[0].sourceRef, sourceRevision: entries[0].sourceRevision, contentDigest: entries[0].contentDigest },
        { sourceRef: entries[1].sourceRef, sourceRevision: entries[1].sourceRevision, contentDigest: 'd'.repeat(64) },
      ],
      parserContractVersion: 'test:v1',
      writerRevision: 'test-writer:v1',
    });
    expect(receipt.complete).toBe(false);
    expect(receipt.persistedExactRevisionCount).toBe(2);
    expect(receipt.persistedExactDigestCount).toBe(1);
  });
});
