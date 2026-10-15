import { describe, expect, it } from 'vitest';
import { loadOkfPredicatePolicyV1 } from './okf-predicate-policy-resolver-v1.js';

describe('OKF predicate policy resolver', () => {
  it('loads and schema-validates the registered traversal-only concept predicate', async () => {
    const result = await loadOkfPredicatePolicyV1('uses_concept', 'nary');

    expect(result.resolution.status).toBe('RESOLVED');
    expect(result.resolution.status === 'RESOLVED' && result.resolution.predicate).toBe('uses_concept');
    expect(result.resolution.status === 'RESOLVED' && result.resolution.registryDocumentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.pagerankEligible).toBe(false);
    expect(result.traversalEligible).toBe(true);
  });

  it('rejects unregistered predicates and disallowed degrees', async () => {
    const missing = await loadOkfPredicatePolicyV1('made_up_relation', 'binary');
    const degree = await loadOkfPredicatePolicyV1('authorized_resource_mutation', 'binary');

    expect(missing.resolution).toEqual({ status: 'UNRESOLVED', reasonCode: 'PREDICATE_NOT_REGISTERED' });
    expect(degree.resolution).toEqual({ status: 'UNRESOLVED', reasonCode: 'PREDICATE_DEGREE_NOT_ALLOWED' });
  });
});
