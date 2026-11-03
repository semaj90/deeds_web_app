import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createTestCaseRegistryRepository } from './test-case-registry.js';

const nomination = {
  schema: 'atlas.test-case-nomination.v1' as const,
  nomination_id: 'nom-1',
  test_key: 'vitest:src/a.spec.ts::a works',
  identity_status: 'nominated' as const,
  framework: 'vitest',
  source_ref: 'src/a.spec.ts',
  source_revision: 'sha256:' + 'a'.repeat(64),
  suite_path: [],
  title: 'a works',
  full_name: 'a works',
  definition_hash: 'b'.repeat(64),
  extractor_revision: 'x1',
  canonical_authority: false as const,
};

/** Mock pool: resolve query returns the given stable ids; any other statement is recorded. */
function mockPool(ids: string[]) {
  const writes: string[] = [];
  const client = {
    query: async (sql: string) => {
      if (/FROM atlas_test_registry/.test(sql) && /UNION ALL/.test(sql)) {
        return { rows: ids.map((stable_test_id) => ({ stable_test_id, basis: 'exact_test_key' })) };
      }
      writes.push(sql.trim().split(/\s+/)[0]);
      return { rows: [] };
    },
    release: () => {},
  };
  return { pool: { connect: async () => client } as unknown as Pool, writes };
}

describe('promoteNomination ambiguity guard', () => {
  const base = { nomination, registry_revision: 'r1', producer_revision: 'p1', allow_create: true };

  it('rejects an ambiguous resolution before any write', async () => {
    const { pool, writes } = mockPool(['t-1', 't-2']);
    const repo = createTestCaseRegistryRepository(pool);
    await expect(repo.promoteNomination(base)).rejects.toThrow('TEST_PROMOTION_REJECTED_AMBIGUOUS_RESOLUTION:t-1,t-2');
    expect(writes).toEqual([]);
  });

  it('still requires explicit allow_create', async () => {
    const { pool } = mockPool([]);
    const repo = createTestCaseRegistryRepository(pool);
    await expect(repo.promoteNomination({ ...base, allow_create: false })).rejects.toThrow('TEST_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE');
  });
});
