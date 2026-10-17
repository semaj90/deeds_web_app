import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
import { recordPacketCentricTelemetry } from './packet-centric-telemetry.js';
import { ResourceOperationObservationSchema } from './gpu-telemetry.js';

beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));

describe('existing eval writer store observations', () => {
  it.each(['redis', 'qdrant', 'neo4j'] as const)('retains independent %s timing', async (service) => {
    query.mockRejectedValueOnce(Object.assign(new Error('missing relation'), { code: '42P01' }));
    const resource = ResourceOperationObservationSchema.parse({ schema: 'atlas.store-operation.v1', service,
      operation: service === 'redis' ? 'get' : service === 'qdrant' ? 'points_query' : 'read_query',
      observed_at: '2026-10-16T08:00:00.000Z', wall_ms: 2.5, duration_scope: 'CLIENT_REQUEST_WALL_TIME',
      outcome: 'RETURNED', kernel_name: null, kernel_ms: null, canonicalAuthority: false });
    await recordPacketCentricTelemetry({ resource_observation: resource, packet_context: { packet_id: 'packet:fixture' } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO atlas_retrieval_eval_times');
    expect(JSON.parse(query.mock.calls[1][1][21]).resource_observation).toEqual(resource);
  });
});
