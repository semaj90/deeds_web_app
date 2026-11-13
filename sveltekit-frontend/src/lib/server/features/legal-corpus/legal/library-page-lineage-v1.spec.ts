import { describe, expect, it } from 'vitest';
import { buildLibraryPageSpansV1, parseLibraryOcrPageSpansV1, resolveLibraryChunkPageSpanV1, verifyLibraryChunkSourceSpanV1 } from './library-page-lineage-v1.js';

describe('library source page lineage v1', () => {
	it('maps concatenated PDF pages and chunks to exact 1-based page bounds', () => {
		const pageTexts = [
			{ pageNumber: 1, text: 'first page text' },
			{ pageNumber: 2, text: 'second page text' },
		];
		const pages = buildLibraryPageSpansV1(pageTexts, 'first page text\n\nsecond page text');
		expect(pages).toEqual([
			{ pageNumber: 1, charStart: 0, charEnd: 15 },
			{ pageNumber: 2, charStart: 17, charEnd: 33 },
		]);
		expect(resolveLibraryChunkPageSpanV1(2, 10, pages)).toEqual({ pageStart: 1, pageEnd: 1 });
		expect(resolveLibraryChunkPageSpanV1(10, 22, pages)).toEqual({ pageStart: 1, pageEnd: 2 });
		expect(resolveLibraryChunkPageSpanV1(35, 38, pages)).toBeNull();
	});

	it('locates page text in the exact combined source even when separators differ', () => {
		const pages = buildLibraryPageSpansV1([
			{ pageNumber: 1, text: 'alpha' },
			{ pageNumber: 2, text: 'beta' },
		], 'alpha\nbeta');
		expect(pages).toEqual([
			{ pageNumber: 1, charStart: 0, charEnd: 5 },
			{ pageNumber: 2, charStart: 6, charEnd: 10 },
		]);
		expect(() => buildLibraryPageSpansV1([{ pageNumber: 1, text: 'absent' }], 'different')).toThrow('LIBRARY_PAGE_TEXT_NOT_IN_SOURCE');
	});

	it('maps only explicit OCR page markers and preserves their exact text offsets', () => {
		const text = '--- Page 1 ---\nalpha\n\n--- Page 2 ---\nbeta';
		const pages = parseLibraryOcrPageSpansV1(text);
		expect(pages).toHaveLength(2);
		expect(text.slice(pages[0]!.charStart, pages[0]!.charEnd)).toBe('alpha\n\n');
		expect(text.slice(pages[1]!.charStart, pages[1]!.charEnd)).toBe('beta');
		expect(resolveLibraryChunkPageSpanV1(pages[1]!.charStart, pages[1]!.charEnd, pages)).toEqual({ pageStart: 2, pageEnd: 2 });
		expect(parseLibraryOcrPageSpansV1('OCR text without page markers')).toEqual([]);
	});

	it('rejects duplicate, descending, and unsafe OCR page numbers', () => {
		expect(() => parseLibraryOcrPageSpansV1('--- Page 1 ---\na\n--- Page 1 ---\nb')).toThrow('LIBRARY_OCR_PAGE_ORDER_INVALID');
		expect(() => parseLibraryOcrPageSpansV1('--- Page 2 ---\na\n--- Page 1 ---\nb')).toThrow('LIBRARY_OCR_PAGE_ORDER_INVALID');
		expect(() => parseLibraryOcrPageSpansV1('--- Page 9007199254740992 ---\na')).toThrow('LIBRARY_OCR_PAGE_ORDER_INVALID');
	});

	it('verifies a chunk range against its original source and rejects drift', () => {
		const source = 'prefix\r\nAlpha   beta\r\n gamma suffix';
		const start = source.indexOf('Alpha');
		const end = source.indexOf(' suffix');
		expect(() => verifyLibraryChunkSourceSpanV1(source, 'Alpha   beta\r\n gamma', start, end)).not.toThrow();
		expect(() => verifyLibraryChunkSourceSpanV1(source, 'Alpha beta wrong', start, end)).toThrow('LIBRARY_CHUNK_SOURCE_SPAN_MISMATCH');
		expect(() => verifyLibraryChunkSourceSpanV1(source, 'Alpha beta gamma', start, end)).toThrow('LIBRARY_CHUNK_SOURCE_SPAN_MISMATCH');
		expect(() => verifyLibraryChunkSourceSpanV1(source, 'Alpha', start, source.length + 1)).toThrow('LIBRARY_CHUNK_SOURCE_SPAN_INVALID');
	});

	it('rejects invalid page order and invalid chunk bounds', () => {
		expect(() => buildLibraryPageSpansV1([
			{ pageNumber: 2, text: 'two' },
			{ pageNumber: 1, text: 'one' },
		], 'two one')).toThrow('LIBRARY_PAGE_ORDER_INVALID');
		expect(() => resolveLibraryChunkPageSpanV1(2, 2, [])).toThrow('LIBRARY_CHUNK_SPAN_INVALID');
	});
});
