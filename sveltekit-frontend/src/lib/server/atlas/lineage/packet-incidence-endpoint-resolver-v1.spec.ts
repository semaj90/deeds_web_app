// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildPacketIncidenceLineageV1, consumeExactRevisionIncidenceV1 } from './packet-incidence-lineage-v1.js';
import {
  expectedFromResolutionsV1, resolveIncidenceEndpointsV1, summarizeResolutionsV1, type AtlasPacketRowV1,
} from './packet-incidence-endpoint-resolver-v1.js';

const rows: AtlasPacketRowV1[] = [
  { packet_key: 'packet:aaa', source_ref: 'src/a.ts', source_revision: 'sha256:s1' },
  { packet_key: 'packet:bbb', source_ref: 'src/b.ts', source_revision: 'sha256:s2' },
  { packet_key: 'packet:old', source_ref: 'src/old.ts', source_revision: null },
  { packet_key: 'packet:nosr', source_ref: ' ', source_revision: 'sha256:s9' },
];

describe('incidence endpoint resolver', () => {
  it('classifies resolved, missing, revisionless and source_ref-less endpoints and issues one batched read', async () => {
    const fetch = vi.fn(async (keys: string[]) => rows.filter((r) => keys.includes(r.packet_key)));
    const resolveCanonicalId = async (key: string) => key === 'packet:aaa' ? 'packet:00000000-0000-5000-8000-000000000001' : null;
    const res = await resolveIncidenceEndpointsV1(['packet:aaa', 'packet:aaa', 'packet:old', 'packet:nosr', 'packet:ghost'], fetch, resolveCanonicalId);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(summarizeResolutionsV1(res)).toEqual({ RESOLVED: 1, NOT_FOUND: 1, REVISIONLESS: 1, MISSING_SOURCE_REF: 1, IDENTITY_UNRESOLVED: 0 });
    expect(res.get('packet:old')).toMatchObject({ canonicalId: null, sourceRevision: null });
  });

  it('does not query when there are no keys', async () => {
    const fetch = vi.fn(async () => rows);
    expect((await resolveIncidenceEndpointsV1(['', '  '], fetch, async () => null)).size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('feeds the exact-revision consumer: a revisionless neighbour never becomes lineage', async () => {
    const canonicalByKey: Record<string, string> = {
      'packet:aaa': 'packet:00000000-0000-5000-8000-000000000001',
      'packet:bbb': 'packet:00000000-0000-5000-8000-000000000002',
    };
    const res = await resolveIncidenceEndpointsV1(['packet:aaa', 'packet:bbb', 'packet:old'], async (k) => rows.filter((r) => k.includes(r.packet_key)), async (key) => canonicalByKey[key] ?? null);
    const expected = expectedFromResolutionsV1(res, 'ws1', 'g1');
    const mk = (neighbor: string, cid: string, rev: string) => buildPacketIncidenceLineageV1({
      packetKey: 'packet:aaa', canonicalId: canonicalByKey['packet:aaa'], sourceRevision: 'sha256:s1',
      neighborPacketKey: neighbor, neighborCanonicalId: cid, neighborSourceRevision: rev,
      edgeType: 'IMPORTS', workspaceRevision: 'ws1', graphRevision: 'g1', producerId: 'graphify', producerRevision: 'p1', evidenceRefs: ['e1'],
    });
    const out = consumeExactRevisionIncidenceV1('packet:aaa', [
      mk('packet:bbb', canonicalByKey['packet:bbb'], 'sha256:s2'),
      mk('packet:old', 'packet:old', 'sha256:x'),
    ], expected);
    expect(out.status).toBe('EXACT_REVISION_INCIDENCE');
    expect(out.neighbors.map((n) => n.neighborPacketKey)).toEqual(['packet:bbb']);
    expect(out.rejected[0].failed).toEqual(expect.arrayContaining(['PACKET_B_RESOLVES', 'SOURCE_REVISION_B_EXACT']));
  });
});
