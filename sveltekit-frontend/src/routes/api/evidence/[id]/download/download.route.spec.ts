import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	where: vi.fn(),
	limit: vi.fn(),
	from: vi.fn(),
	select: vi.fn(),
	getStream: vi.fn(),
	statObject: vi.fn(),
	stream: null as any,
	row: {
		id: '7da89ae6-f7d2-45e9-81ce-28854fe4ce6a',
		fileUrl: 'minio://legal-evidence/evidence/example.pdf',
		fileName: 'example.pdf',
		mimeType: 'application/pdf',
		fileType: 'application/pdf',
		fileSize: 4,
	},
}));

vi.mock('$lib/server/db/client', () => ({
	db: { select: mocks.select },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	evidence: {
		id: 'id',
		fileUrl: 'fileUrl',
		fileName: 'fileName',
		mimeType: 'mimeType',
		fileType: 'fileType',
		fileSize: 'fileSize',
		userId: 'userId',
		uploadedBy: 'uploadedBy',
	},
}));

vi.mock('drizzle-orm', () => ({
	and: (...args: unknown[]) => ({ operator: 'and', args }),
	eq: (...args: unknown[]) => ({ operator: 'eq', args }),
	or: (...args: unknown[]) => ({ operator: 'or', args }),
}));

vi.mock('$lib/server/seaweed-client.js', () => ({
	getSeaweedStream: mocks.getStream,
	statSeaweedObject: mocks.statObject,
}));

vi.mock('$lib/server/env.server.js', () => ({ ENV: { MINIO_EVIDENCE_BUCKET: 'legal-evidence' } }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: () => true }));

describe('GET /api/evidence/[id]/download', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.stream = {
			on(event: string, callback: (value?: Buffer) => void) {
				if (event === 'data') callback(Buffer.from('test'));
				if (event === 'end') callback();
				return this;
			},
			destroy: vi.fn(),
		};
		mocks.limit.mockResolvedValue([mocks.row]);
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.from.mockReturnValue({ where: mocks.where });
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.statObject.mockResolvedValue({ size: 4 });
		mocks.getStream.mockResolvedValue(mocks.stream);
	});

	it('allows the uploader to retrieve an inline preview', async () => {
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL('http://localhost/api/evidence/example/download?inline=1'),
		} as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-disposition')).toContain('inline;');
		expect(await response.text()).toBe('test');
		expect(mocks.where).toHaveBeenCalledWith({
			operator: 'and',
			args: [
				{ operator: 'eq', args: ['id', mocks.row.id] },
				{
					operator: 'or',
					args: [
						{ operator: 'eq', args: ['userId', 2] },
						{ operator: 'eq', args: ['uploadedBy', 2] },
					],
				},
			],
		});
		expect(mocks.getStream).toHaveBeenCalledWith('legal-evidence', 'evidence/example.pdf');
	});

	it('keeps the default response as an attachment', async () => {
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL('http://localhost/api/evidence/example/download'),
		} as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-disposition')).toContain('attachment;');
	});
});
