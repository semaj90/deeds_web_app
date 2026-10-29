import { describe, expect, it } from 'vitest';
import { resolveSoftRoutingDatabaseUrl } from './soft-routing-orchestrator.js';

describe('resolveSoftRoutingDatabaseUrl', () => {
  it('prefers a non-empty explicit connection string', () => {
    expect(resolveSoftRoutingDatabaseUrl(' postgres://override ', 'postgres://configured')).toBe('postgres://override');
  });

  it('uses the configured database URL when no override is supplied', () => {
    expect(resolveSoftRoutingDatabaseUrl(undefined, ' postgres://configured ')).toBe('postgres://configured');
  });

  it('fails closed when neither connection source exists', () => {
    expect(() => resolveSoftRoutingDatabaseUrl(undefined, '   ')).toThrow('DATABASE_URL_REQUIRED');
  });
});
