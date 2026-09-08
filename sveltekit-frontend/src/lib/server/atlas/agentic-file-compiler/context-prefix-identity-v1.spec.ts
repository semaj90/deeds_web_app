import { describe, expect, it } from 'vitest';
import {
  buildContextPrefixIdentityV1,
  buildContextPrefixReuseObservationV1,
  verifyContextPrefixIdentityV1,
} from './context-prefix-identity-v1.js';

const base = {
	modelRevision: 'ornith:1.5:rev-1',
	templateRevision: 'chat-template:rev-1',
	toolSchemaRevision: 'tools:rev-1',
	systemPolicyRevision: 'policy:rev-1',
	stableEvidenceRevision: 'evidence:rev-1',
	stablePrefix: 'system policy\n\navailable tools: search, inspect',
};

describe('ContextPrefixIdentityV1', () => {
	it('is deterministic for the same stable prefix inputs', () => {
		const first = buildContextPrefixIdentityV1(base);
		const second = buildContextPrefixIdentityV1({ ...base });
		expect(first).toEqual(second);
		expect(verifyContextPrefixIdentityV1(first)).toEqual(first);
	});

	it.each([
		['modelRevision', { modelRevision: 'ornith:1.5:rev-2' }],
		['templateRevision', { templateRevision: 'chat-template:rev-2' }],
		['toolSchemaRevision', { toolSchemaRevision: 'tools:rev-2' }],
		['systemPolicyRevision', { systemPolicyRevision: 'policy:rev-2' }],
		['stableEvidenceRevision', { stableEvidenceRevision: 'evidence:rev-2' }],
		['stablePrefix', { stablePrefix: 'system policy\n\navailable tools: search, inspect, graph' }],
	] as const)('changes identity when %s changes', (_field, change) => {
		const first = buildContextPrefixIdentityV1(base);
		const second = buildContextPrefixIdentityV1({ ...base, ...change });
		expect(second.checksum).not.toBe(first.checksum);
	});

	it('does not include volatile suffix material in the stable identity', () => {
		const first = buildContextPrefixIdentityV1(base);
		const second = buildContextPrefixIdentityV1({
			...base,
			stablePrefix: base.stablePrefix,
		});
		expect(second).toEqual(first);
		// The input type intentionally has no query/tool-result/candidate fields.
		expect(first).not.toHaveProperty('query');
		expect(first).not.toHaveProperty('toolResult');
		expect(first).not.toHaveProperty('candidateSpan');
	});

  it('rejects tampering and unexpected volatile fields', () => {
		const identity = buildContextPrefixIdentityV1(base);
		expect(() => verifyContextPrefixIdentityV1({ ...identity, modelRevision: 'tampered' })).toThrow(
			'context prefix identity checksum mismatch',
		);
    expect(() => verifyContextPrefixIdentityV1({ ...identity, query: 'volatile' })).toThrow();
  });

  it('computes bounded reuse observations without storing prefix or KV data', () => {
    const identity = buildContextPrefixIdentityV1(base);
    const observation = buildContextPrefixReuseObservationV1({
      identity,
      stablePrefix: base.stablePrefix,
      previousStablePrefix: `${base.stablePrefix}\nold volatile suffix`,
      cachedPrefillTokens: 75,
      newPrefillTokens: 25,
      observedAt: '2026-09-06T20:00:00.000Z',
    });
    expect(observation.cacheStatus).toBe('PARTIAL');
    expect(observation.prefixReuseRatio).toBe(0.75);
    expect(observation.prefixDriftBytes).toBe(0);
    expect(observation).not.toHaveProperty('stablePrefix');
    expect(observation).not.toHaveProperty('kvCache');
  });

  it('rejects reuse counts bound to a different prefix', () => {
    const identity = buildContextPrefixIdentityV1(base);
    expect(() => buildContextPrefixReuseObservationV1({
      identity,
      stablePrefix: `${base.stablePrefix}\nwrong prefix`,
      cachedPrefillTokens: 1,
      newPrefillTokens: 1,
    })).toThrow('context prefix observation does not match identity prefix');
  });
});
