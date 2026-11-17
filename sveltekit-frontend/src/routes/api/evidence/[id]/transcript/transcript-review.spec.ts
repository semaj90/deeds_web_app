// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const SOURCE_HASH = 'a'.repeat(64);
const EVIDENCE_ID = '00000000-0000-4000-8000-0000000000aa';
const SEGMENT_ID = '00000000-0000-4000-8000-0000000000dd';

const mocks = vi.hoisted(() => ({
	whereConditions: [] as unknown[],
	updateValues: [] as Array<Record<string, unknown>>,
	evidenceRow: null as null | { id: string; caseId: string; hash: string; title?: string; tags?: string[]; aiSummary?: string | null; aiAnalysis?: unknown },
	selectCalls: 0,
	canonicalRows: [] as Array<Record<string, unknown>>,
	legacyRows: [] as Array<Record<string, unknown>>,
	gateEnabled: true,
}));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: new Proxy({}, { get: (_target, key) => (key === 'EVIDENCE_TRANSCRIPT_REVIEW_ENABLED' ? mocks.gateEnabled : undefined) }),
}));

vi.mock('$lib/server/db/client', () => {
	const db = {
		select: () => {
			const call = mocks.selectCalls++;
			if (call === 0) return {
				from: () => ({
					leftJoin: () => ({
						where: () => ({
							limit: async () => (mocks.evidenceRow ? [mocks.evidenceRow] : []),
						}),
					}),
				}),
			};
			if (call === 1) return {
				from: () => ({
					innerJoin: () => ({
						where: () => ({ orderBy: async () => mocks.canonicalRows }),
					}),
				}),
			};
			return {
				from: () => ({
					where: () => ({ orderBy: async () => mocks.legacyRows }),
				}),
			};
		},
		update: () => ({
			set: (values: Record<string, unknown>) => {
				mocks.updateValues.push(values);
				return {
				where: (condition: unknown) => ({
					returning: async () => {
						mocks.whereConditions.push(condition);
						return [{ id: SEGMENT_ID }];
					},
				}),
				};
			},
		}),
	};
	return { db };
});

import { GET, POST } from './+server';

const dialect = new PgDialect();

