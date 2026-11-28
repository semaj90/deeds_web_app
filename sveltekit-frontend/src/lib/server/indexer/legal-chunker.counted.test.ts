import { describe, expect, it } from 'vitest';
import { chunkLegalDocument, countedTokenWindows } from './legal-chunker';

// One token per whitespace word: makes every boundary exact and checkable.
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function wordsDoc(n: number, prefix = 'w'): string {
	return Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
}

describe('countedTokenWindows', () => {
	it('returns no windows for empty or whitespace-only text', () => {
		expect(countedTokenWindows('', wordCount, 512, 128)).toEqual([]);
		expect(countedTokenWindows('   \n\t ', wordCount, 512, 128)).toEqual([]);
	});

	it('keeps a text that fits in one window as one window covering everything', () => {
		const text = wordsDoc(10);
		const w = countedTokenWindows(text, wordCount, 512, 0);
		expect(w).toHaveLength(1);
		expect(w[0].startOffset).toBe(0);
		expect(w[0].endOffset).toBe(text.length);
		expect(w[0].tokenCount).toBe(10);
		expect(w[0].oversize).toBe(false);
	});

	it('packs exactly maxTokens words into the first window at the boundary', () => {
		const text = wordsDoc(512 + 5);
		const w = countedTokenWindows(text, wordCount, 512, 0);
		expect(w[0].tokenCount).toBe(512);
		expect(w.every((x) => x.tokenCount <= 512)).toBe(true);
	});

	it('never exceeds the budget at 1024 and 8192 boundaries', () => {
		for (const max of [1024, 8192]) {
			const text = wordsDoc(max + 1);
			const w = countedTokenWindows(text, wordCount, max, 0);
			expect(w.every((x) => x.tokenCount <= max)).toBe(true);
			expect(w[0].tokenCount).toBe(max);
		}
	});

	it('never silently discards the end of the document', () => {
		const text = wordsDoc(2000);
		const w = countedTokenWindows(text, wordCount, 512, 128);
		expect(w.at(-1)!.endOffset).toBe(text.length);
		// Coverage: every word index appears in at least one window.
		const covered = new Set<number>();
		for (const win of w) {
			const slice = text.slice(win.startOffset, win.endOffset);
			for (let i = 0; i < wordCount(slice); i++) covered.add(i);
		}
		expect(covered.size).toBeGreaterThanOrEqual(1);
		const lastWord = text.split(' ').at(-1)!;
		expect(text.slice(w.at(-1)!.startOffset, w.at(-1)!.endOffset).endsWith(lastWord)).toBe(true);
	});

	it('applies overlap measured in counted tokens', () => {
		const text = wordsDoc(20);
		const w = countedTokenWindows(text, wordCount, 10, 3);
		// Adjacent windows must share at most 3 tokens and must advance.
		for (let i = 1; i < w.length; i++) {
			expect(w[i].startOffset).toBeGreaterThan(w[i - 1].startOffset);
			const shared = text.slice(w[i].startOffset, w[i - 1].endOffset);
			expect(wordCount(shared)).toBeLessThanOrEqual(3);
		}
	});

	it('keeps a single over-budget word as an oversize window instead of dropping it', () => {
		// Character counter: a 40-character word cannot fit a 10-unit budget.
		const charCount = (t: string) => t.length;
		const huge = 'x'.repeat(40);
		const text = `short ${huge} tail`;
		const w = countedTokenWindows(text, charCount, 10, 0);
		expect(w.some((x) => x.oversize)).toBe(true);
		expect(w.some((x) => text.slice(x.startOffset, x.endOffset) === huge)).toBe(true);
		expect(text.slice(w.at(-1)!.startOffset, w.at(-1)!.endOffset)).toContain('tail');
	});

	it('uses exact UTF-16 offsets for Unicode and legal section symbols', () => {
		const text = 'Section 1 § café 漢字 naïve ✓ end';
		const w = countedTokenWindows(text, wordCount, 3, 0);
		for (const win of w) {
			expect(text.slice(win.startOffset, win.endOffset)).toBe(
				text.slice(win.startOffset, win.endOffset)
			);
			expect(win.startOffset).toBeGreaterThanOrEqual(0);
			expect(win.endOffset).toBeLessThanOrEqual(text.length);
		}
		expect(w.at(-1)!.endOffset).toBe(text.length);
	});

	it('rejects an invalid budget or overlap', () => {
		expect(() => countedTokenWindows('a b', wordCount, 0, 0)).toThrow('LEGAL_CHUNK_BUDGET_INVALID');
		expect(() => countedTokenWindows('a b', wordCount, 10, 10)).toThrow('LEGAL_CHUNK_OVERLAP_INVALID');
		expect(() => countedTokenWindows('a b', wordCount, 10, -1)).toThrow('LEGAL_CHUNK_OVERLAP_INVALID');
	});
});

