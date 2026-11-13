import { describe, expect, it } from 'vitest';
import { SourceOffsetTableV1 } from './utf16-utf8-span-bridge-v1.js';

describe('SourceOffsetTableV1', () => {
	const text = [
		'SECTION 1. Scope — 42 U.S.C. § 1983; café.',
		'   The claimant alleges deprivation of rights under color of state law.   ',
		'Exhibit 🏛️-A: Recorded deed — signed.',
	].join('\n');

	it('round-trips exact UTF-16 and UTF-8 slices with 1-based line and column positions', () => {
		const table = new SourceOffsetTableV1(text);
		const utf8 = Buffer.from(text, 'utf8');
		const rawStart = text.indexOf('   The claimant');
		const rawEnd = text.indexOf('\nExhibit');
		const span = table.sliceTrimmedDualSpan(rawStart, rawEnd);

		expect(table.utf8TotalBytes).toBe(utf8.byteLength);
		expect(span.text).toBe('The claimant alleges deprivation of rights under color of state law.');
		expect(text.slice(span.utf16Start, span.utf16End)).toBe(span.text);
		expect(utf8.subarray(span.utf8ByteStart, span.utf8ByteEnd).toString('utf8')).toBe(span.text);
		expect(span).toMatchObject({ lineStart: 2, lineEnd: 2, colStartUtf16: 4 });
		expect(table.utf8ByteToUtf16Index(span.utf8ByteStart)).toBe(span.utf16Start);
		expect(table.utf8ByteToUtf16Index(span.utf8ByteEnd)).toBe(span.utf16End);
	});

	it('maps astral characters, legal symbols, and multi-line spans without offset drift', () => {
		const table = new SourceOffsetTableV1(text);
		const utf8 = Buffer.from(text, 'utf8');
		const start = text.indexOf('Exhibit');
		const span = table.resolveDualSpan(start, text.length);
		expect(span.lineStart).toBe(3);
		expect(span.lineEnd).toBe(3);
		expect(text.slice(span.utf16Start, span.utf16End)).toBe(span.text);
		expect(utf8.subarray(span.utf8ByteStart, span.utf8ByteEnd).toString('utf8')).toBe(span.text);

		for (let utf16 = 0; utf16 <= text.length; utf16++) {
			const previous = text.charCodeAt(utf16 - 1);
			const current = text.charCodeAt(utf16);
			if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) continue;
			const byte = table.utf16IndexToUtf8Byte(utf16);
			expect(table.utf8ByteToUtf16Index(byte)).toBe(utf16);
		}
	});

	it('rejects offsets that split UTF-16 surrogate pairs or UTF-8 code points', () => {
		const table = new SourceOffsetTableV1('A🏛️§—Z');
		const emojiStart = 'A'.length;
		expect(() => table.resolveDualSpan(emojiStart + 1, emojiStart + 2)).toThrow('UNALIGNED_UTF16_OFFSET');
		const emojiByteStart = table.utf16IndexToUtf8Byte(emojiStart);
		expect(() => table.utf8ByteToUtf16Index(emojiByteStart + 1)).toThrow('UNALIGNED_UTF8_BYTE_OFFSET');
		expect(() => table.utf16IndexToUtf8Byte(table.canonicalText.length + 1)).toThrow('UTF16_OFFSET_OUT_OF_BOUNDS');
	});

	it('rejects malformed unpaired surrogate input so byte and string views cannot disagree', () => {
		expect(() => new SourceOffsetTableV1(`bad${String.fromCharCode(0xd800)}text`)).toThrow('UNPAIRED_HIGH_SURROGATE');
		expect(() => new SourceOffsetTableV1(`bad${String.fromCharCode(0xdc00)}text`)).toThrow('UNPAIRED_LOW_SURROGATE');
	});

	it('keeps indexed lookups exact when an astral character straddles a checkpoint', () => {
		const boundaryText = `${'a'.repeat(1023)}🏛️§—\n${'z'.repeat(2600)}`;
		const table = new SourceOffsetTableV1(boundaryText);
		const utf8 = Buffer.from(boundaryText, 'utf8');

		for (const utf16 of [1022, 1023, 1025, 1026, 2047, 2048, 2049, boundaryText.length]) {
			const previous = boundaryText.charCodeAt(utf16 - 1);
			const current = boundaryText.charCodeAt(utf16);
			if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) continue;
			const byte = table.utf16IndexToUtf8Byte(utf16);
			expect(table.utf8ByteToUtf16Index(byte)).toBe(utf16);
		}

		const span = table.resolveDualSpan(1025, 1300);
		expect(utf8.subarray(span.utf8ByteStart, span.utf8ByteEnd).toString('utf8')).toBe(span.text);
		expect(span.lineStart).toBe(1);
		expect(span.lineEnd).toBe(2);
	});
});
