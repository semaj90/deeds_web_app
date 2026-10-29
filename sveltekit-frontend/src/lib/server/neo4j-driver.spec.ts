import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  env: {
    NEO4J_URI: 'bolt://neo4j.test:7687',
    NEO4J_USER: 'atlas-user',
    NEO4J_PASSWORD: undefined as string | undefined,
  },
  close: vi.fn(),
  driver: vi.fn(),
  basic: vi.fn((username: string, password: string) => ({ username, password })),
}));

vi.mock('$lib/server/env.server.js', () => ({ ENV: harness.env }));
vi.mock('neo4j-driver', () => ({ default: { driver: harness.driver, auth: { basic: harness.basic } } }));

import { closeNeo4jDriver, getNeo4jDriver } from './neo4j-driver.js';

describe('canonical Neo4j driver configuration', () => {
  beforeEach(async () => {
    await closeNeo4jDriver();
    harness.env.NEO4J_URI = 'bolt://neo4j.test:7687';
    harness.env.NEO4J_USER = 'atlas-user';
    harness.env.NEO4J_PASSWORD = undefined;
    harness.close.mockClear();
    harness.driver.mockReset().mockReturnValue({ close: harness.close });
    harness.basic.mockClear();
  });

  it('fails closed without a configured password', () => {
    expect(() => getNeo4jDriver()).toThrow('NEO4J_PASSWORD_REQUIRED');
    expect(harness.driver).not.toHaveBeenCalled();
  });

  it('uses the shared URI and configured credentials', () => {
    harness.env.NEO4J_PASSWORD = 'configured-secret';

    getNeo4jDriver();

    expect(harness.basic).toHaveBeenCalledWith('atlas-user', 'configured-secret');
    expect(harness.driver).toHaveBeenCalledWith(
      'bolt://neo4j.test:7687',
      { username: 'atlas-user', password: 'configured-secret' },
      expect.objectContaining({ connectionTimeout: 5000 }),
    );
  });

  it('reuses one configured driver instance', () => {
    harness.env.NEO4J_PASSWORD = 'configured-secret';

    const first = getNeo4jDriver();
    const second = getNeo4jDriver();

    expect(second).toBe(first);
    expect(harness.driver).toHaveBeenCalledTimes(1);
  });
});