function reviewRequest(body: unknown): Request {
	return new Request(`http://localhost/api/evidence/${EVIDENCE_ID}/transcript`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

describe('transcript review POST (canonical whisper_segments path)', () => {
	beforeEach(() => {
		mocks.whereConditions.length = 0;
		mocks.updateValues.length = 0;
		mocks.selectCalls = 0;
		mocks.canonicalRows = [];
		mocks.legacyRows = [];
		mocks.evidenceRow = { id: EVIDENCE_ID, caseId: '00000000-0000-4000-8000-0000000000bb', hash: SOURCE_HASH, title: 'Interview' };
		mocks.gateEnabled = true;
	});

	it('prefers canonical source-bound transcript rows over legacy rows', async () => {
		mocks.canonicalRows = [{
			id: SEGMENT_ID, startMs: 1000, endMs: 2100, text: 'canonical speech', language: 'en', translatedText: null,
			speaker: 'spk_01', confidence: 0.91, model: 'faster-whisper', metadataJson: { sourceRevision: `sha256:${SOURCE_HASH}`, analysisRevision: 'analysis-v1', speakerId: 'spk_01', words: [{ startMs: 1020, endMs: 1330, text: 'canonical' }, { startMs: 1340, endMs: 1800, text: 'speech' }, { startMs: 900, endMs: 1100, text: 'out-of-range' }] },
		}];
		mocks.legacyRows = [{
			id: '00000000-0000-4000-8000-0000000000ee', startMs: 1000, endMs: 2100, text: 'legacy speech', language: 'en', translatedText: null,
			speaker: null, confidence: 0.5, model: 'legacy', metadataJson: { source_revision: `sha256:${SOURCE_HASH}` },
		}];
		const response = await GET({
			params: { id: EVIDENCE_ID },
			locals: { user: { id: '7' } },
			url: new URL(`http://localhost/api/evidence/${EVIDENCE_ID}/transcript`),
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			segments: [{ id: SEGMENT_ID, text: 'canonical speech', speakerId: 'spk_01', sourceRevision: `sha256:${SOURCE_HASH}`, words: [{ startMs: 1020, endMs: 1330, text: 'canonical' }, { startMs: 1340, endMs: 1800, text: 'speech' }] }],
		});
	});

	it('does not expose human-name speaker labels as model identity', async () => {
		mocks.canonicalRows = [{
			id: SEGMENT_ID, startMs: 1000, endMs: 2100, text: 'speech', language: 'en', translatedText: null,
			speaker: 'Detective Miller', confidence: 0.91, model: 'faster-whisper', metadataJson: { sourceRevision: `sha256:${SOURCE_HASH}` },
		}];
		const response = await GET({
			params: { id: EVIDENCE_ID },
			locals: { user: { id: '7' } },
			url: new URL(`http://localhost/api/evidence/${EVIDENCE_ID}/transcript`),
		} as never);

		expect((await response.json()).segments[0].speakerId).toBeNull();
	});

	it('updates the canonical row and filters it only by whisper_segments columns', async () => {
		const response = await POST({
			params: { id: EVIDENCE_ID },
			locals: { user: { id: '7' } },
			request: reviewRequest({ segmentId: SEGMENT_ID, reviewStatus: 'approved' }),
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ ok: true, segmentId: SEGMENT_ID, reviewStatus: 'approved' });
		expect(mocks.whereConditions).toHaveLength(1);
		const compiled = dialect.sqlToQuery(mocks.whereConditions[0] as never);
		// Regression: the filter once referenced evidence_transcript_segments, which made every review fail with
		// "missing FROM-clause entry" in PostgreSQL before the legacy path could run.
		expect(compiled.sql).not.toContain('evidence_transcript_segments');
		expect(compiled.sql).toContain('"whisper_segments"."id"');
	});

	it('stores a reviewer correction separately from the original model transcript', async () => {
		const correctedText = 'The witness entered the corridor.';
		const response = await POST({
			params: { id: EVIDENCE_ID },
			locals: { user: { id: '7' } },
			request: reviewRequest({ segmentId: SEGMENT_ID, reviewStatus: 'approved', correctedText }),
		} as never);

		expect(response.status).toBe(200);
		expect(mocks.updateValues[0].text).toBe(correctedText);
		const metadata = dialect.sqlToQuery(mocks.updateValues[0].metadata as never);
		expect(metadata.sql).toContain('modelText');
		expect(metadata.sql).toContain('whisper_segments"."text');
	});

	it('refuses every review write while the operator gate is off', async () => {
		mocks.gateEnabled = false;
		const response = await POST({
			params: { id: EVIDENCE_ID },
			locals: { user: { id: '7' } },
			request: reviewRequest({ segmentId: SEGMENT_ID, reviewStatus: 'approved' }),
		} as never);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: 'TRANSCRIPT_REVIEW_DISABLED' });
		expect(mocks.whereConditions).toHaveLength(0);
	});

	it('rejects a review payload that is not strictly valid', async () => {
		const response = await POST({
			params: { id: EVIDENCE_ID },
			locals: { user: { id: '7' } },
			request: reviewRequest({ segmentId: SEGMENT_ID, reviewStatus: 'approved', extra: true }),
		} as never);
		expect(response.status).toBe(400);
		expect(mocks.whereConditions).toHaveLength(0);
	});

	it('rejects corrections that are not marked approved', async () => {
		const response = await POST({
			params: { id: EVIDENCE_ID },
			locals: { user: { id: '7' } },
			request: reviewRequest({ segmentId: SEGMENT_ID, reviewStatus: 'rejected', correctedText: 'Corrected words.' }),
		} as never);
		expect(response.status).toBe(400);
		expect(mocks.updateValues).toHaveLength(0);
	});

	it('returns 404 when the caller cannot see the evidence', async () => {
		mocks.evidenceRow = null;
		const response = await POST({
			params: { id: EVIDENCE_ID },
			locals: { user: { id: '7' } },
			request: reviewRequest({ segmentId: SEGMENT_ID, reviewStatus: 'approved' }),
		} as never);
		expect(response.status).toBe(404);
		expect(mocks.whereConditions).toHaveLength(0);
	});
});
