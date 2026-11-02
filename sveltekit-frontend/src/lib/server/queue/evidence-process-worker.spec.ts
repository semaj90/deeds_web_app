import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getSeaweedFile: vi.fn(),
	processDocument: vi.fn(),
	extractEntities: vi.fn(),
	detectForensicPatterns: vi.fn(),
	processEvidenceDocumentCanonicalV1: vi.fn(),
}));

vi.mock('$lib/server/seaweed-client.js', () => ({ getSeaweedFile: mocks.getSeaweedFile }));
vi.mock('$lib/server/document-processor.js', () => ({ processDocument: mocks.processDocument }));
vi.mock('$lib/server/analysis/entity-extraction.js', () => ({ extractEntities: mocks.extractEntities }));
vi.mock('$lib/server/analysis/forensics.js', () => ({ detectForensicPatterns: mocks.detectForensicPatterns }));
vi.mock('$lib/server/evidence/process-evidence-document-v1.js', () => ({
	processEvidenceDocumentCanonicalV1: mocks.processEvidenceDocumentCanonicalV1,
}));

import { EvidenceProcessWorker } from './queue-worker.js';

function sourceRevision(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

describe('EvidenceProcessWorker canonical vector path', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getSeaweedFile.mockResolvedValue(Buffer.from('uploaded legal source'));
		mocks.processDocument.mockResolvedValue({ rawText: 'Extracted legal text', extractionMethod: 'fixture' });
		mocks.extractEntities.mockResolvedValue([{ label: 'fixture' }]);
		mocks.detectForensicPatterns.mockReturnValue([]);
		mocks.processEvidenceDocumentCanonicalV1.mockResolvedValue({
			chunkCount: 1,
			persistedCount: 1,
			sourceRevision: sourceRevision(Buffer.from('uploaded legal source')),
		});
	});

	it('rejects legacy RabbitMQ execution outside the durable analysis_jobs worker', async () => {
		const worker = new EvidenceProcessWorker();
		await expect(worker.process({ evidenceId: 'evidence-legacy', text: 'payload' }))
			.rejects.toThrow('EVIDENCE_PROCESS_REQUIRES_DURABLE_ANALYSIS_JOB');
		expect(mocks.getSeaweedFile).not.toHaveBeenCalled();
		expect(mocks.processEvidenceDocumentCanonicalV1).not.toHaveBeenCalled();
	});

	it('verifies the uploaded bytes and persists through the canonical processor without projection bypass', async () => {
		const bytes = Buffer.from('uploaded legal source');
		const digest = sourceRevision(bytes);
		const worker = new EvidenceProcessWorker();

		await worker.processCanonical({
			evidenceId: 'evidence-1',
			text: 'form placeholder',
			contentType: 'application/pdf',
			caseId: 'case-1',
			metadata: {
				objectKey: 'evidence/1/file.pdf',
				object_bucket: 'legal-evidence',
				fileName: 'file.pdf',
				sourceSha256: digest,
				source_revision: digest,
			},
		});

		expect(mocks.getSeaweedFile).toHaveBeenCalledWith('legal-evidence', 'evidence/1/file.pdf');
		expect(mocks.processEvidenceDocumentCanonicalV1).toHaveBeenCalledWith(expect.objectContaining({
			evidenceId: 'evidence-1',
			text: 'Extracted legal text',
			metadata: expect.objectContaining({ caseId: 'case-1', source_revision: digest }),
		}));
		const canonicalInput = mocks.processEvidenceDocumentCanonicalV1.mock.calls[0][0];
		expect(canonicalInput.sourceBytes).toEqual(bytes);
		expect(canonicalInput.metadata).not.toHaveProperty('objectKey');
		expect(canonicalInput.metadata).not.toHaveProperty('object_bucket');
	});

	it('returns chunk persistence counts and rejects incomplete canonical readback', async () => {
		const bytes = Buffer.from('uploaded legal source');
		const digest = sourceRevision(bytes);
		const worker = new EvidenceProcessWorker();
		const payload = {
			evidenceId: 'evidence-receipt',
			text: 'form placeholder',
			metadata: {
				objectKey: 'evidence/1/file.pdf',
				object_bucket: 'legal-evidence',
				fileName: 'file.pdf',
				sourceSha256: digest,
			},
		};

		await expect(worker.processCanonical(payload)).resolves.toMatchObject({
			chunkCount: 1,
			persistedCount: 1,
			sourceRevision: digest,
		});
		mocks.processEvidenceDocumentCanonicalV1.mockResolvedValueOnce({
			chunkCount: 2,
			persistedCount: 1,
			sourceRevision: digest,
		});
		await expect(worker.processCanonical(payload)).rejects.toThrow(
			'EVIDENCE_CANONICAL_PERSISTENCE_RECEIPT_INVALID',
		);
	});

	it('uses the uploaded MIME type and forwards verified image bytes to visual analysis', async () => {
		const bytes = Buffer.from('uploaded image bytes');
		mocks.getSeaweedFile.mockResolvedValue(bytes);
		mocks.processEvidenceDocumentCanonicalV1.mockResolvedValue({
			chunkCount: 1,
			persistedCount: 1,
			sourceRevision: sourceRevision(bytes),
		});
		const digest = sourceRevision(bytes);
		const worker = new EvidenceProcessWorker();

		await worker.processCanonical({
			evidenceId: 'evidence-image',
			text: 'form placeholder',
			contentType: 'document',
			metadata: {
				objectKey: 'evidence/1/image.png',
				object_bucket: 'legal-evidence',
				fileName: 'image.png',
				fileType: 'image/png',
				sourceSha256: digest,
			},
		});

		expect(mocks.processDocument).toHaveBeenCalledWith(expect.objectContaining({
			mimeType: 'image/png',
		}));
		expect(mocks.processEvidenceDocumentCanonicalV1).toHaveBeenCalledWith(expect.objectContaining({
			sourceBytes: bytes,
			contentType: 'image/png',
		}));
	});

	it('fails closed when an object reference has no valid source digest', async () => {
		const worker = new EvidenceProcessWorker();

		await expect(worker.processCanonical({
			evidenceId: 'evidence-2',
			text: 'placeholder',
			metadata: { objectKey: 'evidence/1/file.pdf', object_bucket: 'legal-evidence' },
		})).rejects.toThrow('EVIDENCE_SOURCE_SHA256_REQUIRED');

		expect(mocks.getSeaweedFile).not.toHaveBeenCalled();
		expect(mocks.processEvidenceDocumentCanonicalV1).not.toHaveBeenCalled();
	});

	it('rejects embedding caller-supplied text without a persisted source object', async () => {
		const worker = new EvidenceProcessWorker();

		await expect(worker.processCanonical({
			evidenceId: 'evidence-6',
			text: 'caller-supplied content',
		})).rejects.toThrow('EVIDENCE_SOURCE_OBJECT_REFERENCE_REQUIRED');

		expect(mocks.processEvidenceDocumentCanonicalV1).not.toHaveBeenCalled();
	});

	it('rejects object references outside the evidence bucket and prefix', async () => {
		const worker = new EvidenceProcessWorker();

		await expect(worker.processCanonical({
			evidenceId: 'evidence-5',
			text: 'placeholder',
			metadata: {
				objectKey: '../private/file.pdf',
				object_bucket: 'legal-library',
				sourceSha256: 'sha256:' + '0'.repeat(64),
			},
		})).rejects.toThrow('EVIDENCE_OBJECT_REFERENCE_INVALID');

		expect(mocks.getSeaweedFile).not.toHaveBeenCalled();
		expect(mocks.processEvidenceDocumentCanonicalV1).not.toHaveBeenCalled();
	});

	it('rejects bytes that do not match the claimed source revision', async () => {
		const worker = new EvidenceProcessWorker();

		await expect(worker.processCanonical({
			evidenceId: 'evidence-3',
			text: 'placeholder',
			metadata: {
				objectKey: 'evidence/1/file.pdf',
				object_bucket: 'legal-evidence',
				sourceSha256: 'sha256:' + '0'.repeat(64),
			},
		})).rejects.toThrow('EVIDENCE_SOURCE_SHA256_MISMATCH');

		expect(mocks.processEvidenceDocumentCanonicalV1).not.toHaveBeenCalled();
	});

	it('preserves intentional skipEmbedding jobs without invoking vector persistence', async () => {
		const worker = new EvidenceProcessWorker();

		await worker.processCanonical({ evidenceId: 'evidence-4', text: 'already processed', skipEmbedding: true });

		expect(mocks.processEvidenceDocumentCanonicalV1).not.toHaveBeenCalled();
	});
});
