import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  routeQuery: vi.fn(),
  traceRouterDecision: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({ db: { execute: mocks.execute } }));
vi.mock('$lib/server/ace/query-router.js', () => ({ routeQuery: mocks.routeQuery }));
vi.mock('$lib/server/observability/langfuse.js', () => ({ traceRouterDecision: mocks.traceRouterDecision }));
vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: Array.from(strings).join('?'),
    values,
  }),
}));

import { POST } from './+server.js';

describe('POST /api/ace/route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ rows: [{ packet_uuid: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d' }] });
    mocks.traceRouterDecision.mockResolvedValue(undefined);
    mocks.routeQuery.mockResolvedValue({
      packet: {
        packet_id: '0123456789abcdef',
        source_refs: ['src/example.ts'],
        feature_ids: ['feature:example'],
        lane_ids: ['dense'],
        cluster_id: '2:3',
        som_cluster: '2:3',
        qdrant_point_ids: ['point-1'],
        cache_hit: 'none',
      },
      trace: [],
    });
  });

  it('returns and traces the persisted UUID, not the cache packet id', async () => {
    const response = await POST({
      request: new Request('http://test/api/ace/route', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'example query' }),
      }),
      locals: { user: { id: 'test-user' } },
    } as never);
    const body = await response.json();
    const telemetryQuery = mocks.execute.mock.calls[0][0] as { text: string };
    const trace = mocks.traceRouterDecision.mock.calls[0][0] as { packetUuid: string };

    expect(response.status).toBe(200);
    expect(body.packetUuid).toBe('6b2749f6-03d8-42b7-a4e0-93983c62cc1d');
    expect(telemetryQuery.text).toContain('INSERT INTO route_runtime_packets');
    expect(telemetryQuery.text).toContain('packet_uuid');
    expect(trace.packetUuid).toBe(body.packetUuid);
    expect(trace.packetUuid).not.toBe('0123456789abcdef');
  });
});
