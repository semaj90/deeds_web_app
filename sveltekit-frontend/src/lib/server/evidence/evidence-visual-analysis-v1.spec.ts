import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { analyzeEvidenceImageV1, type EvidenceVisualAnalysisDependenciesV1 } from './evidence-visual-analysis-v1.js';

const evidenceId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';

function createInput(buffer = Buffer.from('image-fixture')) {
	return {
		evidenceId,
		caseId,
		fileName: 'fixture.png',
		contentType: 'image/png',
		buffer,
		sourceRevision: `sha256:${createHash('sha256').update(buffer).digest('hex')}`,
	};
}

function createDependencies(overrides: Partial<EvidenceVisualAnalysisDependenciesV1> = {}): EvidenceVisualAnalysisDependenciesV1 {
	return {
		runPipeline: vi.fn(async () => ({
			yolo: {
				objects: [{ class: 'document', confidence: 0.98, bbox: [1, 2, 3, 4] }],
				layout: { regions: [{ type: 'signature', confidence: 0.9, bbox: [5, 6, 7, 8] }] },
			},
			yoloCacheHit: false,
			llmSynthesis: null,
			llmEscalated: false,
			graphConnectionsCreated: 0,
			cachedToDb: false,
			tags: ['detected:document'],
			processingTimeMs: 3,
		})),
		analyzeVlm: vi.fn(async () => ({
			summary: 'Image summary',
			keyFindings: ['Signature present'],
			suggestedTags: ['signature'],
			model: 'fixture-vlm',
			cached: false,
			resizeMeta: { resized: false, originalWidth: 10, originalHeight: 10, vlmSize: 10 },
		})),
		getDepthConfig: vi.fn(() => ({ endpoint: 'https://depth.invalid', bucket: 'legal-evidence' })),
		fetchDepth: vi.fn(async () => ({ depth_base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString('base64'), width: 10, height: 10, processing_time_ms: 5 })),
		uploadDepth: vi.fn(async () => {}),
		...overrides,
	};
}

describe('analyzeEvidenceImageV1', () => {
	it('validates and returns source-bound detection, VLM, and depth metadata', async () => {
		const dependencies = createDependencies();
		const result = await analyzeEvidenceImageV1(createInput(), dependencies);

		expect(result.status).toBe('COMPLETE');
		expect(result.sourceRevision).toBe(createInput().sourceRevision);
		expect(result.objectDetections[0]?.class).toBe('document');
		expect(result.visionFindings).toEqual(['Signature present']);
		expect(result.depthMap?.objectKey).toBe(`evidence/${caseId}/${evidenceId}-depth.png`);
		expect(dependencies.runPipeline).toHaveBeenCalledTimes(1);
		expect(dependencies.uploadDepth).toHaveBeenCalledTimes(1);
	});

	it('rejects a source digest mismatch before invoking any analyzer', async () => {
		const dependencies = createDependencies();
		await expect(analyzeEvidenceImageV1({ ...createInput(), sourceRevision: `sha256:${'0'.repeat(64)}` }, dependencies))
			.rejects.toThrow('EVIDENCE_VISUAL_SOURCE_REVISION_MISMATCH');
		expect(dependencies.runPipeline).not.toHaveBeenCalled();
	});

	it('rejects invalid identity, MIME, and oversized image buffers', async () => {
		const dependencies = createDependencies();
		await expect(analyzeEvidenceImageV1({ ...createInput(), evidenceId: 'not-a-uuid' }, dependencies))
			.rejects.toThrow('EVIDENCE_VISUAL_INPUT_INVALID');
		await expect(analyzeEvidenceImageV1({ ...createInput(), contentType: 'image/svg+xml' }, dependencies))
			.rejects.toThrow('EVIDENCE_VISUAL_INPUT_INVALID');
		await expect(analyzeEvidenceImageV1(createInput(Buffer.alloc(32 * 1024 * 1024 + 1)), dependencies))
			.rejects.toThrow('EVIDENCE_VISUAL_INPUT_INVALID');
	});

	it('reports provider failures as partial results without fabricating detections', async () => {
		const dependencies = createDependencies({
			runPipeline: vi.fn().mockRejectedValue(new Error('detector unavailable')),
			analyzeVlm: vi.fn().mockRejectedValue(new Error('VLM unavailable')),
			fetchDepth: vi.fn().mockRejectedValue(new Error('depth unavailable')),
		});
		const result = await analyzeEvidenceImageV1(createInput(), dependencies);

		expect(result.status).toBe('UNAVAILABLE');
		expect(result.objectDetections).toEqual([]);
		expect(result.visionSummary).toBeNull();
		expect(result.stageErrors).toHaveLength(3);
	});

	it('rejects malformed detector responses and records other successful stages', async () => {
		const dependencies = createDependencies({
			runPipeline: vi.fn().mockResolvedValue({ yolo: { objects: [{ class: 'bad', confidence: 2, bbox: [1] }], layout: { regions: [] } } }),
			fetchDepth: vi.fn().mockRejectedValue(new Error('depth unavailable')),
		});
		const result = await analyzeEvidenceImageV1(createInput(), dependencies);

		expect(result.status).toBe('PARTIAL');
		expect(result.objectDetections).toEqual([]);
		expect(result.visionSummary).toBe('Image summary');
		expect(result.stageErrors).toContain('detection:RESULT_SCHEMA_INVALID');
	});
});
