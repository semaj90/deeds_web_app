import { describe, expect, it } from 'vitest';
import { assertSpectralRtxFixtureAligned, buildSpectralRtxAlignmentFixtureV1 } from './spectral-rtx-alignment-fixture-v1.js';

const H = 'a'.repeat(64);
const row = (ordinal: number, pagerank: number) => ({ ordinal, canonicalId: `c${ordinal}`, semantic768: Array.from({ length: 768 }, (_, index) => (index + ordinal) / 768), pagerank });

describe('spectral RTX alignment fixture v1', () => {
  it('creates deterministic non-promotable RTX/spectral evidence', () => {
    const input = { fixtureId: 'fixture-1', workspaceRevision: 'w1', sourceRevision: 's1', representationRevision: 'embgemma-r1', graphRevision: 'g1', ordinalMapChecksum: H, rows: [row(1, 0.2), row(0, 0.8)] };
    const first = buildSpectralRtxAlignmentFixtureV1(input);
    const second = buildSpectralRtxAlignmentFixtureV1(input);
    expect(first.outputChecksum).toBe(second.outputChecksum);
    expect(first.spectral.assignments.map((entry) => entry.ordinal)).toEqual([0, 1]);
    expect(first.promotionEligible).toBe(false);
    expect(first.canonicalWritesAllowed).toBe(false);
  });

  it('fails alignment on revision or ordinal-map drift', () => {
    const fixture = buildSpectralRtxAlignmentFixtureV1({ fixtureId: 'fixture-1', workspaceRevision: 'w1', sourceRevision: 's1', representationRevision: 'r1', graphRevision: 'g1', ordinalMapChecksum: H, rows: [row(0, 0.5)] });
    expect(() => assertSpectralRtxFixtureAligned({ fixture, workspaceRevision: 'w2', sourceRevision: 's1', representationRevision: 'r1', graphRevision: 'g1', ordinalMapChecksum: H })).toThrow('SPECTRAL_RTX_WORKSPACEREVISION_MISMATCH');
    expect(() => assertSpectralRtxFixtureAligned({ fixture, workspaceRevision: 'w1', sourceRevision: 's1', representationRevision: 'r1', graphRevision: 'g1', ordinalMapChecksum: 'b'.repeat(64) })).toThrow('SPECTRAL_RTX_ORDINALMAPCHECKSUM_MISMATCH');
  });
});
