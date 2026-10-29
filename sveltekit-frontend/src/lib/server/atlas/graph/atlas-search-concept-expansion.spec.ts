import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getNeo4jDriver, sessionRun, sessionClose } = vi.hoisted(() => ({
  getNeo4jDriver: vi.fn(),
  sessionRun: vi.fn(),
  sessionClose: vi.fn(),
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({ getNeo4jDriver }));
vi.mock('neo4j-driver', () => ({ default: { session: { READ: 'READ' } } }));

import { expandPacketKeysByConcept } from './atlas-search-concept-expansion.js';

describe('Atlas search concept expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionClose.mockResolvedValue(undefined);
    getNeo4jDriver.mockReturnValue({ session: () => ({ run: sessionRun, close: sessionClose }) });
  });

  it('uses the canonical driver in read mode and closes the session', async () => {
    sessionRun.mockResolvedValue({ records: [{ get: () => 'packet-neighbor' }] });

    await expect(expandPacketKeysByConcept(['packet-existing'], ['concept-a'], 12))
      .resolves.toEqual(['packet-neighbor']);

    expect(getNeo4jDriver).toHaveBeenCalledOnce();
    expect(sessionRun).toHaveBeenCalledWith(expect.stringContaining('USED_CONCEPT'), {
      conceptIds: ['concept-a'],
      existingKeys: ['packet-existing'],
      limit: 12,
    });
    expect(sessionClose).toHaveBeenCalledOnce();
  });

  it('degrades to no graph additions when canonical credentials are unavailable', async () => {
    getNeo4jDriver.mockImplementation(() => {
      throw new Error('NEO4J_PASSWORD_REQUIRED');
    });

    await expect(expandPacketKeysByConcept([], ['concept-a'], 5)).resolves.toEqual([]);
    expect(sessionRun).not.toHaveBeenCalled();
  });

  it('closes the session and returns no graph additions when the query fails', async () => {
    sessionRun.mockRejectedValue(new Error('query failed'));

    await expect(expandPacketKeysByConcept([], ['concept-a'], 5)).resolves.toEqual([]);
    expect(sessionClose).toHaveBeenCalledOnce();
  });
});
