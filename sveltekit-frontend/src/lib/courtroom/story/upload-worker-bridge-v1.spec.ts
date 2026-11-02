import { describe, it, expect, vi } from 'vitest';
import {
	validateEvidenceFile,
	chunkEvidenceText,
	MAX_EVIDENCE_FILE_SIZE_BYTES,
	type UploadProgressEvent
} from './upload-worker-bridge-v1.js';

describe('Upload Worker Bridge (CSP-20, CSP-21, CSP-22)', () => {
	it('validateEvidenceFile accepts valid text and PDF files', () => {
		const resTxt = validateEvidenceFile({ name: 'deed.txt', size: 1024, type: 'text/plain' });
		expect(resTxt.accepted).toBe(true);

		const resPdf = validateEvidenceFile({ name: 'contract.pdf', size: 50000, type: 'application/pdf' });
		expect(resPdf.accepted).toBe(true);
	});

	it('validateEvidenceFile rejects files larger than 100 MB with receipt (CSP-22)', () => {
		const res = validateEvidenceFile({
			name: 'huge_evidence.raw',
			size: MAX_EVIDENCE_FILE_SIZE_BYTES + 1,
			type: 'text/plain'
		});
		expect(res.accepted).toBe(false);
		if (!res.accepted) {
			expect(res.code).toBe('FILE_TOO_LARGE');
			expect(res.reason).toContain('100 MB');
		}
	});

	it('validateEvidenceFile rejects 0-byte empty files', () => {
		const res = validateEvidenceFile({ name: 'empty.txt', size: 0, type: 'text/plain' });
		expect(res.accepted).toBe(false);
		if (!res.accepted) {
			expect(res.code).toBe('EMPTY_FILE');
		}
	});

	it('validateEvidenceFile rejects unsupported MIME types', () => {
		const res = validateEvidenceFile({ name: 'payload.exe', size: 2048, type: 'application/x-msdownload' });
		expect(res.accepted).toBe(false);
		if (!res.accepted) {
			expect(res.code).toBe('UNSUPPORTED_TYPE');
		}
	});

	it('chunkEvidenceText breaks paragraphs into bounded chunks with overlap (CSP-20)', () => {
		const text = `Section 1: The title was transferred to Defendant in 1994.

Section 2: The plaintiff claims the signature was forged by an accomplice.

Section 3: Bank records verify that no consideration was received by grantor.`;

		const progressUpdates: UploadProgressEvent[] = [];
		const chunks = chunkEvidenceText(
			text,
			{ maxChunkSize: 100, overlap: 20 },
			(ev) => progressUpdates.push(ev)
		);

		expect(chunks.length).toBeGreaterThanOrEqual(3);
		expect(chunks[0].text).toContain('Section 1');
		expect(chunks[0].id).toBe('chunk-0000');

		// Progress reporting (CSP-21)
		expect(progressUpdates.length).toBeGreaterThan(0);
		const lastEvent = progressUpdates[progressUpdates.length - 1];
		expect(lastEvent.stage).toBe('complete');
		expect(lastEvent.percent).toBe(100);
		expect(lastEvent.chunksProduced).toBe(chunks.length);
	});

	it('chunkEvidenceText handles empty input gracefully', () => {
		const chunks = chunkEvidenceText('');
		expect(chunks).toEqual([]);
	});
});
