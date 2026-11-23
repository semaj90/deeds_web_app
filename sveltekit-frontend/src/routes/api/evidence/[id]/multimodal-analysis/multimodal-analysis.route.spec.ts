import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	from: vi.fn(),
	leftJoin: vi.fn(),
	where: vi.fn(),
	limit: vi.fn(),
	execute: vi.fn(),
	getMask: vi.fn(),
	sources: [] as Array<Record<string, unknown>>,
}));

vi.mock('$lib/server/db/client', () => ({
	db: { select: (...args: unknown[]) => mocks.select(...args), execute: (...args: unknown[]) => mocks.execute(...args) },
}));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_ARTIFACTS_BUCKET: 'atlas-artifacts' } }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ getFileFromSeaweed: mocks.getMask }));
vi.mock('$lib/server/storage/storage-buckets.js', () => ({
	storageBuckets: { artifacts: 'atlas-artifacts' },
	assertArtifactBucket(bucket: string) {
		if (bucket !== 'atlas-artifacts') throw new Error('Unexpected artifact bucket');
	},
}));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'cases.id', userId: 'cases.userId', assignedAttorney: 'cases.assignedAttorney' },
	evidence: {
		id: 'evidence.id', caseId: 'evidence.caseId', hash: 'evidence.hash', deletedAt: 'evidence.deletedAt',
		userId: 'evidence.userId', uploadedBy: 'evidence.uploadedBy',
	},
}));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('drizzle-orm', () => ({
	and: (...conditions: unknown[]) => ({ and: conditions }),
	eq: (...fields: unknown[]) => ({ eq: fields }),
	isNotNull: (...fields: unknown[]) => ({ isNotNull: fields }),
	isNull: (...fields: unknown[]) => ({ isNull: fields }),
	or: (...conditions: unknown[]) => ({ or: conditions }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
}));

import { GET } from './+server.js';

const EVIDENCE_ID = '22222222-2222-4222-8222-222222222222';
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_REVISION = `sha256:${'a'.repeat(64)}`;

function event(userId: string | null = '7', query?: Record<string, string>) {
	const url = new URL(`https://example.test/api/evidence/${EVIDENCE_ID}/multimodal-analysis`);
	if (query) url.search = new URLSearchParams(query).toString();
	return {
		params: { id: EVIDENCE_ID },
		locals: { user: userId ? { id: userId } : null },
		url,
	} as never;
}

function currentAnalysis() {
	return {
		schema: 'atlas.evidence-visual-analysis.v1',
		authority: 'OBSERVATION_ONLY',
		sourceRevision: SOURCE_REVISION,
		status: 'PARTIAL',
		objectDetections: [{ class: 'vehicle', confidence: 0.92, bbox: [10, 20, 50, 70] }],
		layoutRegions: [],
		visionSummary: null,
		visionFindings: [],
		visionTags: [],
		depthMap: null,
		stageErrors: ['vision:VLM_UNAVAILABLE'],
	};
}

describe('GET /api/evidence/[id]/multimodal-analysis', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ leftJoin: mocks.leftJoin });
		mocks.leftJoin.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.limit.mockImplementation(async () => mocks.sources);
	});

	it('requires sign-in and does not query evidence for anonymous requests', async () => {
		const response = await GET(event(null));
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ success: false, status: 'ERROR', analysis: null, error: 'UNAUTHORIZED' });
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it('hides absent and unauthorized evidence before querying analysis rows', async () => {
		mocks.sources = [];
		const response = await GET(event());
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ success: false, status: 'ERROR', error: 'EVIDENCE_NOT_FOUND' });
		expect(mocks.execute).not.toHaveBeenCalled();
	});

	it('returns source-bound saved observations and model provenance without exposing the vector', async () => {
		mocks.sources = [{ id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_REVISION }];
		mocks.execute.mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [{
			source_revision: SOURCE_REVISION,
			analysis_revision: 'analysis-r1',
			model: 'embeddinggemma2:q8',
			model_artifact_sha256: `sha256:${'b'.repeat(64)}`,
			preprocessing_revision: 'image-preprocess-r1',
			source_locator: { kind: 'whole_image', coordinateSpace: 'original_pixels', width: 100, height: 200 },
			metadata: {
				visualAnalysis: currentAnalysis(),
				modelOutputReviewState: 'UNREVIEWED_PROPOSAL',
				imageDerivatives: { thumbnail: {
					kind: 'thumbnail', sourceRevision: SOURCE_REVISION,
					objectKey: `evidence/${CASE_ID}/${EVIDENCE_ID}/${'a'.repeat(64)}/thumbnail-${'d'.repeat(64)}.jpg`,
					bucket: 'atlas-artifacts', mimeType: 'image/jpeg', outputSha256: 'd'.repeat(64),
					width: 256, height: 256, preprocessingRevision: 'atlas.thumbnail.v1',
				} },
			},
		}] });

		const response = await GET(event());
		const payload = await response.json();
		expect(response.status).toBe(200);
		expect(payload).toMatchObject({
			success: true,
			status: 'CURRENT',
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			sourceRevision: SOURCE_REVISION,
			sourceDimensions: { width: 100, height: 200 },
			analysisRevision: 'analysis-r1',
			model: 'embeddinggemma2:q8',
			reviewState: 'UNREVIEWED_PROPOSAL',
			analysis: { objectDetections: [{ class: 'vehicle' }] },
			derivatives: { thumbnail: { sourceRevision: SOURCE_REVISION, bucket: 'atlas-artifacts', outputSha256: 'd'.repeat(64), width: 256, height: 256 } },
		});
		expect(payload).not.toHaveProperty('embedding');
		const analysisQuery = mocks.execute.mock.calls[0]?.[0] as { strings?: string[] } | undefined;
		expect(analysisQuery?.strings?.join('')).toContain("source_locator->>'kind' = 'whole_image'");
	});

	it('marks an analysis from an older source revision stale and withholds its observations', async () => {
		mocks.sources = [{ id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_REVISION }];
		mocks.execute.mockResolvedValue({ rows: [{
			source_revision: `sha256:${'c'.repeat(64)}`,
			analysis_revision: 'analysis-old',
			model: 'embeddinggemma2:q8',
			metadata: { visualAnalysis: currentAnalysis() },
		}] });

		const response = await GET(event());
		expect(await response.json()).toMatchObject({ status: 'STALE', sourceRevision: SOURCE_REVISION, analysis: null });
	});

	it('serves only the verified mask for the exact detection and authorized image revision', async () => {
		const bytes = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#ffffff' } })
			.greyscale().png().toBuffer();
		const hash = createHash('sha256').update(bytes).digest('hex');
		const objectKey = `derived/sam2/${hash}.png`;
		mocks.sources = [{ id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_REVISION }];
		const imageRow = {
			source_revision: SOURCE_REVISION, analysis_revision: 'analysis-r1', model: 'embedding-model',
			source_locator: { kind: 'whole_image', coordinateSpace: 'original_pixels', width: 100, height: 200 },
			metadata: { visualAnalysis: {
				...currentAnalysis(), detectionExecuted: true, silhouetteStageStatus: 'EXECUTED',
				objectDetections: [
					{ class: 'person', confidence: 0.25, bbox: [1, 2, 10, 20] },
					{ class: 'person', confidence: 0.7, bbox: [20, 20, 50, 50] },
					{ class: 'person', confidence: 0.95, bbox: [50, 60, 90, 170] },
				],
				silhouettes: [
					{ artifactKind: 'sam2_alpha_silhouette', maskObjectKey: objectKey, maskSha256: hash,
						targetBoxIndex: 0, label: 'person', iouScore: 0.8, is3DReconstruction: false },
					{ artifactKind: 'sam2_alpha_silhouette', maskObjectKey: objectKey, maskSha256: hash,
						targetBoxIndex: 1, sourceDetectionIndex: 2, label: 'person', iouScore: 0.8, is3DReconstruction: false },
					{ artifactKind: 'sam2_alpha_silhouette', maskObjectKey: 'evidence/unrelated.png', maskSha256: hash,
						targetBoxIndex: 1, sourceDetectionIndex: 1, label: 'person', iouScore: 0.8, is3DReconstruction: false },
				],
			} },
		};
		mocks.execute.mockResolvedValue({ rows: [imageRow] })
			.mockResolvedValueOnce({ rows: [imageRow] }).mockResolvedValueOnce({ rows: [] });
		const metadata = await GET(event());
		const { storybook } = await metadata.json();
		expect(storybook).toMatchObject({ detectionCoverage: 'RECORDED', maskCoverage: 'RECORDED', unresolvedMaskCount: 2 });
		expect(storybook.masks).toEqual([expect.objectContaining({
			artifactSha256: `sha256:${hash}`, detectionObservationId: storybook.detections[2].observationId, modelRevision: null,
		})]);
		expect(storybook.detections[2].modelRevision).toBeNull();
		expect(JSON.stringify(storybook)).not.toContain(objectKey);
		const query = {
			maskObservation: storybook.masks[0].observationId, sourceRevision: SOURCE_REVISION,
			analysisRevision: 'analysis-r1', observationRevision: storybook.observationRevision,
		};
		expect((await GET(event(null, query))).status).toBe(401);
		const stale = await GET(event('7', { ...query, observationRevision: `sha256:${'f'.repeat(64)}` }));
		expect(stale.status).toBe(409);
		expect(mocks.getMask).not.toHaveBeenCalled();

		mocks.getMask.mockResolvedValueOnce(bytes).mockResolvedValueOnce(Buffer.from('not the saved mask'));
		const mask = await GET(event('7', query));
		expect(mask.status).toBe(200);
		expect(mask.headers.get('content-type')).toBe('image/png');
		expect(mask.headers.get('x-artifact-sha256')).toBe(`sha256:${hash}`);
		expect(Buffer.from(await mask.arrayBuffer())).toEqual(bytes);
		expect(mocks.getMask).toHaveBeenLastCalledWith({ bucket: 'atlas-artifacts', objectKey, maximumBytes: 12 * 1024 * 1024 });
		const corrupt = await GET(event('7', query));
		expect(corrupt.status).toBe(409);
		expect(await corrupt.json()).toMatchObject({ error: 'MASK_ARTIFACT_CHECKSUM_MISMATCH' });
	});

	it('returns a stable unavailable shape until the candidate schema is installed', async () => {
		mocks.sources = [{ id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_REVISION }];
		mocks.execute.mockRejectedValue(new Error('relation does not exist'));

		const response = await GET(event());
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			success: false,
			status: 'STORE_UNAVAILABLE',
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			sourceRevision: SOURCE_REVISION,
			analysis: null,
			error: 'CANONICAL_IMAGE_ANALYSIS_STORE_UNAVAILABLE',
		});
	});
});
