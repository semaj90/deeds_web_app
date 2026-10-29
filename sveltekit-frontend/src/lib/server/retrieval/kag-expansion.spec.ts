import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env, driver, basic } = vi.hoisted(() => ({
  env: {
    NEO4J_URI: 'bolt://neo4j.test:7687',
    NEO4J_USER: 'atlas-user',
    NEO4J_PASSWORD: undefined as string | undefined,
  },
  driver: vi.fn(() => ({ session: vi.fn(), close: vi.fn() })),
  basic: vi.fn((username: string, password: string) => ({ username, password })),
}));

vi.mock('$lib/server/env.server.js', () => ({ ENV: env }));
vi.mock('neo4j-driver', () => ({ default: { driver, auth: { basic } } }));

import { KAGExpander } from './kag-expansion.js';

describe('KAGExpander Neo4j configuration', () => {
  beforeEach(() => {
    env.NEO4J_URI = 'bolt://neo4j.test:7687';
    env.NEO4J_USER = 'atlas-user';
    env.NEO4J_PASSWORD = undefined;
    driver.mockClear();
    basic.mockClear();
  });

  it('fails closed when no Neo4j password is configured', () => {
    expect(() => new KAGExpander()).toThrow('NEO4J_PASSWORD_REQUIRED');
    expect(driver).not.toHaveBeenCalled();
  });

  it('uses the shared URI and configured credentials', () => {
    env.NEO4J_PASSWORD = 'configured-secret';

    new KAGExpander();

    expect(basic).toHaveBeenCalledWith('atlas-user', 'configured-secret');
    expect(driver).toHaveBeenCalledWith('bolt://neo4j.test:7687', {
      username: 'atlas-user',
      password: 'configured-secret',
    });
  });

  it('retains explicit URI and credential overrides', () => {
    new KAGExpander('bolt://override.test:7687', { username: 'override-user', password: 'override-secret' });

    expect(basic).toHaveBeenCalledWith('override-user', 'override-secret');
    expect(driver).toHaveBeenCalledWith('bolt://override.test:7687', {
      username: 'override-user',
      password: 'override-secret',
    });
  });
});
