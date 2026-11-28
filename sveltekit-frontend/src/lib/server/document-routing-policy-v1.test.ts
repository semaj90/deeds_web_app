import { describe, expect, it } from 'vitest';
import {
	analyzeTextHeuristics,
	bucketFor,
	planDocumentRoute,
	type RoutingFacts,
	type TextHeuristics
} from './document-routing-policy-v1';

const clean: TextHeuristics = {
	characterCount: 800,
	byteLength: 800,
	controlCharCount: 0,
	replacementCharCount: 0,
	duplicateLineCount: 0,
	nonEmptyLineCount: 10,
	legalSectionCount: 0,
	legalCitationCount: 0,
	caseIdentifierCount: 0,
	markdownHeadingCount: 0
};

function facts(over: Partial<RoutingFacts> = {}): RoutingFacts {
	return {
		mimeType: 'text/plain',
		fileName: 'notes.txt',
		tokenCount: 200,
		heuristics: clean,
		...over
	};
}

describe('analyzeTextHeuristics', () => {
	it('counts code points, not UTF-16 units', () => {
		const h = analyzeTextHeuristics('a😀b');
		expect(h.characterCount).toBe(3);
		expect(h.byteLength).toBe(Buffer.byteLength('a😀b', 'utf8'));
	});

	it('detects control characters and replacement characters', () => {
		const h = analyzeTextHeuristics('ok\u0001bad�end');
		expect(h.controlCharCount).toBe(1);
		expect(h.replacementCharCount).toBe(1);
	});

	it('counts duplicate non-empty lines after trimming', () => {
		const h = analyzeTextHeuristics('Footer\n  Footer  \nBody\n\nBody');
		expect(h.duplicateLineCount).toBe(2);
		expect(h.nonEmptyLineCount).toBe(4);
	});

	it('detects legal, citation, case and markdown hints', () => {
		const h = analyzeTextHeuristics(
			'# Title\nSection 12 applies.\nSee 42 U.S.C. § 1983.\nCase No: 24-CV-001\n'
		);
		expect(h.markdownHeadingCount).toBe(1);
		expect(h.legalSectionCount).toBe(1);
		expect(h.legalCitationCount).toBe(1);
		expect(h.caseIdentifierCount).toBe(1);
	});

	it('returns zeros for empty text', () => {
		const h = analyzeTextHeuristics('');
		expect(h.characterCount).toBe(0);
		expect(h.nonEmptyLineCount).toBe(0);
	});
});

describe('bucketFor', () => {
	it.each([
		[1, 512],
		[512, 512],
		[513, 1024],
		[1024, 1024],
		[1025, 2048],
		[4097, 8192],
		[8192, 8192],
		[9000, 8192]
	])('%i tokens -> bucket %i', (tokens, bucket) => {
		expect(bucketFor(tokens)).toBe(bucket);
	});
});

