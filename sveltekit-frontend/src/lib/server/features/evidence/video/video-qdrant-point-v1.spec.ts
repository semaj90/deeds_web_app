import { describe, expect, it } from 'vitest';
import { buildVideoTranscriptPointV1 } from './video-qdrant-point-v1.js';

const common = {
	evidenceId: '11111111-1111-4111-8111-111111111111',
	caseId: '22222222-2222-4222-8222-222222222222',
	sourceRevisionHex: 'a'.repeat(64),
	chunkIndex: 0,
	startMs: 1200,
	endMs: 2400,
	text: 'Grounded transcript segment',
	language: 'en',
	model: 'whisper-model-revision',
	vector: Array.from({ length: 768 }, (_, index) => index / 768),
	sourceUri: 'seaweedfs://evidence/video.mp4',
};

describe('buildVideoTranscriptPointV1', () => {
	it('builds a deterministic Qdrant UUID and revision-bound transcript payload', () => {
		const first = buildVideoTranscriptPointV1(common);
		const second = buildVideoTranscriptPointV1(common);

		expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
		expect(first.id).toBe(second.id);
		expect(first.payload).toMatchObject({
			evidence_id: common.evidenceId,
			case_id: common.caseId,
			chunk_id: `${common.evidenceId}:sha256:${common.sourceRevisionHex}:0`,
			source_revision: `sha256:${common.sourceRevisionHex}`,
			start_ms: common.startMs,
			end_ms: common.endMs,
			model: common.model,
		});
	});

	it('changes the point identity when the source revision changes', () => {
		const changed = buildVideoTranscriptPointV1({ ...common, sourceRevisionHex: 'b'.repeat(64) });
		expect(changed.id).not.toBe(buildVideoTranscriptPointV1(common).id);
	});

	it('rejects malformed spans and embeddings before indexing', () => {
		expect(() => buildVideoTranscriptPointV1({ ...common, endMs: 1000 })).toThrow('valid time span');
		expect(() => buildVideoTranscriptPointV1({ ...common, vector: [0, 1] })).toThrow('768 finite values');
	});
});
