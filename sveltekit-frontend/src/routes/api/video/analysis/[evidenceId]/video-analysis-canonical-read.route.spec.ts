// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EVIDENCE_ID = '00000000-0000-4000-8000-0000000000aa';
const CASE_ID = '00000000-0000-4000-8000-0000000000bb';
const RUN_ID = '00000000-0000-4000-8000-0000000000cc';
const SOURCE_REVISION = `sha256:${'a'.repeat(64)}`;

const mocks = vi.hoisted(() => ({
	selectCall: 0,
	canonicalRow: null as Record<string, unknown> | null,
	caseRows: [] as Array<{ id: string }>,
	transcriptRows: [] as Array<Record<string, unknown>>,
	uploadJobRows: [] as Array<Record<string, unknown>>,
	uploadJobFails: false,
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: () => {
			const call = mocks.selectCall++;
			if (call === 0) return { from: () => ({ where: () => ({ limit: async () => mocks.canonicalRow ? [mocks.canonicalRow] : [] }) }) };
			if (call === 1) return { from: () => ({ where: () => ({ limit: async () => mocks.caseRows }) }) };
			if (call === 2) return { from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: () => ({ limit: async () => mocks.transcriptRows }) }) }) }) };
				return { from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => {
					if (mocks.uploadJobFails) throw new Error('db down');
					return mocks.uploadJobRows;
				} }) }) }) };
		},
	},
}));

import { GET } from './+server.js';

function event(userId = '7') {
	return {
		params: { evidenceId: EVIDENCE_ID },
		locals: { user: { id: userId } },
	} as never;
}

describe('GET /api/video/analysis/[evidenceId] canonical worker read path', () => {
	beforeEach(() => {
		mocks.selectCall = 0;
		mocks.caseRows = [{ id: CASE_ID }];
		mocks.transcriptRows = [{ startMs: 1100, endMs: 1400, text: 'hello', language: 'en', confidence: 0.8, model: 'faster-whisper:base:int8' }];
			mocks.uploadJobRows = [{ status: 'running', progress: '40', startedAt: new Date('2026-11-16T12:00:30.000Z'), createdAt: new Date('2026-11-16T12:00:00.000Z') }];
			mocks.uploadJobFails = false;
		mocks.canonicalRow = {
			id: EVIDENCE_ID, caseId: CASE_ID, userId: 7, uploadedBy: 7, evidenceType: 'video', type: 'video', title: 'Interview',
			fileName: 'interview.mp4', mimeType: 'video/mp4', fileSize: 1234, fileUrl: 'seaweedfs://private/source', status: 'completed',
			createdAt: '2026-11-16T12:00:00.000Z', metadata: {}, hash: SOURCE_REVISION,
			aiAnalysis: { videoAnalysis: {
				schema: 'atlas.video-analysis.v1', sourceRevision: SOURCE_REVISION, analysisRevision: 'run-1', analysisJobId: RUN_ID,
				status: 'COMPLETE', transcriptionStatus: 'COMPLETED',
				frames: [{ timestampMs: 1200, sourceRevision: SOURCE_REVISION, analysisRevision: 'run-1', artifact: { storageUri: 'seaweedfs://private/frame' }, objects: [{ label: 'person', confidence: 0.9 }], reviewState: 'UNREVIEWED_PROPOSAL' }],
				eventTimeline: { sourceRevision: SOURCE_REVISION, analysisRevision: 'run-1', events: [{ startMs: 1000, endMs: 1500, summary: 'Unreviewed observation', sourceReferences: [{ kind: 'transcript_segment' }] }] },
				probe: { durationSeconds: 5, width: 640, height: 360, frameRate: 30, videoCodec: 'h264' },
			} },
		};
	});

	it('serves revision-bound worker transcripts, frames and events without exposing object-store URIs', async () => {
		const response = await GET(event());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			ok: true, evidenceId: EVIDENCE_ID, sourceRevision: SOURCE_REVISION, analysisRevision: 'run-1',
			transcriptSegments: [{ startMs: 1100, endMs: 1400, text: 'hello', model: 'faster-whisper:base:int8' }],
			frameAnalysis: [{ timestamp: 1.2, framePath: `/api/evidence/${EVIDENCE_ID}/video-frame/0`, objects: ['person'], tags: ['UNREVIEWED_PROPOSAL'] }],
			sceneDetection: [{ startTime: 1, endTime: 1.5, reviewState: 'UNREVIEWED_PROPOSAL' }],
				analysisJob: { status: 'running', progressPct: 40, startedAt: '2026-11-16T12:00:30.000Z', createdAt: '2026-11-16T12:00:00.000Z' },
		});
		expect(JSON.stringify(body)).not.toContain('seaweedfs://');
		expect(mocks.selectCall).toBe(4);
	});

	it('omits the job ETA source without failing the analysis read when the job lookup fails', async () => {
		mocks.uploadJobFails = true;
		const response = await GET(event());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({ ok: true, analysisJob: null, transcriptSegments: [{ text: 'hello' }] });
	});

	it('does not expose stale worker frames or transcripts when source hash differs', async () => {
		(mocks.canonicalRow as Record<string, unknown>).hash = 'not-a-sha256';
		const response = await GET(event());
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.transcriptSegments).toEqual([]);
		expect(body.frameAnalysis).toEqual([]);
		expect(body.sceneDetection).toEqual([]);
		expect(mocks.selectCall).toBe(3);
	});

	it('denies access when the linked case is not owned or assigned to the caller', async () => {
		mocks.caseRows = [];
		const response = await GET(event());
		expect(response.status).toBe(404);
		expect((await response.json()).ok).toBe(false);
	});
});
