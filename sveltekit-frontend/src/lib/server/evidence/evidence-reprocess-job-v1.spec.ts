import { describe, expect, it } from 'vitest';
import { buildEvidenceReprocessJobV1 } from './evidence-reprocess-job-v1.js';

const sourceSha256 = `sha256:${'a'.repeat(64)}`;
const evidenceId = '123e4567-e89b-42d3-a456-426614174000';

describe('buildEvidenceReprocessJobV1', () => {
	it('builds a canonical upload-pipeline job from the stored object and digest', () => {
		expect(buildEvidenceReprocessJobV1({
			evidenceId,
			caseId: null,
			fileUrl: 'minio://legal-evidence/evidence/7/source.pdf',
			fileName: 'source.pdf',
			contentType: 'application/pdf',
			sourceSha256,
			uploadedBy: 7,
		})).toEqual({
			evidenceId,
			caseId: null,
			jobType: 'upload_pipeline',
			result: {
				evidenceId,
				caseId: null,
				objectKey: 'evidence/7/source.pdf',
				object_bucket: 'legal-evidence',
				sourceSha256,
				fileName: 'source.pdf',
				contentType: 'application/pdf',
				uploadedBy: 7,
			},
		});
	});

	it.each([
		{ fileUrl: 'minio://legal-library/evidence/7/source.pdf', sourceSha256 },
		{ fileUrl: 'minio://legal-evidence/evidence/../private.pdf', sourceSha256 },
		{ fileUrl: 'minio://legal-evidence/evidence/7/source.pdf', sourceSha256: null },
	])('rejects unsafe or unqualified persisted sources', (overrides) => {
		expect(() => buildEvidenceReprocessJobV1({
			evidenceId,
			caseId: null,
			fileUrl: 'minio://legal-evidence/evidence/7/source.pdf',
			fileName: 'source.pdf',
			contentType: 'application/pdf',
			sourceSha256,
			uploadedBy: 7,
			...overrides,
		})).toThrow();
	});
});
