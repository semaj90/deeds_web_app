// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EVIDENCE_ID = '22222222-2222-4222-8222-222222222222';
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const PARENT = `sha256:${'a'.repeat(64)}`;
const mocks = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	savePoseReviewDecision: vi.fn(),
	createPorts: vi.fn(async () => ({ ports: true })),
	gateEnabled: true,
}));

vi.mock('$lib/server/env.server.js', () => ({ ENV: new Proxy({}, { get: (_target, key) => key === 'EVIDENCE_TRANSCRIPT_REVIEW_ENABLED' ? mocks.gateEnabled : undefined }) }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('$lib/server/features/evidence/evidence-revision-v1.js', async (original) => {
	const actual = await original<typeof import('$lib/server/features/evidence/evidence-revision-v1.js')>();
	return { ...actual, savePoseReviewDecisionV1: mocks.savePoseReviewDecision, createDrizzleRevisionPortsV1: mocks.createPorts };
});

import { POST } from './+server.js';

const validBody = {
	schema: 'atlas.pose-review-request.v1', caseId: CASE_ID, parentSha256: PARENT,
	annotationRevisionId: '33333333-3333-4333-8333-333333333333', analysisRevision: 'analysis-1',
	frameIndex: 4, framePtsUs: 1_250_000, skeletonSchemaId: 'human.coco17.v1',
	trackId: 'track-1', trackScopeId: 'sha256:run-track', decision: 'ACCEPTED_FOR_SCENE_PROPOSAL',
};

function request(body: unknown = validBody, options: { user?: { id: string } | null; evidenceId?: string; contentLength?: string } = {}) {
	return {
		params: { id: options.evidenceId ?? EVIDENCE_ID },
		locals: { user: options.user === undefined ? { id: '7' } : options.user },
		request: new Request(`http://localhost/api/evidence/${EVIDENCE_ID}/pose-review`, { method: 'POST', headers: { 'content-type': 'application/json', ...(options.contentLength ? { 'content-length': options.contentLength } : {}) }, body: JSON.stringify(body) }),
	} as never;
}

const jsonBody = async (response: Response) => await response.json() as Record<string, unknown>;

describe('POST /api/evidence/[id]/pose-review', () => {
	beforeEach(() => {
		mocks.gateEnabled = true;
		mocks.getAuthorizedCase.mockReset().mockResolvedValue({ id: CASE_ID });
		mocks.savePoseReviewDecision.mockReset().mockResolvedValue({
			schema: 'atlas.pose-review-decision.v1', committed: true, idempotent: false,
			decisionId: '44444444-4444-4444-8444-444444444444', revision: 3,
			sourceSha256: PARENT, decision: 'ACCEPTED_FOR_SCENE_PROPOSAL',
			sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false,
		});
	});

	it('records a source-bound decision after case authorization', async () => {
		const response = await POST(request());
		expect(response.status).toBe(201);
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(await jsonBody(response)).toMatchObject({ ok: true, evidenceId: EVIDENCE_ID, decision: 'ACCEPTED_FOR_SCENE_PROPOSAL', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false });
		expect(mocks.getAuthorizedCase).toHaveBeenCalledWith(CASE_ID, 7);
		expect(mocks.savePoseReviewDecision).toHaveBeenCalledWith({ ...validBody, evidenceId: EVIDENCE_ID, actorUserId: 7 }, { ports: true });
	});

	it('fails closed for disabled review, invalid data, and cross-case access', async () => {
		mocks.gateEnabled = false;
		expect((await POST(request())).status).toBe(403);
		mocks.gateEnabled = true;
		expect((await POST(request({ ...validBody, frameIndex: -1 }))).status).toBe(400);
		expect((await POST(request(validBody, { contentLength: '16385' }))).status).toBe(413);
		mocks.getAuthorizedCase.mockResolvedValue(null);
		const denied = await POST(request());
		expect(denied.status).toBe(404);
		expect(mocks.savePoseReviewDecision).not.toHaveBeenCalled();
	});
});
