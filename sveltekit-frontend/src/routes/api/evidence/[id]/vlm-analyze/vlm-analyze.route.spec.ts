import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	from: vi.fn(),
	leftJoin: vi.fn(),
	where: vi.fn(),
	limit: vi.fn(),
	getVlmState: vi.fn(),
	getFile: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({ db: { select: (...args: unknown[]) => mocks.select(...args) } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'case.id', userId: 'case.userId', assignedAttorney: 'case.assignedAttorney' },
	evidence: {
		id: 'evidence.id', caseId: 'evidence.caseId', userId: 'evidence.userId', uploadedBy: 'evidence.uploadedBy',
		fileUrl: 'evidence.fileUrl', fileName: 'evidence.fileName', mimeType: 'evidence.mimeType', title: 'evidence.title',
	},
}));
vi.mock('$lib/server/seaweed-client.js', () => ({ getSeaweedFile: (...args: unknown[]) => mocks.getFile(...args) }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_EVIDENCE_BUCKET: 'evidence' } }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('$lib/server/inference/vlm-lifecycle.js', () => ({
	getVlmState: (...args: unknown[]) => mocks.getVlmState(...args),
	VlmMode: { VISION: 'VISION', TEXT: 'TEXT' },
}));
vi.mock('drizzle-orm', () => ({
	and: (...conditions: unknown[]) => ({ and: conditions }),
	eq: (...fields: unknown[]) => ({ eq: fields }),
	isNotNull: (field: unknown) => ({ isNotNull: field }),
	or: (...conditions: unknown[]) => ({ or: conditions }),
}));

import { POST } from './+server.js';

const evidenceId = '6b2749f6-03d8-42b7-a4e0-93983c62cc1d';

function makeEvent(user?: { id: string }) {
	return {
		params: { id: evidenceId },
		locals: user ? { user } : {},
		request: new Request('http://localhost/api/evidence/test/vlm-analyze', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		}),
	} as never;
}

describe('evidence VLM analysis access boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getVlmState.mockResolvedValue('VISION');
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ leftJoin: mocks.leftJoin });
		mocks.leftJoin.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
	});

	it('rejects unauthenticated calls before lifecycle or database access', async () => {
		const response = await POST(makeEvent());

		expect(response.status).toBe(401);
		expect(mocks.getVlmState).not.toHaveBeenCalled();
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it('does not expose evidence outside the user or assigned case', async () => {
		mocks.limit.mockResolvedValue([]);

		const response = await POST(makeEvent({ id: '42' }));

		expect(response.status).toBe(404);
		expect(mocks.leftJoin).toHaveBeenCalled();
		expect(mocks.where).toHaveBeenCalledTimes(1);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('admits an authorized row without reading storage when it has no source location', async () => {
		mocks.limit.mockResolvedValue([{ fileUrl: null, fileName: null, mimeType: 'image/png', title: 'Evidence' }]);

		const response = await POST(makeEvent({ id: '42' }));

		expect(response.status).toBe(400);
		expect(mocks.where).toHaveBeenCalledTimes(1);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});
});
