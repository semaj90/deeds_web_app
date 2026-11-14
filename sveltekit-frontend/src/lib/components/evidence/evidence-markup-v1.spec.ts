import { describe, expect, it } from 'vitest';
import { audioFormatTip, buildEvidenceMarkupDocumentV1, buildEvidenceMarkupNoteV1 } from './evidence-markup-v1';
import { markupDocumentV1Schema } from '$lib/server/features/evidence/evidence-revision-v1.js';

const SHA = 'a'.repeat(64);

describe('evidence markup v1', () => {
	it('creates a source-revision-bound note without mutating evidence bytes', () => {
		const note = buildEvidenceMarkupNoteV1({
			evidenceId: 'evidence-1',
			sourceSha256: SHA,
			points: [{ x: 0.25, y: 0.75, label: 'Visible mark' }]
		});
		expect(note.isAI).toBe(false);
		expect(JSON.parse(note.content)).toMatchObject({
			schema: 'atlas.evidence-markup.v1',
			sourceSha256: `sha256:${SHA}`,
			coordinates: 'normalized-image-0-to-1',
			points: [{ x: 0.25, y: 0.75, label: 'Visible mark' }]
		});
	});

	it.each([
		['missing source hash', '', 'SOURCE_SHA256_REQUIRED'],
		['malformed source hash', 'sha256:bad', 'SOURCE_SHA256_REQUIRED']
	])('rejects %s', (_label, sourceSha256, code) => {
		expect(() => buildEvidenceMarkupNoteV1({
			evidenceId: 'evidence-1',
			sourceSha256,
			points: [{ x: 0.5, y: 0.5, label: 'Pin' }]
		})).toThrow(code);
	});

	it('rejects invalid coordinates, empty points, and oversized labels', () => {
		const make = (point: { x: number; y: number; label: string }[]) => buildEvidenceMarkupNoteV1({
			evidenceId: 'evidence-1', sourceSha256: SHA, points: point
		});
		expect(() => make([])).toThrow('REVIEW_CONTENT_REQUIRED');
		expect(() => make([{ x: 1.1, y: 0, label: 'Pin' }])).toThrow('MARKUP_X_OUT_OF_RANGE');
		expect(() => make([{ x: 0, y: Number.NaN, label: 'Pin' }])).toThrow('MARKUP_Y_OUT_OF_RANGE');
		expect(() => make([{ x: 0, y: 0, label: 'x'.repeat(121) }])).toThrow('MARKUP_LABEL_INVALID');
	});

	it('allows a reviewer text note without image pins', () => {
		const note = buildEvidenceMarkupNoteV1({ evidenceId: 'evidence-1', sourceSha256: SHA, points: [], noteText: 'Review this audio segment.' });
		expect(JSON.parse(note.content).noteText).toBe('Review this audio segment.');
	});

	it('binds a video frame bookmark to the original evidence hash and timestamp', () => {
		const note = buildEvidenceMarkupNoteV1({ evidenceId: 'video-1', sourceSha256: SHA, points: [], mediaTimestampMs: 12_340 });
		expect(JSON.parse(note.content)).toMatchObject({
			schema: 'atlas.evidence-markup.v1',
			sourceSha256: `sha256:${SHA}`,
			mediaLocation: { kind: 'video-frame', timestampMs: 12_340 }
		});
	});

	it('rejects invalid video frame timestamps', () => {
		expect(() => buildEvidenceMarkupNoteV1({ evidenceId: 'video-1', sourceSha256: SHA, points: [], mediaTimestampMs: -1 })).toThrow('MEDIA_TIMESTAMP_INVALID');
		expect(() => buildEvidenceMarkupNoteV1({ evidenceId: 'video-1', sourceSha256: SHA, points: [], mediaTimestampMs: 1.5 })).toThrow('MEDIA_TIMESTAMP_INVALID');
	});

	it('allows non-pin markup items in review notes without legacy points', () => {
		const note = buildEvidenceMarkupNoteV1({
			evidenceId: 'evidence-2',
			sourceSha256: SHA,
			points: [],
			items: [{ id: 'rect-1', kind: 'rectangle', x: 0.1, y: 0.2, width: 0.3, height: 0.4, label: 'Signature' }]
		});
		expect(JSON.parse(note.content).items).toHaveLength(1);
	});
});

describe('evidence markup V2 document compatibility', () => {
	it('builds a document with pin, rectangle, arrow, text, and legacy points that satisfies server markupDocumentV1Schema', () => {
		const doc = buildEvidenceMarkupDocumentV1({
			notes: 'Annotated V2 evidence image.',
			points: [{ x: 0.15, y: 0.25, label: 'Entry point' }],
			items: [
				{ id: 'rect-1', kind: 'rectangle', x: 0.2, y: 0.3, width: 0.4, height: 0.25, label: 'Plate', color: '#f4d36c' },
				{ id: 'arrow-1', kind: 'arrow', x1: 0.1, y1: 0.1, x2: 0.35, y2: 0.4, label: 'Direction' },
				{ id: 'text-1', kind: 'text', x: 0.6, y: 0.7, text: 'Exhibit stamp' }
			]
		});

		expect(doc.schemaVersion).toBe('evidence-markup-v1');
		expect(doc.items).toHaveLength(4);
		expect(doc.items[0]).toMatchObject({ id: 'pin-1', kind: 'pin', x: 0.15, y: 0.25, label: 'Entry point' });

		const parsed = markupDocumentV1Schema.safeParse(doc);
		expect(parsed.success).toBe(true);
	});

	it('rejects out-of-bounds rectangle dimensions, blank text, excess notes, and item overflow', () => {
		expect(() =>
			buildEvidenceMarkupDocumentV1({
				items: [{ id: 'rect-bad', kind: 'rectangle', x: 0.8, y: 0.2, width: 0.3, height: 0.2 }]
			})
		).toThrow('MARKUP_RECT_DIMENSIONS_INVALID');

		expect(() =>
			buildEvidenceMarkupDocumentV1({
				items: [{ id: 'text-bad', kind: 'text', x: 0.5, y: 0.5, text: '   ' }]
			})
		).toThrow('MARKUP_TEXT_INVALID');

		expect(() =>
			buildEvidenceMarkupDocumentV1({
				notes: 'n'.repeat(4001),
				items: []
			})
		).toThrow('REVIEW_NOTE_TOO_LONG');

		expect(() =>
			buildEvidenceMarkupDocumentV1({
				items: Array.from({ length: 101 }, (_, i) => ({
					id: `pin-${i}`,
					kind: 'pin' as const,
					x: 0.1,
					y: 0.1,
					label: `P${i}`
				}))
			})
		).toThrow('MARKUP_ITEM_LIMIT_EXCEEDED');
	});
});

describe('audio format guidance', () => {
	it('explains WAV size and lossless FLAC without suggesting conversion', () => {
		expect(audioFormatTip('audio/wav', 'capture.wav')).toContain('FLAC is lossless');
		expect(audioFormatTip('audio/flac', 'capture.flac')).toContain('without conversion');
		expect(audioFormatTip('audio/mpeg', 'capture.mp3')).toContain('already compressed');
	});
});
