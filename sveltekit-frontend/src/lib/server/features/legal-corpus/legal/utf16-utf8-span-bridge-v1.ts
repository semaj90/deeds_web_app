export interface DualEncodedTextSpanV1 {
	/** Half-open JavaScript string offsets, measured in UTF-16 code units. */
	readonly utf16Start: number;
	readonly utf16End: number;
	/** Half-open offsets into UTF-8 encoding of canonicalText (not source PDF bytes). */
	readonly utf8ByteStart: number;
	readonly utf8ByteEnd: number;
	readonly lineStart: number;
	readonly lineEnd: number;
	readonly colStartUtf16: number;
	/** 1-based inclusive column of the last included UTF-16 code unit. */
	readonly colEndUtf16: number;
	readonly text: string;
}

/**
 * Maps canonical extracted text offsets without a per-character map. Checkpoints
 * every 1024 UTF-16 units bound local scans and use under 1% of the string's
 * UTF-16 storage for the four offset/line arrays. Byte offsets refer to UTF-8(canonicalText), never the
 * compressed/original PDF or image object.
 */
export class SourceOffsetTableV1 {
	readonly canonicalText: string;
	readonly utf8TotalBytes: number;
	private readonly blockStartsUtf16: Uint32Array;
	private readonly blockStartsUtf8: Uint32Array;
	private readonly blockStartsLine: Uint32Array;
	private readonly blockStartsLineUtf16: Uint32Array;
	private readonly blockSize = 1024;

	constructor(canonicalText: string) {
		this.canonicalText = canonicalText;
		if (canonicalText.length > 0xffffffff) throw new RangeError('CANONICAL_TEXT_TOO_LARGE_FOR_V1_OFFSETS');
		const checkpointCapacity = Math.ceil(canonicalText.length / this.blockSize) + 1;
		const startsUtf16 = new Uint32Array(checkpointCapacity);
		const startsUtf8 = new Uint32Array(checkpointCapacity);
		const startsLine = new Uint32Array(checkpointCapacity);
		const startsLineUtf16 = new Uint32Array(checkpointCapacity);
		let checkpointCount = 0;
		let utf16 = 0;
		let utf8 = 0;
		let line = 1;
		let lineStartUtf16 = 0;
		const addCheckpoint = () => {
			if (checkpointCount >= checkpointCapacity) throw new Error('OFFSET_CHECKPOINT_CAPACITY_EXCEEDED');
			startsUtf16[checkpointCount] = utf16;
			startsUtf8[checkpointCount] = utf8;
			startsLine[checkpointCount] = line;
			startsLineUtf16[checkpointCount] = lineStartUtf16;
			checkpointCount += 1;
		};
		let nextBlock = 0;

		while (utf16 < canonicalText.length) {
			while (nextBlock <= utf16) {
				addCheckpoint();
				nextBlock += this.blockSize;
			}

			const first = canonicalText.charCodeAt(utf16);
			let units = 1;
			let bytes: number;
			if (first >= 0xd800 && first <= 0xdbff) {
				const second = canonicalText.charCodeAt(utf16 + 1);
				if (second < 0xdc00 || second > 0xdfff) throw new Error('UNPAIRED_HIGH_SURROGATE');
				units = 2;
				bytes = 4;
			} else if (first >= 0xdc00 && first <= 0xdfff) {
				throw new Error('UNPAIRED_LOW_SURROGATE');
			} else if (first < 0x80) bytes = 1;
			else if (first < 0x800) bytes = 2;
			else bytes = 3;

			if (first === 0x0a) {
				line += 1;
				lineStartUtf16 = utf16 + 1;
			}
			utf16 += units;
			utf8 += bytes;
		}

		while (nextBlock <= utf16) {
			addCheckpoint();
			nextBlock += this.blockSize;
		}
		if (checkpointCount === 0) addCheckpoint();
		this.blockStartsUtf16 = startsUtf16.subarray(0, checkpointCount);
		this.blockStartsUtf8 = startsUtf8.subarray(0, checkpointCount);
		this.blockStartsLine = startsLine.subarray(0, checkpointCount);
		this.blockStartsLineUtf16 = startsLineUtf16.subarray(0, checkpointCount);
		this.utf8TotalBytes = utf8;
	}

	resolveLineAndCol(utf16Offset: number): { line: number; colUtf16: number } {
		this.assertUtf16Boundary(utf16Offset);
		const blockIndex = Math.min(Math.floor(utf16Offset / this.blockSize), this.blockStartsUtf16.length - 1);
		let line = this.blockStartsLine[blockIndex] ?? 1;
		let lineStart = this.blockStartsLineUtf16[blockIndex] ?? 0;
		for (let index = this.blockStartsUtf16[blockIndex] ?? 0; index < utf16Offset; index++) {
			if (this.canonicalText.charCodeAt(index) === 0x0a) {
				line += 1;
				lineStart = index + 1;
			}
		}
		return { line, colUtf16: utf16Offset - lineStart + 1 };
	}

