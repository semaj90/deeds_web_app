// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	EVIDENCE_TEXT_LIMIT,
	boundEvidenceText,
	buildHashes,
	buildSummaryPrompt,
	canonicalJson,
	extractCitations,
	stripReasoning,
	unsupportedCitations,
	unsupportedSections,
	type InvestigationManifest
} from './investigation-manifest-v1.js';

const CASE = '2007b040-8b33-4613-8fb8-72f90c8c5317';
const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';
const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const F2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function manifest(overrides: Partial<InvestigationManifest> = {}): InvestigationManifest {
	return {
		caseId: CASE,
		facets: [
			{ id: F2, kind: 'WHY', claim: 'Motive was money', status: 'HYPOTHESIS', confidence: 0.6, links: [{ evidenceId: E2, relevance: 1 }] },
			{ id: F1, kind: 'WHO', claim: 'Clerk had access', status: 'SUPPORTED', confidence: null, links: [{ evidenceId: E1, relevance: 0.8 }, { evidenceId: E2, relevance: 0.5 }] }
		],
		evidence: [
			{ id: E2, title: 'Ledger', text: 'Ledger entries' },
			{ id: E1, title: 'Badge log', text: 'Badge swipe at 22:04' }
		],
		...overrides
	};
}

describe('canonicalJson', () => {
	it('sorts object keys recursively so equal objects serialize identically', () => {
		expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}');
	});
});

describe('buildHashes', () => {
	it('is independent of collection order', () => {
		const reordered = manifest({
			facets: [...manifest().facets].reverse(),
			evidence: [...manifest().evidence].reverse()
		});
		expect(buildHashes(reordered)).toEqual(buildHashes(manifest()));
	});

	it('changes when a facet claim changes, and the facet snapshot hash tracks facets only', () => {
		const base = buildHashes(manifest());
		const edited = manifest();
		edited.facets[0] = { ...edited.facets[0], claim: 'Motive was revenge' };
		const changed = buildHashes(edited);
		expect(changed.inputManifestSha256).not.toBe(base.inputManifestSha256);
		expect(changed.facetSnapshotSha256).not.toBe(base.facetSnapshotSha256);

		const evidenceOnly = manifest({ evidence: [{ id: E1, title: 'Badge log', text: 'different text' }, { id: E2, title: 'Ledger', text: 'Ledger entries' }] });
		const evidenceHashes = buildHashes(evidenceOnly);
		expect(evidenceHashes.facetSnapshotSha256).toBe(base.facetSnapshotSha256);
		expect(evidenceHashes.inputManifestSha256).not.toBe(base.inputManifestSha256);
	});

	it('emits 64 lowercase hex characters', () => {
		const { inputManifestSha256, facetSnapshotSha256 } = buildHashes(manifest());
		expect(inputManifestSha256).toMatch(/^[0-9a-f]{64}$/);
		expect(facetSnapshotSha256).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('citations', () => {
	it('extracts unique lowercase evidence ids in first-seen order', () => {
		const text = `Clerk [evidence:${E2.toUpperCase()}] then [evidence:${E1}] again [evidence:${E2}]`;
		expect(extractCitations(text)).toEqual([E2, E1]);
	});

	it('ignores malformed citation tokens', () => {
		expect(extractCitations('[evidence:not-a-uuid] [evidence:] [ev:' + E1 + ']')).toEqual([]);
	});

	it('flags every cited id that is not admitted evidence', () => {
		const stranger = '99999999-9999-4999-8999-999999999999';
		expect(unsupportedCitations([E1, stranger], [E1, E2])).toEqual([stranger]);
		expect(unsupportedCitations([E1], [E1])).toEqual([]);
	});
});

describe('stripReasoning', () => {
	it('removes reasoning blocks and keeps the answer', () => {
		expect(stripReasoning('<think>private steps</think>\nAnswer text')).toBe('Answer text');
		expect(stripReasoning('<thinking>x</thinking>Done')).toBe('Done');
	});
});

describe('boundEvidenceText', () => {
	it('prefers AI summary, then summary, then extracted text, and collapses whitespace', () => {
		expect(boundEvidenceText({ aiSummary: '  a \n b ', summary: 'S', extractedText: 'E' })).toBe('a b');
		expect(boundEvidenceText({ aiSummary: null, summary: 'S', extractedText: 'E' })).toBe('S');
		expect(boundEvidenceText({ aiSummary: '', summary: null, extractedText: 'E' })).toBe('E');
		expect(boundEvidenceText({})).toBe('');
	});

	it('bounds very long text', () => {
		expect(boundEvidenceText({ summary: 'x'.repeat(EVIDENCE_TEXT_LIMIT + 500) })).toHaveLength(EVIDENCE_TEXT_LIMIT);
	});
});

describe('unsupportedSections', () => {
	it('flags a WHY section that states a conclusion when no WHY facet exists', () => {
		const md = '## WHO\nClerk had access.\n\n## WHY\nThe motive was money.\n\n## HOW\nNo facet recorded.';
		expect(unsupportedSections(md, ['WHO', 'WHAT'])).toEqual(['WHY']);
	});

	it('accepts "No facet recorded." for a missing category', () => {
		const md = '## WHO\nClerk had access.\n## WHY\nNo facet recorded.\n## HOW\nNo facet recorded.';
		expect(unsupportedSections(md, ['WHO'])).toEqual([]);
	});

	it('does not flag a category that has a facet', () => {
		const md = '## WHY\nThe motive was money.';
		expect(unsupportedSections(md, ['WHY'])).toEqual([]);
	});

	it('catches a conclusion written on the heading line itself', () => {
		expect(unsupportedSections('WHY: the motive was money.', [])).toEqual(['WHY']);
	});
});

describe('buildSummaryPrompt', () => {
	it('instructs the model not to write a section for a kind with no facet', () => {
		const prompt = buildSummaryPrompt(manifest());
		expect(prompt).toContain('Write a WHO, WHAT, WHY or HOW section only if at least one facet of that kind is listed');
		expect(prompt).toContain('write that section as "No facet recorded."');
	});

	it('lists every facet and every evidence id in canonical order', () => {
		const prompt = buildSummaryPrompt(manifest());
		expect(prompt).toContain('WHO (SUPPORTED): Clerk had access');
		expect(prompt).toContain('WHY (HYPOTHESIS, confidence 0.6): Motive was money');
		expect(prompt).toContain(`[evidence:${E1}] Badge log`);
		expect(prompt).toContain(`[evidence:${E2}] Ledger`);
		expect(prompt.indexOf(`[evidence:${E1}]`)).toBeLessThan(prompt.indexOf(`[evidence:${E2}]`));
	});
});
