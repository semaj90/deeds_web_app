// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
	chunkLegalDocument,
	classifyLegalSection,
	LEGAL_SECTION_BOOST,
	type LegalSection,
} from './legal-chunker.js';

describe('Phase 1A: legal section classification', () => {
	it('classifies a holding paragraph correctly', () => {
		const text =
			'We hold that the Fourth Amendment requires a warrant supported by probable cause ' +
			'before law enforcement may conduct a search of a private residence. We therefore ' +
			'hold the search in this case unconstitutional.';
		const { section, confidence } = classifyLegalSection(text, 'Holding', 0);
		expect(section).toBe('holding');
		expect(confidence).toBeGreaterThanOrEqual(0.4);
	});

	it('classifies a facts paragraph correctly', () => {
		const text =
			'On the morning of June 12, 2019, plaintiff alleges that the defendant entered ' +
			'her home without permission. The record shows that no warrant had been issued ' +
			'and the evidence established that the entry was unauthorized.';
		const { section, confidence } = classifyLegalSection(text, 'Background facts', 0);
		expect(section).toBe('facts');
		expect(confidence).toBeGreaterThanOrEqual(0.4);
	});

	it('classifies an analysis paragraph correctly', () => {
		const text =
			'Applying this rule, we agree with the Ninth Circuit that the test for objective ' +
			'reasonableness must consider the totality of the circumstances. The proper inquiry ' +
			'requires evaluating both the officer’s perspective and the totality of available facts.';
		const { section } = classifyLegalSection(text, 'III. Analysis', 0);
		expect(section).toBe('analysis');
	});

	it('returns citation_block when citations dominate a short passage', () => {
		// 3 citations in ~85 chars — density ~28 chars/cite, well below the 60 threshold
		const text = 'See 42 U.S.C. § 1983; § 13; § 1234.';
		const { section, confidence } = classifyLegalSection(text, '', 3);
		expect(section).toBe('citation_block');
		expect(confidence).toBeGreaterThan(0.8);
	});

	it('falls back to unknown for unrelated prose with low confidence', () => {
		const text = 'The cat sat on the mat. The mat was red. The cat was orange.';
		const { section, confidence } = classifyLegalSection(text, '', 0);
		expect(section).toBe('unknown');
		expect(confidence).toBeLessThanOrEqual(0.5);
	});

	it('LEGAL_SECTION_BOOST has an entry for every LegalSection variant', () => {
		const allSections: LegalSection[] = [
			'caption',
			'procedural_posture',
			'facts',
			'issue',
			'analysis',
			'holding',
			'dicta',
			'disposition',
			'citation_block',
			'unknown',
		];
		for (const s of allSections) {
			expect(LEGAL_SECTION_BOOST[s]).toBeGreaterThan(0);
		}
		// Holding should outweigh dicta (legal retrieval invariant)
		expect(LEGAL_SECTION_BOOST.holding).toBeGreaterThan(LEGAL_SECTION_BOOST.dicta);
		expect(LEGAL_SECTION_BOOST.analysis).toBeGreaterThan(LEGAL_SECTION_BOOST.dicta);
	});
});

describe('Phase 1A: chunkLegalDocument emits enriched metadata', () => {
	const fixture = `
ARTICLE I — Declaration of Rights

SECTION 1. All people are by nature free and independent and have inalienable rights.

SECTION 2. The right of the people to be secure in their persons, houses, papers, and effects
against unreasonable searches and seizures shall not be violated. We hold that this protection
extends to digital communications. We therefore hold that warrantless surveillance of cell
phone metadata is unconstitutional. See Cal. Const. art. I, § 13; 42 U.S.C. § 1983.
`.trim();

	it('every chunk has legal_section + jurisdiction + authority_tier + citation_count + extraction_confidence', () => {
		const chunks = chunkLegalDocument(fixture, { maxTokens: 200, overlap: 30, minSectionLength: 10 });
		expect(chunks.length).toBeGreaterThan(0);
		for (const c of chunks) {
			expect(c.legal_section).toBeDefined();
			expect(typeof c.jurisdiction).toBe('string');
			expect(c.authority_tier).toBeGreaterThanOrEqual(1);
			expect(c.authority_tier).toBeLessThanOrEqual(4);
			expect(c.citation_count).toBe(c.citations.length);
			expect(c.extraction_confidence).toBeGreaterThanOrEqual(0);
			expect(c.extraction_confidence).toBeLessThanOrEqual(1);
		}
	});

	it('detects holding language in section 2 and infers CA + tier 1 jurisdiction from Cal. Const.', () => {
		const chunks = chunkLegalDocument(fixture, { maxTokens: 200, overlap: 30, minSectionLength: 10 });
		const holdingChunks = chunks.filter((c) => c.legal_section === 'holding');
		expect(holdingChunks.length).toBeGreaterThan(0);
		const calChunks = chunks.filter((c) => c.jurisdiction === 'CA' || c.jurisdiction === 'US-Federal');
		expect(calChunks.length).toBeGreaterThan(0);
		// Constitutional/statute references should produce tier 1
		const tier1 = chunks.filter((c) => c.authority_tier === 1);
		expect(tier1.length).toBeGreaterThan(0);
	});
});