describe('planDocumentRoute', () => {
	it('routes a document that fits the serving cap to a single pass', () => {
		const p = planDocumentRoute(facts({ tokenCount: 512 }));
		expect(p.primaryRoute).toBe('SINGLE_PASS');
		expect(p.requiresChunking).toBe(false);
		expect(p.contextBucket).toBe(512);
	});

	it('chunks one token over the serving cap with the next bucket', () => {
		const p = planDocumentRoute(facts({ tokenCount: 513 }));
		expect(p.primaryRoute).toBe('STRUCTURAL_CHUNKS');
		expect(p.requiresChunking).toBe(true);
		expect(p.contextBucket).toBe(1024);
	});

	it('honours a raised serving cap without changing the bucket rule', () => {
		const p = planDocumentRoute(facts({ tokenCount: 1000, servingCapTokens: 1024 }));
		expect(p.primaryRoute).toBe('SINGLE_PASS');
		expect(p.contextBucket).toBe(1024);
	});

	it('routes over 8192 tokens to a hierarchical DAG and keeps the largest bucket', () => {
		const p = planDocumentRoute(facts({ tokenCount: 8193 }));
		expect(p.primaryRoute).toBe('HIERARCHICAL_DAG');
		expect(p.contextBucket).toBe(8192);
		expect(p.requiresChunking).toBe(true);
	});

	it('never admits truncation', () => {
		for (const tokens of [1, 512, 513, 9000]) {
			expect(planDocumentRoute(facts({ tokenCount: tokens })).truncationAllowed).toBe(false);
		}
	});

	it('does not quarantine a short document just for being short', () => {
		const p = planDocumentRoute(facts({ tokenCount: 3, heuristics: { ...clean, characterCount: 12 } }));
		expect(p.primaryRoute).toBe('SINGLE_PASS');
	});

	it('refuses exact admission when the token count is unmeasured', () => {
		const p = planDocumentRoute(facts({ tokenCount: null }));
		expect(p.primaryRoute).toBe('REVIEW_REQUIRED');
		expect(p.contextBucket).toBeNull();
		expect(p.reasonCodes).toContain('TOKEN_COUNT_UNMEASURED');
		expect(p.tokenCountSource).toBe('unmeasured');
	});

	it('routes image bytes to multimodal, not text embedding', () => {
		const p = planDocumentRoute(facts({ mimeType: 'image/png', fileName: 'scan.png', tokenCount: null }));
		expect(p.primaryRoute).toBe('MULTIMODAL');
		expect(p.auxiliaryStages).toContain('vision_ocr');
	});

	it('routes audio and video bytes to multimodal transcription', () => {
		expect(planDocumentRoute(facts({ mimeType: 'audio/mpeg', fileName: 'call.mp3' })).primaryRoute).toBe(
			'MULTIMODAL'
		);
		expect(planDocumentRoute(facts({ fileName: 'deposition.mp4' })).auxiliaryStages).toContain('transcribe');
	});

	it('routes a PDF with a near-empty text layer to OCR', () => {
		const p = planDocumentRoute(
			facts({ mimeType: 'application/pdf', fileName: 'scan.pdf', pdfTextCharacters: 12 })
		);
		expect(p.primaryRoute).toBe('OCR');
		expect(p.auxiliaryStages).toContain('ocr');
	});

	it('keeps a PDF with a healthy text layer on the text path', () => {
		const p = planDocumentRoute(
			facts({ mimeType: 'application/pdf', fileName: 'brief.pdf', pdfTextCharacters: 4000, tokenCount: 300 })
		);
		expect(p.primaryRoute).toBe('SINGLE_PASS');
	});

	it('sends replacement-character noise to review rather than embedding it', () => {
		const noisy = { ...clean, characterCount: 1000, replacementCharCount: 50 };
		const p = planDocumentRoute(facts({ heuristics: noisy }));
		expect(p.primaryRoute).toBe('REVIEW_REQUIRED');
		expect(p.reasonCodes).toContain('EXTRACTION_REPLACEMENT_CHARS_OVER_LIMIT');
	});

	it('sends control-character noise to review', () => {
		const noisy = { ...clean, characterCount: 1000, controlCharCount: 5 };
		expect(planDocumentRoute(facts({ heuristics: noisy })).reasonCodes).toContain(
			'EXTRACTION_CONTROL_CHARS_OVER_LIMIT'
		);
	});

	it('sends empty text to review', () => {
		const empty = { ...clean, characterCount: 0 };
		const p = planDocumentRoute(facts({ heuristics: empty, tokenCount: 0 }));
		expect(p.primaryRoute).toBe('REVIEW_REQUIRED');
		expect(p.reasonCodes).toContain('EMPTY_TEXT');
	});

	it('adds structural and classification auxiliaries from the hints', () => {
		const p = planDocumentRoute(
			facts({ heuristics: { ...clean, legalSectionCount: 2, legalCitationCount: 1, caseIdentifierCount: 1 } })
		);
		expect(p.auxiliaryStages).toEqual(
			expect.arrayContaining(['structure_parse', 'citation_extract', 'case_identifier_extract', 'nlp_classify'])
		);
	});

	it('rejects an invalid serving cap', () => {
		expect(() => planDocumentRoute(facts({ servingCapTokens: 0 }))).toThrow('ROUTING_SERVING_CAP_INVALID');
	});

	it('is deterministic for identical facts', () => {
		const a = planDocumentRoute(facts({ tokenCount: 700 }));
		const b = planDocumentRoute(facts({ tokenCount: 700 }));
		expect(a).toEqual(b);
	});
});

describe('execution lane', () => {
	it('defaults to CPU when no GPU limit is configured', () => {
		expect(planDocumentRoute(facts({ tokenCount: 300 })).executionLane).toBe('CPU');
	});

	it('allows the TRT-RTX candidate lane only within the measured limit', () => {
		expect(planDocumentRoute(facts({ tokenCount: 2048, gpuMaxTokens: 2048 })).executionLane).toBe('TRT_RTX_CANDIDATE');
		expect(planDocumentRoute(facts({ tokenCount: 2049, gpuMaxTokens: 2048 })).executionLane).toBe('CPU');
		expect(planDocumentRoute(facts({ tokenCount: 4096, gpuMaxTokens: 2048 })).executionLane).toBe('CPU');
	});

	it('stays on CPU when the token count is unmeasured', () => {
		expect(planDocumentRoute(facts({ tokenCount: null, gpuMaxTokens: 2048 })).executionLane).toBe('CPU');
	});
});
