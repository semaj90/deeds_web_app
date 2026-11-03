import { describe, expect, it } from 'vitest';
import { sha256Stable } from './contracts.js';
import {
	HELPER_REGISTRY_SCHEMA_V1,
	HELPER_REGISTRY_V1,
	HelperRegistryV1Schema,
	assertHelperRegistryV1,
	resolveAstLanguageBindingV1,
} from './helper-registry-v1.js';

describe('HelperRegistryV1 (AFC-HELPER-01)', () => {
	it('has the v1 schema, 12 entries and a verifiable checksum', () => {
		expect(HELPER_REGISTRY_V1.schema).toBe(HELPER_REGISTRY_SCHEMA_V1);
		expect(HELPER_REGISTRY_V1.entries).toHaveLength(12);
		expect(assertHelperRegistryV1(HELPER_REGISTRY_V1)).toEqual(HELPER_REGISTRY_V1);
	});

	it('rejects a tampered body with HELPER_REGISTRY_CHECKSUM_MISMATCH', () => {
		const tampered = { ...HELPER_REGISTRY_V1, revision: 'tampered' };
		expect(() => assertHelperRegistryV1(tampered)).toThrow('HELPER_REGISTRY_CHECKSUM_MISMATCH');
	});

	it('keeps entries sorted by helperId with unique ids', () => {
		const ids = HELPER_REGISTRY_V1.entries.map((e) => e.helperId);
		expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('is read-only and static: no runtime availability fields on any entry', () => {
		for (const entry of HELPER_REGISTRY_V1.entries) {
			expect(entry.mutationClass).toBe('READ_ONLY');
			expect(entry).not.toHaveProperty('available');
			expect(entry).not.toHaveProperty('observedAt');
			const { helperRevision, ...spec } = entry;
			expect(helperRevision).toBe(sha256Stable(spec));
		}
	});

	it('rejects unknown keys (strict schema)', () => {
		const withExtra = { ...HELPER_REGISTRY_V1, extra: true };
		expect(HelperRegistryV1Schema.safeParse(withExtra).success).toBe(false);
	});

	it('resolves AST language bindings and fails closed on unknown extensions', () => {
		expect(resolveAstLanguageBindingV1('a/b.ts')?.sidecarLanguage).toBe('typescript');
		expect(resolveAstLanguageBindingV1('x.svelte')?.astGrepLanguage).toBeNull();
		expect(resolveAstLanguageBindingV1('x.unknown')).toBeNull();
		expect(resolveAstLanguageBindingV1('Makefile')).toBeNull();
	});
});
