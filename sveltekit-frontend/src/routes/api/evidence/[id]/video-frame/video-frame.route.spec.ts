// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EVIDENCE_ID = '00000000-0000-4000-8000-0000000000aa';
const CASE_ID = '00000000-0000-4000-8000-0000000000bb';
const RUN_ID = '00000000-0000-4000-8000-0000000000cc';
const SOURCE_REVISION = `sha256:${'a'.repeat(64)}`;
const FRAME_BYTES = Buffer.from('fixture-jpeg-bytes');
const FRAME_SHA = `sha256:${createHash('sha256').update(FRAME_BYTES).digest('hex')}`;

const mocks = vi.hoisted(() => ({ source: null as Record<string, unknown> | null, objectBytes: new Uint8Array(), objectReads: 0 }));
vi.mock('$lib/server/db/client', () => ({ db: { select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => mocks.source ? [mocks.source] : [] }) }) }) }) } }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ getFileFromSeaweed: async () => { mocks.objectReads += 1; return mocks.objectBytes; } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_ARTIFACTS_BUCKET: 'atlas-artifacts' } }));

import { GET } from './[frameIndex]/+server.js';

function event(frameIndex = '0', userId: string | null = '7') {
	return { params: { id: EVIDENCE_ID, frameIndex }, locals: { user: userId ? { id: userId } : null } } as never;
}

describe('GET /api/evidence/[id]/video-frame/[frameIndex]', () => {
	beforeEach(() => {
		mocks.objectReads = 0;
		mocks.objectBytes = FRAME_BYTES;
		mocks.source = {
			id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_REVISION,
			aiAnalysis: { videoAnalysis: {
				schema: 'atlas.video-analysis.v1', sourceRevision: SOURCE_REVISION, analysisRevision: 'analysis-1', analysisJobId: RUN_ID,
				frames: [{ frameIndex: 0, timestampMs: 1200, sourceRevision: SOURCE_REVISION, analysisRevision: 'analysis-1', artifact: {
					bucket: 'atlas-artifacts', objectKey: `evidence/${CASE_ID}/${EVIDENCE_ID}/${'a'.repeat(64)}/${RUN_ID}/frame-0000.jpg`,
					contentType: 'image/jpeg', byteLength: FRAME_BYTES.length, sha256: FRAME_SHA, sourceRevision: SOURCE_REVISION,
				} }],
			} },
		};
	});

	it('serves only the current authorized, digest-verified source frame', async () => {
		const response = await GET(event());
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/jpeg');
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response.headers.get('X-Source-Revision')).toBe(SOURCE_REVISION);
		expect(response.headers.get('X-Frame-Timestamp-Ms')).toBe('1200');
		expect(Buffer.from(await response.arrayBuffer())).toEqual(FRAME_BYTES);
		expect(mocks.objectReads).toBe(1);
	});

	it('does not read object storage for unauthorized, stale or mismatched artifacts', async () => {
		const unauthorized = await GET(event('0', null));
		expect(unauthorized.status).toBe(401);
		const authorizedSource = mocks.source;
		mocks.source = null;
		const crossCaseDenied = await GET(event());
		expect(crossCaseDenied.status).toBe(404);
		mocks.source = authorizedSource;

		(mocks.source as Record<string, unknown>).hash = `sha256:${'b'.repeat(64)}`;
		const stale = await GET(event());
		expect(stale.status).toBe(404);

		(mocks.source as Record<string, unknown>).hash = SOURCE_REVISION;
		const analysis = (mocks.source as any).aiAnalysis.videoAnalysis;
		analysis.frames[0].artifact.objectKey = 'evidence/other-case/private.jpg';
		const mismatched = await GET(event());
		expect(mismatched.status).toBe(404);
		expect(mocks.objectReads).toBe(0);
	});

	it('rejects bytes whose persisted digest does not match the frame manifest', async () => {
		mocks.objectBytes = Buffer.from('different-bytes');
		const response = await GET(event());
		expect(response.status).toBe(409);
		expect(mocks.objectReads).toBe(1);
	});
});
