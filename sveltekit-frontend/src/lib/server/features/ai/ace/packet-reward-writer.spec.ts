import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
  },
}));

vi.mock('$lib/server/db/client.js', () => ({ db: { execute: mocks.execute } }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => mocks.redis }));
vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: Array.from(strings).join('?'),
    values,
  }),
}));

import { recordReward, rewardBooleanFeature } from './packet-reward-writer.js';

describe('packet reward writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.setex.mockResolvedValue(undefined);
  });

  it('maps nullable booleans to numeric model features', () => {
    expect(rewardBooleanFeature(true)).toBe(1);
    expect(rewardBooleanFeature(false)).toBe(0);
    expect(rewardBooleanFeature(null)).toBeNull();
  });

  it('selects only packet columns present in the live route schema', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{
        packet_uuid: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d',
        query_hash: 'query-hash',
        feature_id: null,
        source_refs: [],
        som_cluster: null,
        qdrant_hits: 0,
        latency_ms: 10,
        response_tokens: null,
        captured_at: new Date(),
      }] })
      .mockResolvedValueOnce({ rows: [] });

    await recordReward({ packetUuid: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d', accepted: true });

    const sourceQuery = mocks.execute.mock.calls[0][0] as { text: string };
    expect(sourceQuery.text).toContain('FROM route_runtime_packets');
    expect(sourceQuery.text).not.toContain('route_packets');
    expect(sourceQuery.text).not.toContain('UNION ALL');
    expect(sourceQuery.text).toContain('feature_ids ->> 0 AS feature_id');
    expect(sourceQuery.text).not.toContain('prompt_hash');
    expect(sourceQuery.text).not.toContain(' reward');
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('stores boolean model indicators as numeric values', async () => {
    mocks.redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('2:3');
    mocks.execute
      .mockResolvedValueOnce({ rows: [{
        packet_uuid: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d',
        query_hash: 'query-hash',
        feature_id: 'feature:example',
        source_refs: [],
        som_cluster: '2:3',
        qdrant_hits: 0,
        latency_ms: 10,
        response_tokens: null,
        captured_at: new Date(),
      }] })
      .mockResolvedValueOnce({ rows: [] });

    await recordReward({ packetUuid: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d', accepted: true });

    const rewardQuery = mocks.execute.mock.calls[1][0] as { values: unknown[] };
    expect(rewardQuery.values[11]).toBe(1);
    expect(rewardQuery.values[12]).toBe(1);
  });

  it('rejects a feedback UUID that has no persisted source packet', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });

    await expect(recordReward({ packetUuid: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d' }))
      .rejects.toThrow('PACKET_REWARD_SOURCE_NOT_FOUND');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});