	utf16IndexToUtf8Byte(utf16Offset: number): number {
		this.assertUtf16Boundary(utf16Offset);
		const blockIndex = Math.min(Math.floor(utf16Offset / this.blockSize), this.blockStartsUtf16.length - 1);
		let index = this.blockStartsUtf16[blockIndex] ?? 0;
		let byteOffset = this.blockStartsUtf8[blockIndex] ?? 0;
		while (index < utf16Offset) {
			const first = this.canonicalText.charCodeAt(index);
			if (first >= 0xd800 && first <= 0xdbff) {
				index += 2;
				byteOffset += 4;
			} else {
				index += 1;
				byteOffset += first < 0x80 ? 1 : first < 0x800 ? 2 : 3;
			}
		}
		return byteOffset;
	}

	utf8ByteToUtf16Index(utf8ByteOffset: number): number {
		if (!Number.isSafeInteger(utf8ByteOffset) || utf8ByteOffset < 0 || utf8ByteOffset > this.utf8TotalBytes) {
			throw new RangeError(`UTF8_BYTE_OFFSET_OUT_OF_BOUNDS: ${utf8ByteOffset}`);
		}
		let low = 0;
		let high = this.blockStartsUtf8.length - 1;
		while (low < high) {
			const mid = Math.ceil((low + high) / 2);
			if ((this.blockStartsUtf8[mid] ?? 0) <= utf8ByteOffset) low = mid;
			else high = mid - 1;
		}
		let index = this.blockStartsUtf16[low] ?? 0;
		let byteOffset = this.blockStartsUtf8[low] ?? 0;
		while (byteOffset < utf8ByteOffset && index < this.canonicalText.length) {
			const first = this.canonicalText.charCodeAt(index);
			const units = first >= 0xd800 && first <= 0xdbff ? 2 : 1;
			const bytes = units === 2 ? 4 : first < 0x80 ? 1 : first < 0x800 ? 2 : 3;
			byteOffset += bytes;
			index += units;
		}
		if (byteOffset !== utf8ByteOffset) {
			throw new Error(`UNALIGNED_UTF8_BYTE_OFFSET: ${utf8ByteOffset} splits a UTF-8 code point`);
		}
		return index;
	}

	resolveDualSpan(utf16Start: number, utf16End: number): DualEncodedTextSpanV1 {
		if (!Number.isSafeInteger(utf16Start) || !Number.isSafeInteger(utf16End) || utf16Start < 0 || utf16End <= utf16Start) {
			throw new RangeError(`INVALID_UTF16_SPAN: [${utf16Start}, ${utf16End}]`);
		}
		this.assertUtf16Boundary(utf16Start);
		this.assertUtf16Boundary(utf16End);
		const start = this.resolveLineAndCol(utf16Start);
		const end = this.resolveLineAndCol(utf16End - 1);
		return {
			utf16Start,
			utf16End,
			utf8ByteStart: this.utf16IndexToUtf8Byte(utf16Start),
			utf8ByteEnd: this.utf16IndexToUtf8Byte(utf16End),
			lineStart: start.line,
			lineEnd: end.line,
			colStartUtf16: start.colUtf16,
			colEndUtf16: end.colUtf16,
			text: this.canonicalText.slice(utf16Start, utf16End),
		};
	}

	sliceTrimmedDualSpan(rawUtf16Start: number, rawUtf16End: number): DualEncodedTextSpanV1 {
		if (!Number.isSafeInteger(rawUtf16Start) || !Number.isSafeInteger(rawUtf16End) || rawUtf16Start < 0 || rawUtf16End > this.canonicalText.length || rawUtf16Start >= rawUtf16End) {
			throw new RangeError(`INVALID_SPAN_BOUNDS: [${rawUtf16Start}, ${rawUtf16End}]`);
		}
		this.assertUtf16Boundary(rawUtf16Start);
		this.assertUtf16Boundary(rawUtf16End);
		let start = rawUtf16Start;
		let end = rawUtf16End;
		while (start < end && /\s/u.test(this.canonicalText[start] ?? '')) start++;
		while (end > start && /\s/u.test(this.canonicalText[end - 1] ?? '')) end--;
		if (start >= end) throw new Error('EMPTY_SPAN_AFTER_TRIM');
		return this.resolveDualSpan(start, end);
	}

	private assertUtf16Boundary(offset: number): void {
		if (!Number.isSafeInteger(offset) || offset < 0 || offset > this.canonicalText.length) {
			throw new RangeError(`UTF16_OFFSET_OUT_OF_BOUNDS: ${offset}`);
		}
		const current = this.canonicalText.charCodeAt(offset);
		const previous = offset > 0 ? this.canonicalText.charCodeAt(offset - 1) : 0;
		if (current >= 0xdc00 && current <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff) {
			throw new Error(`UNALIGNED_UTF16_OFFSET: ${offset} splits a surrogate pair`);
		}
	}
}
