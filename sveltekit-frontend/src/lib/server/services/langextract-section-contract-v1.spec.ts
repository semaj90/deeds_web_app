import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { LANGEXTRACT_NATIVE: 'false', LANGEXTRACT_URL: 'http://section-test.invalid' }
}));

import {
	detectSectionsHeuristic,
	extractSectionsBatch,
	parseLegalSectionResponse,
	utf16RangeToUtf8ByteRange
} from './langextract-service.js';

const source = 'Facts\nA witness saw the event.';
const digest = createHash('sha256').update(source, 'utf8').digest('hex');

function response(overrides: Record<string, unknown> = {}) {
	return {
		schema: 'atlas.legal-section-extraction.v1',
		doc_id: 'doc-1',
		source_sha256: digest,
		offset_unit: 'utf16_code_unit',
		producer_revision: 'langextract-sections-v1:test',
		model_id: 'test-model',
		sections: [{
			section_type: 'facts',
			text: 'A witness saw the event.',
			start_offset: 6,
			end_offset: source.length,
			confidence: 0.8
		}],
		metadata: {},
		...overrides
	};
}

describe('legal section extraction contract v1', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('accepts a source-bound exact section span', () => {
		const parsed = parseLegalSectionResponse(response(), 'doc-1', source);
		expect(parsed?.sections[0]).toMatchObject({
			section_type: 'facts',
			text: 'A witness saw the event.',
			start_offset: 6,
			end_offset: source.length
		});
		expect(parsed?.extraction_source).toBe('section-extractor');
	});

	it('converts valid UTF-16 offsets to UTF-8 bytes and rejects split surrogate pairs', () => {
		expect(utf16RangeToUtf8ByteRange('A😀B', 1, 3)).toEqual({ startByte: 1, endByte: 5 });
		expect(() => utf16RangeToUtf8ByteRange('A😀B', 1, 2)).toThrow('INVALID_UTF16_SOURCE_RANGE');
	});

	it('rejects the current generic sidecar extract shape', () => {
		expect(parseLegalSectionResponse({
			document_id: 'doc-1',
			structure: { chunks: [] },
			entities: [],
			metadata: {}
		}, 'doc-1', source)).toBeNull();
	});

	it('rejects foreign identity, stale source digest, invalid labels, and non-exact spans', () => {
		expect(parseLegalSectionResponse(response(), 'another-doc', source)).toBeNull();
		expect(parseLegalSectionResponse(response({ source_sha256: '0'.repeat(64) }), 'doc-1', source)).toBeNull();
		expect(parseLegalSectionResponse(response({ sections: [{ ...response().sections[0], section_type: 'country_code' }] }), 'doc-1', source)).toBeNull();
		expect(parseLegalSectionResponse(response({ sections: [{ ...response().sections[0], text: 'invented text' }] }), 'doc-1', source)).toBeNull();
	});

	it('uses heading labels only as deterministic heuristic proposals', () => {
		const result = detectSectionsHeuristic('Facts\nOne.\n\nIssues\nTwo.', 'doc-1');
		expect(result.extraction_source).toBe('heading-heuristic');
		expect(result.sections.map((section) => section.section_type)).toEqual(['facts', 'issues']);
		expect(result.sections.every((section) => section.confidence === 0.6)).toBe(true);
	});

	it('preserves document order and caps batch concurrency at five', async () => {
		let active = 0;
		let maxActive = 0;
		const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if (!init?.body) return new Response('{}', { status: 200 });
			const request = JSON.parse(String(init.body)) as { text: string; document_id: string };
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise((resolve) => setTimeout(resolve, request.document_id === 'doc-0' ? 20 : 1));
			active--;
			const hash = createHash('sha256').update(request.text, 'utf8').digest('hex');
			return new Response(JSON.stringify({
				schema: 'atlas.legal-section-extraction.v1',
				doc_id: request.document_id,
				source_sha256: hash,
				offset_unit: 'utf16_code_unit',
				producer_revision: 'test-v1',
				model_id: null,
				sections: [{
					section_type: 'facts',
					text: request.text,
					start_offset: 0,
					end_offset: request.text.length
				}]
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		});
		vi.stubGlobal('fetch', mockFetch);

		const documents = Array.from({ length: 7 }, (_, i) => ({ id: `doc-${i}`, text: `Text ${i}` }));
		const results = await extractSectionsBatch(documents, 99);
		expect(results.map((result) => result.doc_id)).toEqual(documents.map((document) => document.id));
		expect(maxActive).toBeLessThanOrEqual(5);
	});
});
