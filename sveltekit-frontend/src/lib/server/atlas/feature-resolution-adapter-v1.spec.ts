import { describe, expect, it } from 'vitest';
import { FeatureResolutionV1Schema } from './contracts/feature-resolution-v1.js';
import {
  resolveBatchFeatureCandidatesV1,
  resolveFeatureCandidateV1,
  resolveFeatureRegistryReadOnlyTransactionV1,
  resolveFeatureRegistryV1,
} from './feature-resolution-adapter-v1.js';

const candidate = {
  featureId: 'feature:contract-review',
  featureLabel: 'Contract review',
  sourceRef: 'src/brief.pdf',
  sourceRevision: 'sha256:abc123',
  method: 'normalized_exact' as const,
};

const registryColumns = [
  'id', 'feature_key', 'title', 'description', 'status', 'summary', 'source_refs',
  'chunk_ids', 'tags', 'code_refs', 'test_refs', 'retry_queries', 'cluster_id',
  'trust_tier', 'last_verified_at',
];

describe('FeatureResolutionAdapterV1', () => {
  it('keeps an exact source-bound registry candidate proposal-only', () => {
    expect(resolveFeatureCandidateV1({
      sourceRef: 'src/brief.pdf', registryStatus: 'PRESENT', candidates: [candidate],
    })).toMatchObject({ state: 'PROPOSED', proposedFeatureId: candidate.featureId, canonicalAuthority: false });
  });

  it('does not propose a candidate when the source reference differs', () => {
    expect(resolveFeatureCandidateV1({
      sourceRef: 'src/brief.pdf', registryStatus: 'PRESENT',
      candidates: [{ ...candidate, sourceRef: 'src/other.pdf' }],
    })).toMatchObject({ state: 'UNRESOLVED', reason: 'SOURCE_REF_MISMATCH', canonicalAuthority: false });
  });

  it('abstains on ambiguous candidates for the same source', () => {
    expect(resolveFeatureCandidateV1({
      sourceRef: 'src/brief.pdf', registryStatus: 'PRESENT',
      candidates: [candidate, { ...candidate, featureId: 'feature:contract-analysis' }],
    })).toMatchObject({ state: 'UNRESOLVED', reason: 'AMBIGUOUS_MATCH' });
  });

  it('distinguishes an absent registry from an unavailable registry', () => {
    expect(resolveFeatureCandidateV1({ sourceRef: 'src/brief.pdf', registryStatus: 'ABSENT', candidates: [] }))
      .toMatchObject({ state: 'REGISTRY_ABSENT', reason: 'NO_CANONICAL_REGISTRY' });
    expect(resolveFeatureCandidateV1({ sourceRef: 'src/brief.pdf', registryStatus: 'UNAVAILABLE', candidates: [] }))
      .toMatchObject({ state: 'UNRESOLVED', reason: 'REGISTRY_UNAVAILABLE' });
  });

  it('rejects malformed and oversized lookup payloads without claiming a match', () => {
    expect(resolveFeatureCandidateV1({ sourceRef: '', registryStatus: 'PRESENT', candidates: [] }))
      .toMatchObject({ state: 'UNRESOLVED', reason: 'INVALID_LOOKUP' });
    expect(resolveFeatureCandidateV1({ sourceRef: 'src/brief.pdf', registryStatus: 'PRESENT', candidates: Array(65).fill(candidate) }))
      .toMatchObject({ state: 'UNRESOLVED', reason: 'INVALID_LOOKUP' });
  });

  it('does not permit adapter inputs or outputs to declare canonical authority', () => {
    const result = resolveFeatureCandidateV1({
      sourceRef: 'src/brief.pdf', registryStatus: 'PRESENT', candidates: [candidate], state: 'CANONICAL',
      registryRevision: 'attacker-controlled', bindingReceiptId: 'fake',
    });
    expect(result).toMatchObject({ state: 'UNRESOLVED', reason: 'INVALID_LOOKUP', canonicalAuthority: false });
    expect(result.state).not.toBe('CANONICAL');
    expect(FeatureResolutionV1Schema.safeParse({
      state: 'CANONICAL', featureId: candidate.featureId, featureLabel: candidate.featureLabel,
      registryRevision: 'registry-v1', sourceRef: candidate.sourceRef, bindingReceiptId: 'receipt-1',
    }).success).toBe(false);
  });

  it('batch resolves independently and preserves order', () => {
    const results = resolveBatchFeatureCandidatesV1([
      { sourceRef: 'src/brief.pdf', registryStatus: 'PRESENT', candidates: [candidate] },
      { sourceRef: 'src/other.pdf', registryStatus: 'PRESENT', candidates: [] },
    ]);
    expect(results.map(({ state }) => state)).toEqual(['PROPOSED', 'UNRESOLVED']);
  });

  it('checks the physical catalog and returns REGISTRY_ABSENT without querying feature rows', async () => {
    const queries: string[] = [];
    const result = await resolveFeatureRegistryV1({ featureKey: candidate.featureId, sourceRef: candidate.sourceRef }, async (text) => {
      queries.push(text);
      return { rows: [{ registry_table: null }] };
    });
    expect(result).toMatchObject({ state: 'REGISTRY_ABSENT', canonicalAuthority: false });
    expect(queries).toHaveLength(1);
  });

  it('runs registry inspection in a read-only transaction and rolls it back', async () => {
    const statements: string[] = [];
    const result = await resolveFeatureRegistryReadOnlyTransactionV1(
      { featureKey: candidate.featureId, sourceRef: candidate.sourceRef },
      {
        async query(text) {
          statements.push(text);
          if (text.startsWith('SELECT current_database')) {
            return { rows: [{ database_name: 'legal_ai_db', server_version: '18.4' }] };
          }
          if (text.includes('to_regclass')) return { rows: [{ registry_table: null }] };
          return { rows: [] };
        },
      },
    );

    expect(result).toMatchObject({
      databaseName: 'legal_ai_db',
      serverVersion: '18.4',
      resolution: { state: 'REGISTRY_ABSENT', canonicalAuthority: false },
    });
    expect(statements[0]).toBe('BEGIN READ ONLY');
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements.some((statement) => /\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(statement))).toBe(false);
  });

  it('rolls back and reports unavailable if read-only scope inspection fails', async () => {
    const statements: string[] = [];
    const result = await resolveFeatureRegistryReadOnlyTransactionV1(
      { featureKey: candidate.featureId, sourceRef: candidate.sourceRef },
      {
        async query(text) {
          statements.push(text);
          if (text.startsWith('SELECT current_database')) throw new Error('catalog offline');
          return { rows: [] };
        },
      },
    );

    expect(result.resolution).toMatchObject({ state: 'UNRESOLVED', reason: 'REGISTRY_UNAVAILABLE' });
    expect(statements).toEqual([
      'BEGIN READ ONLY',
      "SET LOCAL statement_timeout = '3000ms'",
      'SELECT current_database() AS database_name,\n              current_setting(\'server_version\') AS server_version',
      'ROLLBACK',
    ]);
  });

  it('does not open a transaction for malformed database lookup input', async () => {
    const statements: string[] = [];
    const result = await resolveFeatureRegistryReadOnlyTransactionV1(
      { featureKey: '', sourceRef: candidate.sourceRef },
      { async query(text) { statements.push(text); return { rows: [] }; } },
    );
    expect(result.resolution).toMatchObject({ state: 'UNRESOLVED', reason: 'INVALID_LOOKUP' });
    expect(statements).toEqual([]);
  });

  it('reads a matching registry row and remains proposal-only', async () => {
    let queryIndex = 0;
    const result = await resolveFeatureRegistryV1({ featureKey: candidate.featureId, sourceRef: candidate.sourceRef }, async () => {
      queryIndex += 1;
      if (queryIndex === 1) return { rows: [{ registry_table: 'feature_registry' }] };
      if (queryIndex === 2) return { rows: registryColumns.map((column_name) => ({ column_name })) };
      return { rows: [{ feature_key: candidate.featureId, title: candidate.featureLabel, source_refs: [candidate.sourceRef] }] };
    });
    expect(result).toMatchObject({ state: 'PROPOSED', proposedFeatureId: candidate.featureId, sourceRevision: null, canonicalAuthority: false });
    expect(result.state).not.toBe('CANONICAL');
  });

  it('blocks missing columns, source mismatches, and database errors distinctly', async () => {
    let queryIndex = 0;
    const incompatible = await resolveFeatureRegistryV1({ featureKey: candidate.featureId, sourceRef: candidate.sourceRef }, async () => {
      queryIndex += 1;
      return queryIndex === 1 ? { rows: [{ registry_table: 'feature_registry' }] } : { rows: [{ column_name: 'feature_key' }] };
    });
    expect(incompatible).toMatchObject({ state: 'UNRESOLVED', reason: 'REGISTRY_UNAVAILABLE' });

    queryIndex = 0;
    const mismatch = await resolveFeatureRegistryV1({ featureKey: candidate.featureId, sourceRef: candidate.sourceRef }, async () => {
      queryIndex += 1;
      if (queryIndex === 1) return { rows: [{ registry_table: 'feature_registry' }] };
      if (queryIndex === 2) return { rows: registryColumns.map((column_name) => ({ column_name })) };
      return { rows: [{ feature_key: candidate.featureId, title: candidate.featureLabel, source_refs: ['src/different.pdf'] }] };
    });
    expect(mismatch).toMatchObject({ state: 'UNRESOLVED', reason: 'SOURCE_REF_MISMATCH' });

    const unavailable = await resolveFeatureRegistryV1({ featureKey: candidate.featureId, sourceRef: candidate.sourceRef }, async () => {
      throw new Error('catalog unavailable');
    });
    expect(unavailable).toMatchObject({ state: 'UNRESOLVED', reason: 'REGISTRY_UNAVAILABLE' });
  });
});
