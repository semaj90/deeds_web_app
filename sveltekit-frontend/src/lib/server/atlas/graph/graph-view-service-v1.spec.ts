import { describe, expect, it } from 'vitest';
import { GRAPH_VIEW_MAX_NODES, readGraphViewV1 } from './graph-view-service-v1.js';

const keys = ['degraded', 'ok', 'packet', 'reason', 'rejected', 'view'];

describe('graph view service v1', () => {
  it('rejects unknown params and out-of-range limits with the uniform shape', async () => {
    for (const raw of [{ view: 'NOPE' }, { view: 'DOMAIN', limit: GRAPH_VIEW_MAX_NODES + 1 }, { view: 'DOMAIN', extra: 1 }]) {
      const r = await readGraphViewV1(raw, {});
      expect(r.status).toBe(400);
      expect(Object.keys(r.body).sort()).toEqual(keys);
    }
  });

  it('degrades with 200 and identical keys when a loader is missing or throws', async () => {
    const missing = await readGraphViewV1({ view: 'KNOWLEDGE' }, {});
    expect(missing.status).toBe(200);
    expect(missing.body).toMatchObject({ ok: false, degraded: true, reason: 'LOADER_NOT_CONFIGURED' });
    const boom = await readGraphViewV1({ view: 'DOMAIN' }, { domain: async () => { throw new Error('db down'); } });
    expect(boom.status).toBe(200);
    expect(Object.keys(boom.body).sort()).toEqual(keys);
    expect(boom.body.reason).toBe('db down');
  });

  it('builds a bounded DOMAIN view through the injected loader', async () => {
    const r = await readGraphViewV1({ view: 'DOMAIN', limit: 2 }, {
      domain: async () => ({
        taxonomyRevision: 't1',
        groups: [
          { groupId: 'a', groupLabel: 'A', parentGroupId: null },
          { groupId: 'b', groupLabel: 'B', parentGroupId: 'a' },
          { groupId: 'c', groupLabel: 'C', parentGroupId: 'a' },
        ],
        links: [],
      }),
    });
    expect(r.body.ok).toBe(true);
    expect(r.body.packet!.view).toBe('DOMAIN');
    expect(r.body.packet!.nodes).toHaveLength(2);
    expect(r.body.packet!.truncated).toBe(true);
  });

  it('coerces query-string limits and trims q', async () => {
    const r = await readGraphViewV1({ view: 'KNOWLEDGE', limit: '5', q: '  hi ' }, { knowledge: async () => [] });
    expect(r.body.ok).toBe(true);
    expect(r.body.packet!.queryId).toBe('hi');
    expect(r.body.packet!.maxNodes).toBe(5);
  });
});
