import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { analyzeEvidenceImageV1, type EvidenceVisualAnalysisDependenciesV1 } from './evidence-visual-analysis-v1.js';
import { createSam2SilhouetteStageFromEnvV1 } from './sam2-production-deps-v1.js';

const evidenceId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';

async function fixtureImage() {
	const buffer = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#888888' } }).png().toBuffer();
	return {
		evidenceId, caseId, fileName: 'fixture.png', contentType: 'image/png' as const, buffer,
		sourceRevision: `sha256:${createHash('sha256').update(buffer).digest('hex')}`,
	};
}

function deps(overrides: Partial<EvidenceVisualAnalysisDependenciesV1> = {}): EvidenceVisualAnalysisDependenciesV1 {
	return {
		runPipeline: vi.fn(async () => ({
			yolo: {
				objects: [{ class: 'person', confidence: 0.9, bbox: [20, 10, 120, 80] }],
				layout: { regions: [] },
			},
			yoloCacheHit: false, llmSynthesis: null, llmEscalated: false, graphConnectionsCreated: 0,
			cachedToDb: false, tags: [], processingTimeMs: 1,
			detector: { source: 'test', errors: [] },
		})) as never,
		analyzeVlm: vi.fn(async () => ({ available: false, model: 'none', unavailableReason: 'test' })) as never,
		getDepthConfig: () => null,
		fetchDepth: vi.fn(async () => ({})),
		uploadDepth: vi.fn(async () => {}),
		...overrides,
	};
}

const mask = {
	artifactKind: 'sam2_alpha_silhouette' as const, maskObjectKey: 'derived/sam2/x.png', maskSha256: 'a'.repeat(64),
	targetBoxIndex: 0, label: 'person', iouScore: 0.9, is3DReconstruction: false as const,
};

describe('visual analysis SAM 2 stage', () => {
	it('passes normalized source-pixel boxes to the stage and records its masks', async () => {
		const runSam2Silhouettes = vi.fn(async () => ({ status: 'EXECUTED' as const, masks: [mask] }));
		const result = await analyzeEvidenceImageV1(await fixtureImage(), deps({ runSam2Silhouettes }));
		expect(runSam2Silhouettes).toHaveBeenCalledTimes(1);
		const call = runSam2Silhouettes.mock.calls[0] as unknown as [{ boxes: Array<{ bboxNormalized: number[] }>; mimeType: string }];
		expect(call[0].mimeType).toBe('image/png');
		expect(call[0].boxes[0]!.bboxNormalized).toEqual([0.1, 0.1, 0.6, 0.8]);
		expect(result.silhouettes).toEqual([mask]);
		expect(result.stageErrors.some((e) => e.startsWith('silhouette:'))).toBe(false);
	});

	it('omits the silhouettes field entirely when no SAM 2 dependency is supplied', async () => {
		const result = await analyzeEvidenceImageV1(await fixtureImage(), deps());
		expect('silhouettes' in result).toBe(false);
	});

	it('records a failed SAM 2 stage without dropping the other stages', async () => {
		const result = await analyzeEvidenceImageV1(await fixtureImage(),
			deps({ runSam2Silhouettes: async () => ({ status: 'FAILED' as const, masks: [] }) }));
		expect(result.stageErrors).toContain('silhouette:SAM2_FAILED');
		expect('silhouettes' in result).toBe(false);
		expect(result.objectDetections).toHaveLength(1);
	});

	it('records a thrown SAM 2 error as a bounded stage error', async () => {
		const result = await analyzeEvidenceImageV1(await fixtureImage(),
			deps({ runSam2Silhouettes: async () => { throw new Error('SAM2_RUNNER_TIMEOUT'); } }));
		expect(result.stageErrors).toContain('silhouette:SAM2_RUNNER_TIMEOUT');
	});
});

describe('SAM 2 production dependency gating', () => {
	it('is undefined unless SAM2_ENABLED is exactly 1', () => {
		expect(createSam2SilhouetteStageFromEnvV1({})).toBeUndefined();
		expect(createSam2SilhouetteStageFromEnvV1({ SAM2_ENABLED: 'true' })).toBeUndefined();
	});

	it('fails closed on partial configuration when enabled', () => {
		expect(() => createSam2SilhouetteStageFromEnvV1({ SAM2_ENABLED: '1' })).toThrow('SAM2_CONFIG_MISSING:SAM2_PYTHON');
		expect(() => createSam2SilhouetteStageFromEnvV1({
			SAM2_ENABLED: '1', SAM2_PYTHON: 'p', SAM2_CONFIG: 'c', SAM2_CHECKPOINT: 'k',
		})).toThrow('SAM2_CONFIG_MISSING:SAM2_ARTIFACT_BUCKET');
	});

	it('builds a stage when fully configured, without running anything', () => {
		const stage = createSam2SilhouetteStageFromEnvV1({
			SAM2_ENABLED: '1', SAM2_PYTHON: 'p', SAM2_CONFIG: 'c', SAM2_CHECKPOINT: 'k', SAM2_ARTIFACT_BUCKET: 'atlas-artifacts',
		});
		expect(typeof stage).toBe('function');
	});
});
