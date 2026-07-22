import { describe, expect, it } from 'vitest';

import { profileRegistryRowsWithDuckDb } from './duckdb-registry.js';

describe('profileRegistryRowsWithDuckDb', () => {
  it('profiles rows without touching canonical stores', async () => {
    const profile = await profileRegistryRowsWithDuckDb([
      {
        packetKey: 'packet:a',
        sourceRef: 'src/a.ts',
        sourceTable: 'feature_domain_facts',
        joinMethod: 'packet_key',
        fallbackUsed: false,
        contentHashStatus: 'CANONICAL_SOURCE_HASH',
        contentHash: 'hash-a',
      },
      {
        packetKey: 'packet:b',
        sourceRef: 'src/b.ts',
        sourceTable: 'feature_lexical_facts',
        joinMethod: 'source_ref',
        fallbackUsed: true,
        contentHashStatus: 'MISSING',
        contentHash: null,
      },
    ]);

    expect(profile.rowCount).toBe(2);
    expect(profile.normalizedRecords).toBe(2);
    expect(profile.fallbackRecords).toBe(1);
    expect(profile.unresolvedRecords).toBe(0);
    expect(profile.missingContentHashRecords).toBe(1);
    expect(profile.schemaValidationFailures).toBe(0);
    expect(profile.countsBySourceTable).toEqual({
      'feature_domain_facts': 1,
      'feature_lexical_facts': 1,
    });
    expect(profile.countsByJoinMethod).toEqual({
      packet_key: 1,
      source_ref: 1,
    });
    expect(profile.countsByContentHashStatus).toEqual({
      CANONICAL_SOURCE_HASH: 1,
      MISSING: 1,
    });
  });
});
