import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), limit: vi.fn(), getFile: vi.fn() }));

vi.mock('$lib/server/db/client', () => ({ db: { select: (...args: unknown[]) => mocks.select(...args) } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'case.id', userId: 'case.userId', assignedAttorney: 'case.assignedAttorney' },
	evidence: {
		id: 'evidence.id', caseId: 'evidence.caseId', hash: 'evidence.hash', mimeType: 'evidence.mimeType',
		fileType: 'evidence.fileType', userId: 'evidence.userId', uploadedBy: 'evidence.uploadedBy', aiAnalysis: 'evidence.aiAnalysis',
	},
}));
vi.mock('$lib/server/seaweed-client.js', () => ({ getSeaweedFile: (...args: unknown[]) => mocks.getFile(...args) }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('drizzle-orm', () => ({
	and: (...conditions: unknown[]) => ({ and: conditions }),
	eq: (...fields: unknown[]) => ({ eq: fields }),
	or: (...conditions: unknown[]) => ({ or: conditions }),
}));

import { GET } from './+server.js';

const evidenceId = '6b2749f6-03d8-42b7-a4e0-93983c62cc1d';
const sourceRevision = `sha256:${'a'.repeat(64)}`;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);

function event(user?: { id: string }) {
	return { params: { id: evidenceId }, locals: user ? { user } : {} } as never;
}

function evidenceRow(overrides: Record<string, unknown> = {}) {
	return {
		id: evidenceId,
		caseId: '4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc',
		hash: sourceRevision,
		mimeType: 'image/png',
		fileType: 'image/png',
		aiAnalysis: {
			depthAnalysis: {
				depthMapUrl: `minio://evidence/evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth.png`,
				sourceRevision,
			},
		},
		...overrides,
	};
}

describe('evidence depth-map route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ leftJoin: mocks.leftJoin });
		mocks.leftJoin.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.getFile.mockResolvedValue(png);
	});

	it('requires authentication before querying evidence', async () => {
		const response = await GET(event());

		expect(response.status).toBe(401);
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it('returns not found for evidence outside the actor scope', async () => {
		mocks.limit.mockResolvedValue([]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('fails closed when depth metadata is not bound to the source revision', async () => {
		mocks.limit.mockResolvedValue([evidenceRow({
			aiAnalysis: { depthAnalysis: { depthMapUrl: 'minio://evidence/evidence/key.png' } },
		})]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('serves only the bounded PNG artifact from SeaweedFS for an authorized source-bound image', async () => {
		mocks.limit.mockResolvedValue([evidenceRow()]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.getFile).toHaveBeenCalledWith('evidence', `evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth.png`);
		expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
	});
});
