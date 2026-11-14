import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	from: vi.fn(),
	leftJoin: vi.fn(),
	where: vi.fn(),
	limit: vi.fn(),
	execute: vi.fn(),
	sources: [] as Array<Record<string, unknown>>,
}));

vi.mock('$lib/server/db/client', () => ({
	db: { select: (...args: unknown[]) => mocks.select(...args), execute: (...args: unknown[]) => mocks.execute(...args) },
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

function event(userId: string | null = '7') {
	return {
		params: { id: EVIDENCE_ID },
		locals: { user: userId ? { id: userId } : null },
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
		mocks.execute.mockResolvedValue({ rows: [{
			source_revision: SOURCE_REVISION,
			analysis_revision: 'analysis-r1',
			model: 'embeddinggemma2:q8',
			model_artifact_sha256: `sha256:${'b'.repeat(64)}`,
			preprocessing_revision: 'image-preprocess-r1',
			source_locator: { kind: 'whole_image', coordinateSpace: 'original_pixels', width: 100, height: 200 },
			metadata: { visualAnalysis: currentAnalysis(), modelOutputReviewState: 'UNREVIEWED_PROPOSAL' },
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
		});
		expect(payload).not.toHaveProperty('embedding');
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
