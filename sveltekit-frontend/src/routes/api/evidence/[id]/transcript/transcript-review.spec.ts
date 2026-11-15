// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const SOURCE_HASH = 'a'.repeat(64);
const EVIDENCE_ID = '00000000-0000-4000-8000-0000000000aa';
const SEGMENT_ID = '00000000-0000-4000-8000-0000000000dd';

const mocks = vi.hoisted(() => ({
	whereConditions: [] as unknown[],
	evidenceRow: null as null | { id: string; caseId: string; hash: string },
	gateEnabled: true,
}));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: new Proxy({}, { get: (_target, key) => (key === 'EVIDENCE_TRANSCRIPT_REVIEW_ENABLED' ? mocks.gateEnabled : undefined) }),
}));

vi.mock('$lib/server/db/client', () => {
	const db = {
		select: () => ({
			from: () => ({
				leftJoin: () => ({
					where: () => ({
						limit: async () => (mocks.evidenceRow ? [mocks.evidenceRow] : []),
					}),
				}),
			}),
		}),
		update: () => ({
			set: () => ({
				where: (condition: unknown) => ({
					returning: async () => {
						mocks.whereConditions.push(condition);
						return [{ id: SEGMENT_ID }];
					},
				}),
			}),
		}),
	};
	return { db };
});

import { POST } from './+server';

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
		mocks.evidenceRow = { id: EVIDENCE_ID, caseId: '00000000-0000-4000-8000-0000000000bb', hash: SOURCE_HASH };
		mocks.gateEnabled = true;
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
