// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const limit = vi.hoisted(() => vi.fn());
const getAuthorizedCase = vi.hoisted(() => vi.fn());
const generateStream = vi.hoisted(() => vi.fn());
const auditReturning = vi.hoisted(() => vi.fn());

vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => 'eq') }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase }));
vi.mock('$lib/server/validation.js', () => ({
	isUuid: (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}));
vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({ acquireGpuLease: () => Promise.resolve(null) }));
vi.mock('$lib/server/llm/runtime-contract.js', () => ({ LLM_MODEL_ID: 'test-model' }));
vi.mock('$lib/server/llm-router', () => ({ llmRouter: { generateStream } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	evidence: {
		id: 'id',
		title: 'title',
		description: 'description',
		summary: 'summary',
		mimeType: 'mime_type',
		fileType: 'file_type',
		extractedText: 'extracted_text',
		caseId: 'case_id',
		userId: 'user_id',
		uploadedBy: 'uploaded_by',
	},
	evidenceAuditLog: { id: 'id' },
}));
vi.mock('$lib/server/db/client', () => ({
	db: {
		select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
		insert: () => ({ values: () => ({ returning: auditReturning }) }),
	},
}));

import { GET } from './+server';

const EVIDENCE_ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const CASE_ID = 'a2b6d51c-5595-4ccd-a86b-ff89c0d349cc';

const baseRow = {
	id: EVIDENCE_ID,
	title: 't',
	description: null,
	summary: null,
	mimeType: 'text/plain',
	fileType: 'txt',
	extractedText: 'secret extracted text',
	caseId: CASE_ID,
	userId: 99,
	uploadedBy: 99,
};

function call(id: string = EVIDENCE_ID, user: unknown = { id: 7 }) {
	return GET({ params: { id }, locals: { user } } as never);
}

beforeEach(() => {
	limit.mockReset().mockResolvedValue([{ ...baseRow }]);
	getAuthorizedCase.mockReset().mockResolvedValue({ id: CASE_ID });
	generateStream.mockReset().mockResolvedValue(
		(async function* () {
			yield { content: 'ok' };
		})()
	);
	auditReturning.mockReset().mockResolvedValue([{ id: 'audit-1' }]);
});

describe('GET /api/evidence/[id]/analyze/stream authorization', () => {
	it('requires a real authenticated actor', async () => {
		for (const user of [null, { id: 'abc' }, { id: 0 }]) {
			expect((await call(EVIDENCE_ID, user)).status).toBe(401);
		}
		expect(limit).not.toHaveBeenCalled();
	});

	it('rejects a malformed evidence id before querying', async () => {
		expect((await call('not-a-uuid')).status).toBe(400);
		expect(limit).not.toHaveBeenCalled();
	});

	it('streams case-linked evidence for a user with case access', async () => {
		const response = await call();
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('text/event-stream');
		expect(getAuthorizedCase).toHaveBeenCalledWith(CASE_ID, 7);
		await response.text();
		expect(generateStream).toHaveBeenCalledOnce();
	});

	it('returns the same 404 as a missing row for case evidence the actor cannot access, and never calls the model', async () => {
		getAuthorizedCase.mockResolvedValue(null);
		const denied = await call();
		limit.mockResolvedValueOnce([]);
		const missing = await call();
		expect(denied.status).toBe(404);
		expect(missing.status).toBe(404);
		expect(await denied.text()).toBe(await missing.text());
		expect(generateStream).not.toHaveBeenCalled();
	});

	it('treats a case-access lookup failure as denial', async () => {
		getAuthorizedCase.mockRejectedValue(new Error('db down'));
		expect((await call()).status).toBe(404);
		expect(generateStream).not.toHaveBeenCalled();
	});

	it('limits evidence with no case to its owner or uploader', async () => {
		limit.mockResolvedValueOnce([{ ...baseRow, caseId: null, userId: 99, uploadedBy: 98 }]);
		expect((await call()).status).toBe(404);
		expect(getAuthorizedCase).not.toHaveBeenCalled();
		expect(generateStream).not.toHaveBeenCalled();

		limit.mockResolvedValueOnce([{ ...baseRow, caseId: null, userId: 7, uploadedBy: null }]);
		const owner = await call();
		expect(owner.status).toBe(200);
		await owner.text();

		limit.mockResolvedValueOnce([{ ...baseRow, caseId: null, userId: null, uploadedBy: 7 }]);
		const uploader = await call();
		expect(uploader.status).toBe(200);
		await uploader.text();
	});
});
