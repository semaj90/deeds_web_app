export interface LibraryPageTextV1 {
	pageNumber: number;
	text: string;
}

export interface LibraryPageSpanV1 {
	pageNumber: number;
	charStart: number;
	charEnd: number;
}

/** Fails closed unless the chunk text is byte-for-byte equal to its UTF-16 source slice. */
export function verifyLibraryChunkSourceSpanV1(
	sourceText: string,
	chunkText: string,
	charStart: number,
	charEnd: number,
): void {
	if (
		!Number.isSafeInteger(charStart) ||
		!Number.isSafeInteger(charEnd) ||
		charStart < 0 ||
		charEnd <= charStart ||
		charEnd > sourceText.length
	) {
		throw new Error('LIBRARY_CHUNK_SOURCE_SPAN_INVALID');
	}
	if (!chunkText || sourceText.slice(charStart, charEnd) !== chunkText) {
		throw new Error('LIBRARY_CHUNK_SOURCE_SPAN_MISMATCH');
	}
}

/** Maps each page into the exact parser string consumed by the chunker. */
export function buildLibraryPageSpansV1(pages: readonly LibraryPageTextV1[], sourceText: string): LibraryPageSpanV1[] {
	let cursor = 0;
	const spans: LibraryPageSpanV1[] = [];
	let previousPageNumber = 0;
	for (const page of pages) {
		if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber <= previousPageNumber) {
			throw new Error('LIBRARY_PAGE_ORDER_INVALID');
		}
		if (typeof page.text !== 'string') throw new Error('LIBRARY_PAGE_TEXT_INVALID');
		const charStart = sourceText.indexOf(page.text, cursor);
		if (charStart < 0) throw new Error('LIBRARY_PAGE_TEXT_NOT_IN_SOURCE');
		const charEnd = charStart + page.text.length;
		spans.push({ pageNumber: page.pageNumber, charStart, charEnd });
		cursor = charEnd;
		previousPageNumber = page.pageNumber;
	}
	return spans;
}

/** Returns 1-based page bounds for a chunk only when exact source offsets overlap. */
export function resolveLibraryChunkPageSpanV1(
	charStart: number,
	charEnd: number,
	pageSpans: readonly LibraryPageSpanV1[],
): { pageStart: number; pageEnd: number } | null {
	if (!Number.isSafeInteger(charStart) || !Number.isSafeInteger(charEnd) || charStart < 0 || charEnd <= charStart) {
		throw new Error('LIBRARY_CHUNK_SPAN_INVALID');
	}
	const pages = pageSpans
		.filter((page) => charStart < page.charEnd && charEnd > page.charStart)
		.map((page) => page.pageNumber);
	return pages.length ? { pageStart: Math.min(...pages), pageEnd: Math.max(...pages) } : null;
}

/** Parses the existing OCR fallback's explicit `--- Page N ---` markers. */
export function parseLibraryOcrPageSpansV1(text: string): LibraryPageSpanV1[] {
	const markers = [...text.matchAll(/^--- Page (\d+) ---\r?\n/gm)];
	if (!markers.length) return [];
	let previousPageNumber = 0;
	return markers.map((marker, index) => {
		const pageNumber = Number(marker[1]);
		if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber <= previousPageNumber) {
			throw new Error('LIBRARY_OCR_PAGE_ORDER_INVALID');
		}
		previousPageNumber = pageNumber;
		const charStart = (marker.index ?? 0) + marker[0].length;
		const charEnd = index + 1 < markers.length ? (markers[index + 1]?.index ?? text.length) : text.length;
		return { pageNumber, charStart, charEnd };
	});
}
