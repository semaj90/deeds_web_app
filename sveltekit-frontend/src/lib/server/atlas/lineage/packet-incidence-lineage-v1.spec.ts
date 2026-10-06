// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildPacketIncidenceLineageV1, consumeExactRevisionIncidenceV1, PacketIncidenceLineageV1Schema, verifyPacketIncidenceLineageV1,
  type PacketIncidenceExpectedV1, type PacketIncidenceIdentityV1,
} from './packet-incidence-lineage-v1.js';

const base: PacketIncidenceIdentityV1 = {
  packetKey: 'packet:aaa', canonicalId: 'cid-a', sourceRevision: 'sha256:s1',
  neighborPacketKey: 'packet:bbb', neighborCanonicalId: 'cid-b', neighborSourceRevision: 'sha256:s2',
  edgeType: 'IMPORTS', workspaceRevision: 'ws1', graphRevision: 'g1', producerId: 'graphify', producerRevision: 'p1',
  evidenceRefs: ['edge:2', 'edge:1'],
};
const packets: Record<string, { canonicalId: string; sourceRevision: string }> = {
  'packet:aaa': { canonicalId: 'cid-a', sourceRevision: 'sha256:s1' },
  'packet:bbb': { canonicalId: 'cid-b', sourceRevision: 'sha256:s2' },
};
const expected: PacketIncidenceExpectedV1 = { resolvePacket: (k) => packets[k] ?? null, workspaceRevision: 'ws1', graphRevision: 'g1' };

describe('PacketIncidenceLineageV1', () => {
  it('checksums are deterministic and independent of evidence order and duplicates', () => {
    const a = buildPacketIncidenceLineageV1(base);
    const b = buildPacketIncidenceLineageV1({ ...base, evidenceRefs: ['edge:1', 'edge:2', 'edge:1'] });
    expect(a.inputChecksum).toBe(b.inputChecksum);
    expect(a.lineageChecksum).toBe(b.lineageChecksum);
    expect(a.lineageChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('a changed revision or producer changes the checksums', () => {
    const a = buildPacketIncidenceLineageV1(base);
    expect(buildPacketIncidenceLineageV1({ ...base, graphRevision: 'g2' }).inputChecksum).not.toBe(a.inputChecksum);
    const p = buildPacketIncidenceLineageV1({ ...base, producerRevision: 'p2' });
    expect(p.inputChecksum).toBe(a.inputChecksum);
    expect(p.lineageChecksum).not.toBe(a.lineageChecksum);
  });

  it('fails closed on a missing field, empty evidence, or a self edge; never defaults a revision', () => {
    expect(() => buildPacketIncidenceLineageV1({ ...base, graphRevision: '' })).toThrow(/graphRevision/);
    expect(() => buildPacketIncidenceLineageV1({ ...base, evidenceRefs: [] })).toThrow(/evidenceRefs/);
    expect(() => buildPacketIncidenceLineageV1({ ...base, neighborPacketKey: base.packetKey })).toThrow(/SELF_EDGE/);
  });

  it('a sealed row at the exact revisions is LINEAGE_PROVEN with all nine proofs', () => {
    const row = buildPacketIncidenceLineageV1(base);
    expect(row.canonicalAuthority).toBe(false);
    const v = verifyPacketIncidenceLineageV1(row, expected);
    expect(v.status).toBe('LINEAGE_PROVEN');
    expect(Object.values(v.proofs).every(Boolean)).toBe(true);
    expect(Object.keys(v.proofs)).toHaveLength(9);
  });

  it('each exactness failure is named and makes the row LINEAGE_UNPROVEN', () => {
    const row = buildPacketIncidenceLineageV1(base);
    expect(verifyPacketIncidenceLineageV1(row, { ...expected, workspaceRevision: 'ws2' }).failed).toEqual(['WORKSPACE_REVISION_EXACT']);
    expect(verifyPacketIncidenceLineageV1(row, { ...expected, graphRevision: 'g2' }).failed).toEqual(['GRAPH_REVISION_EXACT']);
    const staleB = { ...expected, resolvePacket: (k: string) => (k === 'packet:bbb' ? { canonicalId: 'cid-b', sourceRevision: 'sha256:OLD' } : packets[k]) };
    expect(verifyPacketIncidenceLineageV1(row, staleB).failed).toEqual(['SOURCE_REVISION_B_EXACT']);
    const noA = { ...expected, resolvePacket: (k: string) => (k === 'packet:aaa' ? null : packets[k]) };
    expect(verifyPacketIncidenceLineageV1(row, noA).failed).toEqual(expect.arrayContaining(['PACKET_A_RESOLVES', 'SOURCE_REVISION_A_EXACT']));
  });

  it('a tampered row fails both checksum proofs', () => {
    const row = { ...buildPacketIncidenceLineageV1(base), edgeType: 'CALLS' };
    expect(verifyPacketIncidenceLineageV1(row, expected).failed).toEqual(expect.arrayContaining(['INPUT_CHECKSUM_VALID', 'LINEAGE_CHECKSUM_VALID']));
  });

  it('rejects a promoted authority flag', () => {
    expect(() => buildPacketIncidenceLineageV1(base)).not.toThrow();
    const row = buildPacketIncidenceLineageV1(base);
    expect(() => PacketIncidenceLineageV1Schema.parse({ ...row, canonicalAuthority: true })).toThrow();
  });

  it('the consumer returns only proven rows and EMPTY_EXACT_REVISION_INCIDENCE with no stale fallback', () => {
    const good = buildPacketIncidenceLineageV1(base);
    const stale = buildPacketIncidenceLineageV1({ ...base, neighborPacketKey: 'packet:ccc', neighborCanonicalId: 'cid-c', graphRevision: 'g0' });
    const mixed = consumeExactRevisionIncidenceV1('packet:aaa', [good, stale], expected);
    expect(mixed.status).toBe('EXACT_REVISION_INCIDENCE');
    expect(mixed.neighbors).toEqual([good]);
    expect(mixed.rejected[0]).toMatchObject({ neighborPacketKey: 'packet:ccc' });

    const onlyStale = consumeExactRevisionIncidenceV1('packet:aaa', [stale], expected);
    expect(onlyStale.status).toBe('EMPTY_EXACT_REVISION_INCIDENCE');
    expect(onlyStale.neighbors).toEqual([]);
    expect(consumeExactRevisionIncidenceV1('packet:zzz', [good], expected).status).toBe('EMPTY_EXACT_REVISION_INCIDENCE');
  });
});
