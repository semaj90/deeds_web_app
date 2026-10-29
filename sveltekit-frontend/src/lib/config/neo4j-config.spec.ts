import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/env', () => ({
  env: {
    DOCKER_ENV: 'false',
    NEO4J_URI: 'bolt://neo4j.test:7687',
    NEO4J_USER: 'atlas-user',
  },
}));

import { CONFIG, getNeo4jConfig } from './env.server.js';

describe('Neo4j environment configuration', () => {
  it('does not synthesize a password when none is configured', () => {
    expect(getNeo4jConfig()).toEqual({
      uri: 'bolt://neo4j.test:7687',
      user: 'atlas-user',
      password: undefined,
    });
    expect(CONFIG.NEO4J_PASSWORD).toBeUndefined();
  });
});
