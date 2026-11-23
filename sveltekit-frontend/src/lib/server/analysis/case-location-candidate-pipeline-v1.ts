import { createHash } from 'node:crypto';
import { z } from 'zod';
import { extractCaseLocationTextCandidatesV1, type CaseLocationTextCandidateV1 } from './case-location-text-candidate-v1.js';
import {
	extractExifCaptureLocationCandidateV1,
	type ExifCaptureLocationCandidateV1,
} from '../evidence/exif-capture-location-candidate-v1.js';

const inputSchema = z.object({
	caseId: z.string().uuid(),
	evidenceId: z.string().uuid(),
	storedSourceSha256: z.string().regex(/^[a-f0-9]{64}$/i),
	mimeType: z.string().min(1).max(120),
	originalBytes: z.instanceof(Buffer),
	ocrText: z.string().max(10_000).optional(),
	analysisRevision: z.string().min(1).max(256).optional(),
	textExtractionEnabled: z.boolean(),
}).strict();

export type CaseLocationCandidatePipelineResultV1 = {
	schema: 'atlas.case-location-candidate-pipeline.v1';
	status: 'CANDIDATES' | 'NO_CANDIDATES' | 'SOURCE_HASH_MISMATCH' | 'INVALID_INPUT';
	sourceSha256: string | null;
	captureLocationCandidate: ExifCaptureLocationCandidateV1 | null;
	textMentionCandidates: CaseLocationTextCandidateV1[];
	confirmedCrimeLocation: null;
	confirmationRequired: true;
};

/**
 * Coordinates EXIF and 8095 text proposals against the exact stored original.
 * This is a candidate builder only: it never geocodes or confirms a crime location.
 */
export async function buildCaseLocationCandidatesV1(
	input: unknown,
): Promise<CaseLocationCandidatePipelineResultV1> {
	const parsed = inputSchema.safeParse(input);
	if (!parsed.success) {
		return {
			schema: 'atlas.case-location-candidate-pipeline.v1',
			status: 'INVALID_INPUT',
			sourceSha256: null,
			captureLocationCandidate: null,
			textMentionCandidates: [],
			confirmedCrimeLocation: null,
			confirmationRequired: true,
		};
	}

	const value = parsed.data;
	const sourceSha256 = createHash('sha256').update(value.originalBytes).digest('hex');
	if (sourceSha256 !== value.storedSourceSha256.toLowerCase()) {
		return {
			schema: 'atlas.case-location-candidate-pipeline.v1',
			status: 'SOURCE_HASH_MISMATCH',
			sourceSha256,
			captureLocationCandidate: null,
			textMentionCandidates: [],
			confirmedCrimeLocation: null,
			confirmationRequired: true,
		};
	}

	const capturePromise = extractExifCaptureLocationCandidateV1({
		caseId: value.caseId,
		evidenceId: value.evidenceId,
		mimeType: value.mimeType,
		bytes: value.originalBytes,
	});
	const textPromise = value.ocrText && value.analysisRevision
		? extractCaseLocationTextCandidatesV1({
			caseId: value.caseId,
			evidenceId: value.evidenceId,
			sourceSha256,
			analysisRevision: value.analysisRevision,
			text: value.ocrText,
			enabled: value.textExtractionEnabled,
		})
		: Promise.resolve({ ok: false as const, status: value.textExtractionEnabled ? 'INVALID_INPUT' as const : 'DISABLED' as const, candidates: [] });

	const [capture, text] = await Promise.all([capturePromise, textPromise]);
	const captureLocationCandidate = capture.status === 'CANDIDATE' ? capture.candidate : null;
	const textMentionCandidates = text.candidates;
	return {
		schema: 'atlas.case-location-candidate-pipeline.v1',
		status: captureLocationCandidate || textMentionCandidates.length ? 'CANDIDATES' : 'NO_CANDIDATES',
		sourceSha256,
		captureLocationCandidate,
		textMentionCandidates,
		confirmedCrimeLocation: null,
		confirmationRequired: true,
	};
}
