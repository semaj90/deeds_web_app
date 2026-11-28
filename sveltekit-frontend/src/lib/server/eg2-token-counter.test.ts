import { describe, expect, it } from 'vitest';
import { countEg2Tokens, countEg2DocumentTokens } from './eg2-token-counter';

describe('countEg2Tokens', () => {
	it('matches the Python tokenizers reference counts', () => {
		expect(countEg2Tokens('title: a.ts | text: function handleRequest0(req) { return validate(req.body) }')).toBe(26);
		expect(countEg2Tokens('title: none | text: Section 1983 applies. § 1234 — café 漢字')).toBe(26);
	});

	it('applies the canonical document recipe', () => {
		expect(countEg2DocumentTokens('a.ts', 'function f() { return 1 }')).toBe(
			countEg2Tokens('title: a.ts | text: function f() { return 1 }')
		);
	});
});
