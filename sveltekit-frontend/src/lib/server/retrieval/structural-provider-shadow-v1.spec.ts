import { describe, expect, it } from 'vitest';
import { buildStructuralProviderShadowReceiptV1 } from './structural-provider-shadow-v1.js';

const candidate = (packetKey: string) => ({ packetKey, sourceRef: `${packetKey}.ts`, rank: 1, score: 1, lane: 'ast' as const });

describe('StructuralProvider shadow receipt', () => {
  it('keeps structural results out of RRF and reports set differences', () => {
    const receipt = buildStructuralProviderShadowReceiptV1({
      queryDigest: 'q'.repeat(64), workspaceRevision: 'sha256:w', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'o'.repeat(64),
      legacyCandidates: [candidate('packet-a'), candidate('packet-b')],
      structuralProvider: {
        schema: 'atlas.structural-provider-result.v1', providerRevision: 'provider:v1', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'o'.repeat(64), workspaceRevision: 'sha256:w',
        candidates: [candidate('packet-b'), candidate('packet-c')], sourceCount: 1, observationCount: 2, matchedCount: 2, acceptedCount: 2, resultChecksum: 'r'.repeat(64), canonicalAuthority: false, writes: false,
      },
      rejectedStatuses: ['AMBIGUOUS_SOURCE', 'SOURCE_REVISION_MISMATCH'],
    });
    expect(receipt.intersectionCount).toBe(1);
    expect(receipt.newOnly).toEqual(['packet-c']);
    expect(receipt.legacyOnly).toEqual(['packet-a']);
    expect(receipt.legacyEnteredRrf).toBe(true);
    expect(receipt.structuralEnteredRrf).toBe(false);
    expect(receipt.writes).toBe(false);
  });
});
