import { describe, expect, it } from 'vitest';

import { chunkLegalDocument } from '$lib/server/indexer/legal-chunker.js';

import { summarizeDoclingStructure } from './docling-structure.js';

describe('summarizeDoclingStructure', () => {
	it('derives section ranges that align with DocTags chunk offsets', () => {
		const blocks = [
			{ type: 'heading', text: 'FACTS', page: 1 },
			{ type: 'paragraph', text: 'Officer Hale observed the vehicle parked outside the residence.', page: 1 },
			{ type: 'heading', text: 'ANALYSIS', page: 1 },
			{ type: 'paragraph', text: 'Probable cause existed because the warrant affidavit described the place to be searched.', page: 1 },
		] as const;

		const summary = summarizeDoclingStructure(blocks);
		const chunks = chunkLegalDocument('ignored when doclingBlocks exist', {
			doclingBlocks: [...blocks],
			maxTokens: 512,
			overlap: 128,
		});

		expect(summary.blockTypes).toEqual(['heading', 'paragraph']);
		expect(summary.sections.map((section) => section.section_type)).toEqual(['facts', 'reasoning']);
		expect(chunks).toHaveLength(2);
		expect(chunks[0]?.startOffset).toBeGreaterThanOrEqual(summary.sections[0]?.start_offset ?? 0);
		expect(chunks[0]?.endOffset).toBeLessThanOrEqual(summary.sections[0]?.end_offset ?? 0);
		expect(chunks[1]?.startOffset).toBeGreaterThanOrEqual(summary.sections[1]?.start_offset ?? 0);
		expect(chunks[1]?.endOffset).toBeLessThanOrEqual(summary.sections[1]?.end_offset ?? 0);
	});
});