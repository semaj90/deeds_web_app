import { describe, expect, it } from 'vitest';
import {
	assertParameterBindingV1,
	buildParameterBindingSetV1,
	buildParameterBindingV1,
	isIdentityRevisionParameterName,
} from './parameter-binding-v1.js';

describe('buildParameterBindingV1', () => {
	it('accepts EXACT bindings without derivation refs', () => {
		const binding = buildParameterBindingV1({ parameterName: 'topK', mode: 'EXACT', value: '20' });
		expect(binding.mode).toBe('EXACT');
		expect(binding.derivedFromRefs).toEqual([]);
	});

	it('accepts DEFAULTED for non-identity tuning parameters', () => {
		const binding = buildParameterBindingV1({ parameterName: 'timeoutMs', mode: 'DEFAULTED', value: '5000' });
		expect(binding.mode).toBe('DEFAULTED');
	});

	it('rejects DEFAULTED for every identity/revision parameter name', () => {
		for (const name of ['canonicalId', 'packetKey', 'sourceRevision', 'workspaceRevision', 'symbolVersionId', 'candidateSnapshotRevision', 'ordinalMapChecksum', 'representationRevision']) {
			expect(() => buildParameterBindingV1({ parameterName: name, mode: 'DEFAULTED', value: 'x' })).toThrow(/DEFAULTED_IDENTITY_REVISION_PARAMETER/);
		}
	});

	it('requires derivation refs for DERIVED and forbids them for EXACT', () => {
		expect(() => buildParameterBindingV1({ parameterName: 'topK', mode: 'DERIVED', value: '10' })).toThrow(/DERIVED_PARAMETER_REQUIRES_DERIVATION_REFS/);
		expect(() => buildParameterBindingV1({ parameterName: 'topK', mode: 'EXACT', value: '10', derivedFromRefs: ['plan:1'] })).toThrow(/EXACT_PARAMETER_MUST_NOT_CARRY_DERIVATION_REFS/);
		const derived = buildParameterBindingV1({ parameterName: 'topK', mode: 'DERIVED', value: '10', derivedFromRefs: ['plan:1', 'plan:1'] });
		expect(derived.derivedFromRefs).toEqual(['plan:1']);
	});

	it('round-trips through assertParameterBindingV1 and detects tampering', () => {
		const binding = buildParameterBindingV1({ parameterName: 'sourceRevision', mode: 'EXACT', value: 'sha256:abc' });
		expect(assertParameterBindingV1(binding)).toEqual(binding);
		expect(() => assertParameterBindingV1({ ...binding, value: 'tampered' })).toThrow(/CHECKSUM_MISMATCH/);
	});

	it('isIdentityRevisionParameterName is exhaustive against the declared list', () => {
		expect(isIdentityRevisionParameterName('packetKey')).toBe(true);
		expect(isIdentityRevisionParameterName('topK')).toBe(false);
	});
});

describe('buildParameterBindingSetV1', () => {
	it('sorts by parameterName and rejects duplicates', () => {
		const a = buildParameterBindingV1({ parameterName: 'topK', mode: 'EXACT', value: '20' });
		const b = buildParameterBindingV1({ parameterName: 'canonicalId', mode: 'EXACT', value: 'atlas:packet:1' });
		const set = buildParameterBindingSetV1([a, b]);
		expect(set.bindings.map((binding) => binding.parameterName)).toEqual(['canonicalId', 'topK']);
		expect(() => buildParameterBindingSetV1([a, a])).toThrow(/DUPLICATE_PARAMETER_BINDING/);
	});
});