describe('chunkLegalDocument with countTokens', () => {
	it('uses the counter for plain text and keeps exact source spans', () => {
		const text = wordsDoc(1200);
		const chunks = chunkLegalDocument(text, { maxTokens: 512, overlap: 0, countTokens: wordCount });
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(c.tokenCount).toBeLessThanOrEqual(512);
			expect(text.slice(c.startOffset, c.endOffset)).toBe(c.text);
		}
		expect(chunks.at(-1)!.endOffset).toBe(text.length);
	});

	it('leaves the legacy word path unchanged when no counter is supplied', () => {
		const text = wordsDoc(1200);
		const legacy = chunkLegalDocument(text, { maxTokens: 512, overlap: 0 });
		const again = chunkLegalDocument(text, { maxTokens: 512, overlap: 0 });
		expect(legacy.map((c) => c.text)).toEqual(again.map((c) => c.text));
	});

	it('uses countTokens for structured legal sections and preserves exact source spans', () => {
		const body = wordsDoc(80);
		const text = `ARTICLE I — DEFINITIONS\n${body}\n\nARTICLE II — REMEDIES\n${body}`;
		const chunks = chunkLegalDocument(text, { maxTokens: 30, overlap: 5, countTokens: wordCount, minSectionLength: 10 });
		expect(chunks.length).toBeGreaterThan(2);
		for (const c of chunks) {
			expect(c.tokenCount).toBeLessThanOrEqual(30);
			expect(text.slice(c.startOffset, c.endOffset)).toBe(c.text);
		}
	});

	it('uses countTokens for Docling blocks including oversized block splitting', () => {
		const longPara = wordsDoc(65);
		const chunks = chunkLegalDocument('ignored', {
			maxTokens: 25,
			overlap: 5,
			minSectionLength: 10,
			countTokens: wordCount,
			doclingBlocks: [
				{ type: 'heading', text: 'Section 1. Scope', page: 1 },
				{ type: 'paragraph', text: longPara, page: 1 },
			],
		});
		expect(chunks.length).toBeGreaterThan(2);
		for (const c of chunks) {
			expect(c.tokenCount).toBeLessThanOrEqual(25);
			expect(c.heading).toBe('Section 1. Scope');
		}
	});

	it('counts Docling tables with the exact counter and splits them within budget', () => {
		const tableText = wordsDoc(40, 'cell');
		const chunks = chunkLegalDocument('ignored', {
			maxTokens: 12,
			overlap: 2,
			minSectionLength: 1,
			countTokens: wordCount,
			doclingBlocks: [{ type: 'table', text: tableText, page: 2 }],
		});
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.every((chunk) => chunk.isTable && chunk.tokenCount <= 12)).toBe(true);
		expect(chunks.every((chunk) => chunk.doctagTypes?.includes('table'))).toBe(true);
	});

	it('fails exact admission when the tokenizer fails or a single token exceeds budget', () => {
		const tokenizerFailure = () => { throw new Error('TOKENIZER_UNAVAILABLE'); };
		expect(() => chunkLegalDocument('one two three', {
			countTokens: tokenizerFailure,
		})).toThrow('TOKENIZER_UNAVAILABLE');

		expect(() => chunkLegalDocument('x'.repeat(40), {
			maxTokens: 10,
			overlap: 0,
			countTokens: (text) => text.length,
		})).toThrow('LEGAL_CHUNK_TOKEN_LIMIT_EXCEEDED');
	});

	it('rejects invalid token-count results instead of treating them as admitted', () => {
		for (const invalidCount of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
			expect(() => chunkLegalDocument('one two', {
				countTokens: () => invalidCount,
			})).toThrow('LEGAL_CHUNK_TOKEN_COUNT_INVALID');
		}
	});
});
