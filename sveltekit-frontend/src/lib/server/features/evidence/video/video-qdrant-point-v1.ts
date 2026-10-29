import crypto from 'node:crypto';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';

export interface VideoTranscriptPointInputV1 {
	evidenceId: string;
	caseId: string;
	sourceRevisionHex: string;
	chunkIndex: number;
	startMs: number;
	endMs: number;
	text: string;
	language: string;
	model: string;
	vector: number[];
	sourceUri: string;
}

export function buildVideoTranscriptPointV1(input: VideoTranscriptPointInputV1) {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.evidenceId)) {
		throw new Error('Video transcript point requires a UUID evidence ID');
	}
	if (!Number.isSafeInteger(input.chunkIndex) || input.chunkIndex < 0) {
		throw new Error('Video transcript point requires a non-negative chunk index');
	}
	if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs) || input.endMs < input.startMs) {
		throw new Error('Video transcript point requires a valid time span');
	}
	if (input.vector.length !== 768 || input.vector.some((value) => !Number.isFinite(value))) {
		throw new Error('Video transcript embedding must contain 768 finite values');
	}

	const sourceRevision = formatEvidenceSourceRevisionV1(input.sourceRevisionHex);
	const namespace = Buffer.from(input.evidenceId.replaceAll('-', ''), 'hex');
	const name = `${sourceRevision}:${input.chunkIndex}:${input.startMs}:${input.endMs}`;
	const digest = crypto.createHash('sha1').update(namespace).update(name).digest().subarray(0, 16);
	digest[6] = (digest[6] & 0x0f) | 0x50;
	digest[8] = (digest[8] & 0x3f) | 0x80;
	const idHex = digest.toString('hex');
	const pointId = `${idHex.slice(0, 8)}-${idHex.slice(8, 12)}-${idHex.slice(12, 16)}-${idHex.slice(16, 20)}-${idHex.slice(20)}`;

	return {
		id: pointId,
		vector: { content: input.vector },
		payload: {
			evidence_id: input.evidenceId,
			case_id: input.caseId,
			modality: 'video' as const,
			view: 'transcript_segment' as const,
			chunk_id: `${input.evidenceId}:${sourceRevision}:${input.chunkIndex}`,
			source_revision: sourceRevision,
			start_ms: input.startMs,
			end_ms: input.endMs,
			language: input.language,
			text: input.text,
			source_uri: input.sourceUri,
			trust_tier: 'transcript_candidate' as const,
			tags: ['transcript'],
			entities: [],
			model: input.model,
		},
	};
}
