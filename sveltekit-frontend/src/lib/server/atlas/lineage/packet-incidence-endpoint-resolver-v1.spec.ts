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
    const res = await resolveIncidenceEndpointsV1(['packet:aaa', 'packet:aaa', 'packet:old', 'packet:nosr', 'packet:ghost'], fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(summarizeResolutionsV1(res)).toEqual({ RESOLVED: 1, NOT_FOUND: 1, REVISIONLESS: 1, MISSING_SOURCE_REF: 1 });
    expect(res.get('packet:old')).toMatchObject({ canonicalId: null, sourceRevision: null });
  });

  it('does not query when there are no keys', async () => {
    const fetch = vi.fn(async () => rows);
    expect((await resolveIncidenceEndpointsV1(['', '  '], fetch)).size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('feeds the exact-revision consumer: a revisionless neighbour never becomes lineage', async () => {
    const res = await resolveIncidenceEndpointsV1(['packet:aaa', 'packet:bbb', 'packet:old'], async (k) => rows.filter((r) => k.includes(r.packet_key)));
    const expected = expectedFromResolutionsV1(res, 'ws1', 'g1');
    const mk = (neighbor: string, cid: string, rev: string) => buildPacketIncidenceLineageV1({
      packetKey: 'packet:aaa', canonicalId: 'packet:aaa', sourceRevision: 'sha256:s1',
      neighborPacketKey: neighbor, neighborCanonicalId: cid, neighborSourceRevision: rev,
      edgeType: 'IMPORTS', workspaceRevision: 'ws1', graphRevision: 'g1', producerId: 'graphify', producerRevision: 'p1', evidenceRefs: ['e1'],
    });
    const out = consumeExactRevisionIncidenceV1('packet:aaa', [mk('packet:bbb', 'packet:bbb', 'sha256:s2'), mk('packet:old', 'packet:old', 'sha256:x')], expected);
    expect(out.status).toBe('EXACT_REVISION_INCIDENCE');
    expect(out.neighbors.map((n) => n.neighborPacketKey)).toEqual(['packet:bbb']);
    expect(out.rejected[0].failed).toEqual(expect.arrayContaining(['PACKET_B_RESOLVES', 'SOURCE_REVISION_B_EXACT']));
  });
});
