import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  env: {
    NEO4J_URI: 'bolt://neo4j.test:7687',
    NEO4J_USER: 'atlas-user',
    NEO4J_PASSWORD: undefined as string | undefined,
  },
  driver: vi.fn(),
  basic: vi.fn((username: string, password: string) => ({ username, password })),
}));

vi.mock('../env.server.js', () => ({ ENV: harness.env }));
vi.mock('neo4j-driver', () => ({ default: { driver: harness.driver, auth: { basic: harness.basic } } }));
vi.mock('../db/client.js', () => ({ db: { query: {}, update: vi.fn() } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

import { Neo4jGDSOrchestrator } from './neo4j-gds-orchestrator.js';

describe('Neo4jGDSOrchestrator connection configuration', () => {
  beforeEach(() => {
    harness.env.NEO4J_URI = 'bolt://neo4j.test:7687';
    harness.env.NEO4J_USER = 'atlas-user';
    harness.env.NEO4J_PASSWORD = undefined;
    harness.driver.mockReset().mockReturnValue({ close: vi.fn() });
    harness.basic.mockClear();
  });

  it('fails closed when neither shared config nor explicit credentials provide a password', () => {
    expect(() => new Neo4jGDSOrchestrator()).toThrow('NEO4J_PASSWORD_REQUIRED');
    expect(harness.driver).not.toHaveBeenCalled();
  });

  it('uses the shared Neo4j configuration', () => {
    harness.env.NEO4J_PASSWORD = 'configured-secret';

    new Neo4jGDSOrchestrator();

    expect(harness.basic).toHaveBeenCalledWith('atlas-user', 'configured-secret');
    expect(harness.driver).toHaveBeenCalledWith('bolt://neo4j.test:7687', {
      username: 'atlas-user',
      password: 'configured-secret',
    });
  });

  it('preserves explicit connection overrides', () => {
    new Neo4jGDSOrchestrator('neo4j+s://override.test:7687', 'override-user', 'override-secret');

    expect(harness.basic).toHaveBeenCalledWith('override-user', 'override-secret');
    expect(harness.driver).toHaveBeenCalledWith('neo4j+s://override.test:7687', {
      username: 'override-user',
      password: 'override-secret',
    });
  });
});
