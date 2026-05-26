// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedisGet = vi.fn();
const mockRedis = {
  get: mockRedisGet,
  setex: vi.fn(async () => 'OK'),
};

const mockDbInsert = vi.fn(() => ({
  values: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: mockDbInsert,
  },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  clusterCards: {
    centroidId: 'centroid_id',
    collection: 'collection',
    authorityScore: 'authority_score',
  },
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: vi.fn(() => mockRedis),
}));

describe('/api/clusters/cards route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the Redis hot-path card when centroid_id is cached', async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify({
      centroidId: '11111111-1111-1111-1111-111111111111',
      collection: 'codebase_chunks',
      authorityScore: 0.9,
    }));

    const { GET } = await import('../../../routes/api/clusters/cards/+server.js');
    const response = await GET({
      url: new URL('http://localhost/api/clusters/cards?centroid_id=11111111-1111-1111-1111-111111111111'),
    } as never);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('redis');
    expect(body.card.centroidId).toBe('11111111-1111-1111-1111-111111111111');
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('returns 401 on POST when no user or service key is present', async () => {
    const { POST } = await import('../../../routes/api/clusters/cards/+server.js');
    const response = await POST({
      request: new Request('http://localhost/api/clusters/cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          centroidId: '11111111-1111-1111-1111-111111111111',
          collection: 'codebase_chunks',
          topChunkIds: [],
          topFilePaths: [],
          topTags: [],
          authorityScore: 0.5,
          memberCount: 1,
        }),
      }),
      locals: {},
    } as never);

    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});
