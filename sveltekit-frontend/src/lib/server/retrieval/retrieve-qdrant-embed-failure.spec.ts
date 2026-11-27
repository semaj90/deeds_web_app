// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./embedding-service.js', () => ({
  embedQueryForLane: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8081')),
}));

import { retrieveQdrant } from './retrieve-candidates';

describe('retrieveQdrant query embedding failure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns no candidates and reports why', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(retrieveQdrant('any query')).resolves.toEqual([]);

    expect(warn).toHaveBeenCalledWith(
      '[retrieveQdrant] query embedding failed; dense lane returns no candidates: connect ECONNREFUSED 127.0.0.1:8081',
    );
  });
});
