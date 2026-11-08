import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	from: vi.fn(),
	leftJoin: vi.fn(),
	where: vi.fn(),
	limit: vi.fn(),
	getFile: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({ db: { select: (...args: unknown[]) => mocks.select(...args) } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'case.id', userId: 'case.userId', assignedAttorney: 'case.assignedAttorney' },
	evidence: {
		id: 'evidence.id', caseId: 'evidence.caseId', userId: 'evidence.userId', uploadedBy: 'evidence.uploadedBy',
		fileUrl: 'evidence.fileUrl', mimeType: 'evidence.mimeType', fileType: 'evidence.fileType',
	},
}));
vi.mock('$lib/server/seaweed-client.js', () => ({ getSeaweedFile: (...args: unknown[]) => mocks.getFile(...args) }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_EVIDENCE_BUCKET: 'seaweed-evidence' } }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('drizzle-orm', () => ({
	and: (...conditions: unknown[]) => ({ and: conditions }),
	eq: (...fields: unknown[]) => ({ eq: fields }),
	isNotNull: (field: unknown) => ({ isNotNull: field }),
	or: (...conditions: unknown[]) => ({ or: conditions }),
}));

import { POST } from './+server.js';

const evidenceId = '6b2749f6-03d8-42b7-a4e0-93983c62cc1d';
const user = { id: '42' };
let png: Buffer;

function event(options: { user?: { id: string }; body?: unknown; rawBody?: string; id?: string } = {}) {
	return {
		params: { id: options.id ?? evidenceId },
		locals: options.user ? { user: options.user } : {},
		request: new Request('http://localhost/api/evidence/image/upscale', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: options.rawBody ?? JSON.stringify(options.body ?? { scale: 2 }),
		}),
	} as never;
}

describe('evidence upscale route', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const sharp = (await import('sharp')).default;
		png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#896a42' } }).png().toBuffer();
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ leftJoin: mocks.leftJoin });
		mocks.leftJoin.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.getFile.mockResolvedValue(png);
	});

	it('rejects unauthenticated requests before querying the database', async () => {
		const response = await POST(event());
		expect(response.status).toBe(401);
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it('rejects malformed evidence IDs and request JSON before database access', async () => {
		const badId = await POST(event({ user, id: 'not-a-uuid' }));
		const badJson = await POST(event({ user, rawBody: '{' }));
		expect(badId.status).toBe(400);
		expect(badJson.status).toBe(400);
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it('rejects unsupported scales before querying evidence', async () => {
		const response = await POST(event({ user, body: { scale: 8 } }));
		expect(response.status).toBe(400);
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it('keeps evidence outside the actor and assigned-case scope undisclosed', async () => {
		mocks.limit.mockResolvedValue([]);
		const response = await POST(event({ user }));
		expect(response.status).toBe(404);
		expect(mocks.leftJoin).toHaveBeenCalled();
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('rejects non-image evidence before reading its object', async () => {
		mocks.limit.mockResolvedValue([{ fileUrl: 'evidence/case/source.pdf', mimeType: 'application/pdf' }]);
		const response = await POST(event({ user }));
		expect(response.status).toBe(415);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('rejects an oversized image after authorized storage read and before decoding', async () => {
		mocks.limit.mockResolvedValue([{ fileUrl: 'evidence/case/large.png', mimeType: 'image/png' }]);
		mocks.getFile.mockResolvedValue(Buffer.alloc(40 * 1024 * 1024 + 1));

		const response = await POST(event({ user }));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ error: 'Image too large' });
		expect(mocks.getFile).toHaveBeenCalledWith('seaweed-evidence', 'evidence/case/large.png');
	});

	it('reads an authorized source from SeaweedFS and returns a non-persisted Lanczos PNG preview', async () => {
		mocks.limit.mockResolvedValue([{ fileUrl: 'evidence/case/source.png', mimeType: 'image/png' }]);
		const response = await POST(event({ user, body: { scale: 2 } }));
		const sharp = (await import('sharp')).default;
		const result = await sharp(Buffer.from(await response.arrayBuffer())).metadata();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('x-upscale-method')).toBe('lanczos3');
		expect(response.headers.get('x-upscale-size')).toBe('4x4');
		expect(result.width).toBe(4);
		expect(result.height).toBe(4);
		expect(mocks.getFile).toHaveBeenCalledWith('seaweed-evidence', 'evidence/case/source.png');
	});
});
