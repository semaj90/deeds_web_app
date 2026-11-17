export interface EvidenceMarkupPointV1 {
	readonly x: number;
	readonly y: number;
	readonly label: string;
}

export type EvidenceMarkupShapeKindV1 = 'pin' | 'rectangle' | 'arrow' | 'text';

export interface EvidenceMarkupPinItemV1 {
	readonly id: string;
	readonly kind: 'pin';
	readonly x: number;
	readonly y: number;
	readonly label: string;
	readonly timecodeMs?: number;
}

export interface EvidenceMarkupRectangleItemV1 {
	readonly id: string;
	readonly kind: 'rectangle';
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly label?: string;
	readonly color?: string;
}

export interface EvidenceMarkupArrowItemV1 {
	readonly id: string;
	readonly kind: 'arrow';
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
	readonly label?: string;
	readonly color?: string;
}

export interface EvidenceMarkupTextItemV1 {
	readonly id: string;
	readonly kind: 'text';
	readonly x: number;
	readonly y: number;
	readonly text: string;
	readonly color?: string;
}

export type EvidenceMarkupItemV1 =
	| EvidenceMarkupPinItemV1
	| EvidenceMarkupRectangleItemV1
	| EvidenceMarkupArrowItemV1
	| EvidenceMarkupTextItemV1;

export interface EvidenceMarkupDocumentV1 {
	readonly schemaVersion: 'evidence-markup-v1';
	readonly notes: string;
	readonly items: readonly EvidenceMarkupItemV1[];
}

export interface EvidenceMarkupNoteV1 {
	readonly title: string;
	readonly content: string;
	readonly isAI: false;
}

const SHA256_RE = /^(?:sha256:)?[a-f0-9]{64}$/i;

function assertUnitX(value: number): void {
	if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('MARKUP_X_OUT_OF_RANGE');
}

function assertUnitY(value: number): void {
	if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('MARKUP_Y_OUT_OF_RANGE');
}

function normalizeOptionalLabel(label: string | undefined): string | undefined {
	if (label === undefined) return undefined;
	const trimmed = label.trim();
	if (trimmed.length > 200) throw new Error('MARKUP_LABEL_INVALID');
	return trimmed || undefined;
}

function normalizeOptionalColor(color: string | undefined): string | undefined {
	if (color === undefined) return undefined;
	const trimmed = color.trim();
	return trimmed ? trimmed.slice(0, 32) : undefined;
}

function validateAndNormalizeMarkupItem(item: EvidenceMarkupItemV1): EvidenceMarkupItemV1 {
	const id = item.id.trim();
	if (!id || id.length > 64) throw new Error('MARKUP_ITEM_ID_INVALID');

	switch (item.kind) {
		case 'pin': {
			assertUnitX(item.x);
			assertUnitY(item.y);
			const label = item.label.trim();
			if (!label || label.length > 200) throw new Error('MARKUP_LABEL_INVALID');
			if (item.timecodeMs !== undefined && (!Number.isSafeInteger(item.timecodeMs) || item.timecodeMs < 0)) {
				throw new Error('MEDIA_TIMESTAMP_INVALID');
			}
			return {
				id,
				kind: 'pin',
				x: item.x,
				y: item.y,
				label,
				...(item.timecodeMs === undefined ? {} : { timecodeMs: item.timecodeMs }),
			};
		}
		case 'rectangle': {
			assertUnitX(item.x);
			assertUnitY(item.y);
			if (
				!Number.isFinite(item.width) || !Number.isFinite(item.height)
				|| item.width <= 0 || item.height <= 0
				|| item.x + item.width > 1 || item.y + item.height > 1
			) {
				throw new Error('MARKUP_RECT_DIMENSIONS_INVALID');
			}
			const label = normalizeOptionalLabel(item.label);
			const color = normalizeOptionalColor(item.color);
			return {
				id,
				kind: 'rectangle',
				x: item.x,
				y: item.y,
				width: item.width,
				height: item.height,
				...(label === undefined ? {} : { label }),
				...(color === undefined ? {} : { color }),
			};
		}
		case 'arrow': {
			assertUnitX(item.x1);
			assertUnitY(item.y1);
			assertUnitX(item.x2);
			assertUnitY(item.y2);
			const label = normalizeOptionalLabel(item.label);
			const color = normalizeOptionalColor(item.color);
			return {
				id,
				kind: 'arrow',
				x1: item.x1,
				y1: item.y1,
				x2: item.x2,
				y2: item.y2,
				...(label === undefined ? {} : { label }),
				...(color === undefined ? {} : { color }),
			};
		}
		case 'text': {
			assertUnitX(item.x);
			assertUnitY(item.y);
			const text = item.text.trim();
			if (!text || text.length > 500) throw new Error('MARKUP_TEXT_INVALID');
			const color = normalizeOptionalColor(item.color);
			return {
				id,
				kind: 'text',
				x: item.x,
				y: item.y,
				text,
				...(color === undefined ? {} : { color }),
			};
		}
	}
}

