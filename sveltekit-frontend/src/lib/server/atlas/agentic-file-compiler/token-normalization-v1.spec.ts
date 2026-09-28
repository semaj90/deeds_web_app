import { describe, expect, it } from 'vitest';
import {
	buildTokenNormalizationPolicyV1,
	buildTokenNormalizationResultV1,
	normalizeAndSplitTokenV1,
	TOKEN_NORMALIZATION_REVISION_V1,
} from './token-normalization-v1.js';
import { KEYWORD_NORMALIZATION_REVISION_V1 } from './keyword-recognition-v1.js';

describe('normalizeAndSplitTokenV1', () => {
	it('splits camelCase and PascalCase runs into lowercase words', () => {
		expect(normalizeAndSplitTokenV1('fooBarBAZ')).toEqual(['foo', 'bar', 'baz']);
		expect(normalizeAndSplitTokenV1('PDFLoader')).toEqual(['pdf', 'loader']);
	});

	it('segments on dot/path/hyphen/underscore boundaries', () => {
		expect(normalizeAndSplitTokenV1('foo.bar/baz-qux_num')).toEqual(['foo', 'bar', 'baz', 'qux', 'num']);
	});

	it('preserves a scoped package name as a single unsplit token', () => {
		expect(normalizeAndSplitTokenV1('@scope/pkg-name')).toEqual(['@scope/pkg-name']);
	});

	it('is NFC-normalizing and lowercasing', () => {
		expect(normalizeAndSplitTokenV1('CAGRA')).toEqual(['cagra']);
	});

	it('returns an empty array for blank input', () => {
		expect(normalizeAndSplitTokenV1('   ')).toEqual([]);
	});
});

describe('token normalization revision domain separation', () => {
	it('carries a distinct revision id from the exact-token keyword-recognition normalization', () => {
		expect(TOKEN_NORMALIZATION_REVISION_V1).not.toBe(KEYWORD_NORMALIZATION_REVISION_V1);
	});
});

describe('buildTokenNormalizationPolicyV1 / buildTokenNormalizationResultV1', () => {
	it('produces a checksum-sealed, deterministic policy descriptor', () => {
		const policy = buildTokenNormalizationPolicyV1();
		expect(policy.revision).toBe(TOKEN_NORMALIZATION_REVISION_V1);
		expect(policy.preservesScopedPackageNames).toBe(true);
		expect(buildTokenNormalizationPolicyV1().checksum).toBe(policy.checksum);
	});

	it('produces a checksum-sealed result carrying the raw term and its tokens', () => {
		const result = buildTokenNormalizationResultV1('fooBar.bazQux');
		expect(result.rawTerm).toBe('fooBar.bazQux');
		expect(result.tokens).toEqual(['foo', 'bar', 'baz', 'qux']);
		expect(result.policyRevision).toBe(TOKEN_NORMALIZATION_REVISION_V1);
	});
});
