// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./embedding-service.js', () => ({
  embedQueryForLane: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8081')),
}));

import { retrieveQdrant } from './retrieve-candidates';

describe('retrieveQdrant query embedding failure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('propagates embedding-service failure so the lane receipt is unavailable, not empty', async () => {
    await expect(retrieveQdrant('any query')).rejects.toThrow('connect ECONNREFUSED 127.0.0.1:8081');
  });
});
