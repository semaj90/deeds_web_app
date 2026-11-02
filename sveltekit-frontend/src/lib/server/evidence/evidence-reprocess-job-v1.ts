import { z } from 'zod';

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export function buildEvidenceReprocessJobV1(input: {
	evidenceId: string;
	caseId: string | null;
	fileUrl: string | null;
	fileName: string | null;
	contentType: string | null;
	sourceSha256: string | null;
	uploadedBy: number;
}) {
	const evidenceId = z.string().uuid().parse(input.evidenceId);
	const caseId = input.caseId === null ? null : z.string().uuid().parse(input.caseId);
	const fileName = z.string().trim().min(1).max(512).parse(input.fileName);
	const sourceSha256 = digestSchema.parse(input.sourceSha256);
	const uploadedBy = z.number().int().positive().parse(input.uploadedBy);
	const fileUrl = z.string().min(1).parse(input.fileUrl);
	const objectKey = fileUrl.startsWith('minio://legal-evidence/')
		? fileUrl.slice('minio://legal-evidence/'.length)
		: fileUrl;
	if (
		!objectKey.startsWith('evidence/') ||
		objectKey.includes('\\') ||
		objectKey.split('/').some((segment) => segment === '.' || segment === '..')
	) {
		throw new Error('EVIDENCE_SOURCE_OBJECT_REFERENCE_INVALID');
	}

	return {
		evidenceId,
		caseId,
		jobType: 'upload_pipeline' as const,
		result: {
			evidenceId,
			caseId,
			objectKey,
			object_bucket: 'legal-evidence',
			sourceSha256,
			fileName,
			contentType: input.contentType ?? 'application/octet-stream',
			uploadedBy,
		},
	};
}
