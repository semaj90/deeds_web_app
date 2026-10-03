// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { satisfiesEvidenceEligibilityV1 } from './atlas-coordinate-v1.js';
import { qualifyEvidenceV1, type LineageMembershipV1, type LineagePacketV1 } from './lineage-qualification-v1.js';

const expected = { workspaceRevision: 'ws-1', sourceRevision: 'src-1' };
const packet: LineagePacketV1 = { packetKey: 'packet:1', workspaceRevisionKey: 'ws-1', sourceRevision: 'src-1', sourceRef: 'src/a.ts' };
const member = (over: Partial<LineageMembershipV1> = {}): LineageMembershipV1 => ({
  packetKey: 'packet:1', canonicalChunkId: 'chunk:1', revisionStatus: 'PROVEN', sourceRevision: 'src-1', lineageBindingChecksum: 'lb-1', ...over,
});
const q = (p: LineagePacketV1 | null, m: LineageMembershipV1[] = [], e = expected) => qualifyEvidenceV1({ packet: p, memberships: m, expected: e });

describe('qualifyEvidenceV1', () => {
  it('exact packet + one proven current chunk => CHUNK_REVISION_QUALIFIED', () => {
    const v = q(packet, [member()]);
    expect(v.packetIdentity).toEqual({ status: 'EXACT', packetKey: 'packet:1' });
    expect(v.chunkIdentity).toEqual({ status: 'EXACT', canonicalChunkIds: ['chunk:1'] });
    expect(v.eligibility).toBe('CHUNK_REVISION_QUALIFIED');
    expect(v.derivable).toEqual({ packetDerived: true, chunkDerived: true });
    expect(v.evidenceRefs).toContain('lineage:lb-1');
  });

  it('THE RULE: an exact packet with no proven lineage is packet-qualified and NOT chunk-qualified', () => {
    const v = q(packet, []);
    expect(v.packetIdentity.status).toBe('EXACT');
    expect(v.chunkIdentity.status).toBe('MISSING_LINEAGE');
    expect(v.eligibility).toBe('PACKET_REVISION_QUALIFIED');
    expect(v.derivable).toEqual({ packetDerived: true, chunkDerived: false });
    expect(satisfiesEvidenceEligibilityV1(v.eligibility, 'CHUNK_REVISION_QUALIFIED')).toBe(false);
    expect(satisfiesEvidenceEligibilityV1(v.eligibility, 'PACKET_REVISION_QUALIFIED')).toBe(true);
  });

  it('lineage that is not PROVEN, has no chunk id, or belongs to another packet never qualifies a chunk', () => {
    for (const m of [member({ revisionStatus: 'CANDIDATE' }), member({ revisionStatus: 'STALE' }), member({ canonicalChunkId: null }), member({ canonicalChunkId: '  ' }), member({ packetKey: 'packet:2' })]) {
      const v = q(packet, [m]);
      expect(v.chunkIdentity.status).toBe('MISSING_LINEAGE');
      expect(v.derivable.chunkDerived).toBe(false);
    }
  });

  it('proven lineage at a different source revision => SOURCE_REVISION_MISMATCH, packet still qualified, never nearest-revision', () => {
    const v = q(packet, [member({ sourceRevision: 'src-0' })]);
    expect(v.chunkIdentity).toEqual({ status: 'SOURCE_REVISION_MISMATCH', canonicalChunkIds: [] });
    expect(v.eligibility).toBe('PACKET_REVISION_QUALIFIED');
    expect(q(packet, [member({ sourceRevision: null })]).chunkIdentity.status).toBe('SOURCE_REVISION_MISMATCH');
  });

  it('a packet whose own source revision differs is DEGRADED, even with matching lineage', () => {
    for (const p of [{ ...packet, sourceRevision: 'src-0' }, { ...packet, sourceRevision: null }]) {
      const v = q(p, [member()]);
      expect(v.chunkIdentity.status).toBe('SOURCE_REVISION_MISMATCH');
      expect(v.eligibility).toBe('DEGRADED');
      expect(v.derivable).toEqual({ packetDerived: false, chunkDerived: false });
    }
  });

  it('workspace mismatch (including a missing workspace key) is checked first and is DEGRADED', () => {
    for (const p of [{ ...packet, workspaceRevisionKey: 'ws-0' }, { ...packet, workspaceRevisionKey: null }, { ...packet, workspaceRevisionKey: '' }]) {
      const v = q(p, [member()]);
      expect(v.chunkIdentity.status).toBe('WORKSPACE_REVISION_MISMATCH');
      expect(v.eligibility).toBe('DEGRADED');
    }
    // both wrong: workspace wins
    expect(q({ ...packet, workspaceRevisionKey: 'ws-0', sourceRevision: 'src-0' }, [member()]).chunkIdentity.status).toBe('WORKSPACE_REVISION_MISMATCH');
  });

  it('unknown packet or blank packet_key is INELIGIBLE', () => {
    for (const p of [null, { ...packet, packetKey: '' }]) {
      const v = q(p, [member()]);
      expect(v.packetIdentity.status).toBe('NOT_FOUND');
      expect(v.eligibility).toBe('INELIGIBLE');
      expect(v.derivable).toEqual({ packetDerived: false, chunkDerived: false });
    }
  });

  it('several distinct proven current chunks => AMBIGUOUS (sorted set exposed), packet-qualified only; duplicates collapse', () => {
    const v = q(packet, [member({ canonicalChunkId: 'chunk:b' }), member({ canonicalChunkId: 'chunk:a' })]);
    expect(v.chunkIdentity).toEqual({ status: 'AMBIGUOUS', canonicalChunkIds: ['chunk:a', 'chunk:b'] });
    expect(v.eligibility).toBe('PACKET_REVISION_QUALIFIED');
    expect(q(packet, [member(), member()]).chunkIdentity.status).toBe('EXACT');
  });

  it('is order independent and does not mutate its input', () => {
    const ms = [member({ canonicalChunkId: 'chunk:b' }), member({ canonicalChunkId: 'chunk:a' })];
    const copy = JSON.parse(JSON.stringify(ms));
    expect(q(packet, ms)).toEqual(q(packet, [...ms].reverse()));
    expect(ms).toEqual(copy);
  });

  it('sourceRef is never a join key: identical sourceRef with another packet key contributes nothing', () => {
    const v = q(packet, [member({ packetKey: 'packet:other' })]);
    expect(v.chunkIdentity.status).toBe('MISSING_LINEAGE');
  });
});
