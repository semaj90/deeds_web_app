import { describe, expect, it, vi } from 'vitest';
import { loadCanonicalStoredEvidenceImageAnalysis } from './evidence-image-tools.js';

const evidenceId = '22222222-2222-4222-8222-222222222222';
const sourceRevision = `sha256:${'a'.repeat(64)}`;

describe('canonical saved image analysis readback', () => {
	it('loads source-coordinate detections and provenance from the authorized readback route', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({
			success: true,
			status: 'CURRENT',
			sourceRevision,
			analysisRevision: 'image-analysis-r1',
			model: 'embeddinggemma2:q8',
			preprocessingRevision: 'sharp-vlm-2048-v1',
			reviewState: 'UNREVIEWED_PROPOSAL',
			analysis: {
				schema: 'atlas.evidence-visual-analysis.v1',
				sourceRevision,
				status: 'PARTIAL',
				objectDetections: [
					{ class: 'vehicle', confidence: 0.91, bbox: [10, 20, 80, 100] },
					{ class: 'bad-box', confidence: 0.4, bbox: [20, 20, 10, 10] },
				],
				visionSummary: 'A vehicle appears in the image.',
				visionFindings: ['Vehicle visible'],
				visionTags: ['vehicle'],
				stageErrors: ['vision:VLM_UNREACHABLE'],
			},
		}), { status: 200, headers: { 'content-type': 'application/json' } }));

		const result = await loadCanonicalStoredEvidenceImageAnalysis(evidenceId, fetcher as typeof fetch);

		expect(fetcher).toHaveBeenCalledWith(`/api/evidence/${evidenceId}/multimodal-analysis`, expect.objectContaining({ method: 'GET', cache: 'no-store' }));
		expect(result).toMatchObject({ status: 'CURRENT', analysis: {
			sourceRevision,
			analysisRevision: 'image-analysis-r1',
			reviewState: 'UNREVIEWED_PROPOSAL',
			embeddingModel: 'embeddinggemma2:q8',
			detectorStatus: 'completed',
			vlmStatus: 'unavailable',
			boxes: [{ x: 10, y: 20, w: 70, h: 80, label: 'vehicle', conf: 0.91 }],
			analysis: { summary: 'A vehicle appears in the image.', keyFindings: ['Vehicle visible'], suggestedTags: ['vehicle'] },
		} });
	});

	it('does not expose stale observations as current', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, status: 'STALE', analysis: null }), { status: 200 }));
		expect(await loadCanonicalStoredEvidenceImageAnalysis(evidenceId, fetcher as typeof fetch)).toMatchObject({
			status: 'STALE', analysis: null,
		});
	});

	it('surfaces a clear state while the schema candidate is not installed', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: false, status: 'STORE_UNAVAILABLE', error: 'CANONICAL_IMAGE_ANALYSIS_STORE_UNAVAILABLE' }), { status: 503 }));
		expect(await loadCanonicalStoredEvidenceImageAnalysis(evidenceId, fetcher as typeof fetch)).toMatchObject({
			status: 'STORE_UNAVAILABLE', analysis: null,
			message: 'Saved analysis storage is not available yet.',
		});
	});
});