export function buildEvidenceMarkupDocumentV1(input: {
	notes?: string;
	items?: readonly EvidenceMarkupItemV1[];
	points?: readonly EvidenceMarkupPointV1[];
}): EvidenceMarkupDocumentV1 {
	const notes = input.notes?.trim() ?? '';
	if (notes.length > 4000) throw new Error('REVIEW_NOTE_TOO_LONG');

	const convertedPins: EvidenceMarkupPinItemV1[] = (input.points ?? []).map((point, index) => ({
		id: `pin-${index + 1}`,
		kind: 'pin',
		x: point.x,
		y: point.y,
		label: point.label,
	}));
	const mergedItems = [...convertedPins, ...(input.items ?? [])];
	if (mergedItems.length > 100) throw new Error('MARKUP_ITEM_LIMIT_EXCEEDED');

	return {
		schemaVersion: 'evidence-markup-v1',
		notes,
		items: mergedItems.map(validateAndNormalizeMarkupItem),
	};
}

export function buildEvidenceMarkupNoteV1(input: {
	evidenceId: string;
	sourceSha256: string;
	points: readonly EvidenceMarkupPointV1[];
	items?: readonly EvidenceMarkupItemV1[];
	noteText?: string;
	mediaTimestampMs?: number;
}): EvidenceMarkupNoteV1 {
	if (!input.evidenceId.trim()) throw new Error('EVIDENCE_ID_REQUIRED');
	if (!SHA256_RE.test(input.sourceSha256)) throw new Error('SOURCE_SHA256_REQUIRED');
	const noteText = input.noteText?.trim() ?? '';
	const itemsInput = input.items ?? [];
	if (input.points.length === 0 && itemsInput.length === 0 && !noteText && input.mediaTimestampMs === undefined) {
		throw new Error('REVIEW_CONTENT_REQUIRED');
	}
	if (input.points.length > 100) throw new Error('MARKUP_POINT_LIMIT_EXCEEDED');
	if (itemsInput.length > 100) throw new Error('MARKUP_ITEM_LIMIT_EXCEEDED');
	if (noteText.length > 10_000) throw new Error('REVIEW_NOTE_TOO_LONG');
	if (input.mediaTimestampMs !== undefined && (!Number.isSafeInteger(input.mediaTimestampMs) || input.mediaTimestampMs < 0)) {
		throw new Error('MEDIA_TIMESTAMP_INVALID');
	}
	for (const point of input.points) {
		assertUnitX(point.x);
		assertUnitY(point.y);
		if (!point.label.trim() || point.label.length > 120) throw new Error('MARKUP_LABEL_INVALID');
	}
	const normalizedItems = itemsInput.map(validateAndNormalizeMarkupItem);
	return {
		title: `Evidence review — ${input.evidenceId}`,
		isAI: false,
		content: JSON.stringify({
			schema: 'atlas.evidence-markup.v1',
			evidenceId: input.evidenceId,
			sourceSha256: input.sourceSha256.startsWith('sha256:') ? input.sourceSha256 : `sha256:${input.sourceSha256}`,
			coordinates: 'normalized-image-0-to-1',
			...(input.mediaTimestampMs === undefined ? {} : {
				mediaLocation: { kind: 'video-frame', timestampMs: input.mediaTimestampMs }
			}),
			noteText,
			points: input.points.map(({ x, y, label }) => ({ x, y, label: label.trim() })),
			...(normalizedItems.length > 0 ? { items: normalizedItems } : {}),
		}, null, 2)
	};
}

export function audioFormatTip(mimeType: string, fileName: string): string {
	const type = mimeType.toLowerCase().split(';', 1)[0];
	const name = fileName.toLowerCase();
	if (type === 'audio/wav' || type === 'audio/x-wav' || name.endsWith('.wav')) {
		return 'WAV is often uncompressed, so larger recordings can take longer to load. FLAC is lossless with compression. Playback keeps the original file; no conversion is performed.';
	}
	if (type === 'audio/flac' || name.endsWith('.flac')) {
		return 'FLAC is lossless compressed audio. Playback uses the original recording without conversion.';
	}
	if (type === 'audio/mpeg' || type === 'audio/mp3' || name.endsWith('.mp3')) {
		return 'MP3 is already compressed. Playback uses the original recording without conversion.';
	}
	return 'Playback uses the original audio file. No conversion is performed.';
}
