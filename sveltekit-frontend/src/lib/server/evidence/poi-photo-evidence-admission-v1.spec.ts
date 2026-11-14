// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/db/client.js', () => ({ db: {} }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_EVIDENCE_BUCKET: 'legal-evidence' } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ analysisJobs: {}, evidence: {} }));
vi.mock('$lib/server/analysis/analysis-jobs.js', () => ({
	ANALYSIS_JOBS_NOTIFY_CHANNEL: 'atlas_analysis_jobs',
	normalizeAnalysisJobPayload: (value: unknown) => value,
}));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: vi.fn() }));
vi.mock('$lib/server/seaweed-client.js', () => ({ uploadSeaweedFile: vi.fn() }));

import {
	admitPoiPhotoAsCaseEvidenceV1,
	type PoiPhotoEvidenceDepsV1,
	type PoiPhotoEvidenceInputV1,
} from './poi-photo-evidence-admission-v1.js';

const bytes = Buffer.from('poi-photo-fixture');
const sha = createHash('sha256').update(bytes).digest('hex');
const caseId = '33333333-3333-4333-8333-333333333333';
const poiId = '44444444-4444-4444-8444-444444444444';

function input(overrides: Partial<PoiPhotoEvidenceInputV1> = {}): PoiPhotoEvidenceInputV1 {
	return {
		poiId,
		poiName: 'Marcus Hale',
		poiPhotoId: '55555555-5555-4555-8555-555555555555',
		caseId,
		actorId: 7,
		fileName: 'hale.jpg',
		contentType: 'image/jpeg',
		bytes,
		...overrides,
	};
}

function deps(overrides: Partial<PoiPhotoEvidenceDepsV1> = {}) {
	const order: string[] = [];
	const built: PoiPhotoEvidenceDepsV1 = {
		authorizeCase: vi.fn(async () => { order.push('authorize'); return { id: caseId }; }),
		evidenceBucket: () => 'legal-evidence',
		findExisting: vi.fn(async () => { order.push('findExisting'); return null; }),
		putObject: vi.fn(async () => { order.push('putObject'); }),
		persist: vi.fn(async () => { order.push('persist'); return 'evidence-1'; }),
		newJobId: () => 'job-1',
		...overrides,
	};
	return { built, order };
}

describe('admitPoiPhotoAsCaseEvidenceV1', () => {
	it('authorizes, stores the bytes, then persists the evidence row and job, in that order', async () => {
		const { built, order } = deps();
		const result = await admitPoiPhotoAsCaseEvidenceV1(input(), built);

		expect(result).toEqual({ status: 'queued', evidenceId: 'evidence-1', jobId: 'job-1', sourceRevision: `sha256:${sha}` });
		expect(order).toEqual(['authorize', 'findExisting', 'putObject', 'persist']);
		expect(built.putObject).toHaveBeenCalledWith(expect.objectContaining({
			bucket: 'legal-evidence',
			objectKey: `evidence/${caseId}/poi-${poiId}-${sha}.jpg`,
			contentType: 'image/jpeg',
		}));
		expect(built.persist).toHaveBeenCalledWith(expect.objectContaining({
			jobId: 'job-1',
			caseId,
			actorId: 7,
			poiId,
			sourceRevision: `sha256:${sha}`,
			byteLength: bytes.length,
			objectKey: `evidence/${caseId}/poi-${poiId}-${sha}.jpg`,
		}));
	});

	it('does nothing when the person has no case', async () => {
		const { built, order } = deps();
		expect(await admitPoiPhotoAsCaseEvidenceV1(input({ caseId: null }), built)).toEqual({ status: 'no_case' });
		expect(order).toEqual([]);
	});

	it('stores and persists nothing when the uploader cannot access the case', async () => {
		const { built, order } = deps({ authorizeCase: vi.fn(async () => null) });
		expect(await admitPoiPhotoAsCaseEvidenceV1(input(), built)).toEqual({ status: 'case_not_accessible' });
		expect(order).toEqual([]);
		expect(built.putObject).not.toHaveBeenCalled();
		expect(built.persist).not.toHaveBeenCalled();
	});

	it('returns the existing evidence row for the same photo instead of creating a duplicate', async () => {
		const { built } = deps({ findExisting: vi.fn(async () => 'evidence-existing') });
		expect(await admitPoiPhotoAsCaseEvidenceV1(input(), built)).toEqual({
			status: 'already_registered',
			evidenceId: 'evidence-existing',
			sourceRevision: `sha256:${sha}`,
		});
		expect(built.putObject).not.toHaveBeenCalled();
		expect(built.persist).not.toHaveBeenCalled();
	});

	it('does not persist when storage fails, and reports the reason', async () => {
		const { built } = deps({ putObject: vi.fn().mockRejectedValue(new Error('SEAWEED_UNAVAILABLE')) });
		expect(await admitPoiPhotoAsCaseEvidenceV1(input(), built)).toEqual({ status: 'failed', reason: 'SEAWEED_UNAVAILABLE' });
		expect(built.persist).not.toHaveBeenCalled();
	});

	it('reports a database failure without throwing', async () => {
		const { built } = deps({ persist: vi.fn().mockRejectedValue(new Error('EVIDENCE_INSERT_FAILED_NO_ID')) });
		expect(await admitPoiPhotoAsCaseEvidenceV1(input(), built)).toEqual({ status: 'failed', reason: 'EVIDENCE_INSERT_FAILED_NO_ID' });
	});

	it('rejects unsupported types, empty files and a missing bucket before any side effect', async () => {
		const { built, order } = deps();
		expect(await admitPoiPhotoAsCaseEvidenceV1(input({ contentType: 'image/svg+xml' }), built))
			.toEqual({ status: 'failed', reason: 'UNSUPPORTED_IMAGE_TYPE' });
		expect(await admitPoiPhotoAsCaseEvidenceV1(input({ bytes: Buffer.alloc(0) }), built))
			.toEqual({ status: 'failed', reason: 'IMAGE_SIZE_OUT_OF_RANGE' });
		expect(order).toEqual([]);
		const noBucket = deps({ evidenceBucket: () => undefined });
		expect(await admitPoiPhotoAsCaseEvidenceV1(input(), noBucket.built))
			.toEqual({ status: 'failed', reason: 'EVIDENCE_BUCKET_NOT_CONFIGURED' });
		expect(noBucket.built.putObject).not.toHaveBeenCalled();
	});
});
