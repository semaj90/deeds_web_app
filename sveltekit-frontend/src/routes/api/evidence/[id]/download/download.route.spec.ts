import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	where: vi.fn(),
	limit: vi.fn(),
	from: vi.fn(),
	select: vi.fn(),
	getStream: vi.fn(),
	getPartialStream: vi.fn(),
	statObject: vi.fn(),
	observedMime: 'application/pdf',
	stream: null as any,
	row: {
		id: '7da89ae6-f7d2-45e9-81ce-28854fe4ce6a',
		fileUrl: 'minio://legal-evidence/evidence/example.pdf',
		fileName: 'example.pdf',
		mimeType: 'application/pdf',
		fileType: 'application/pdf',
		fileSize: 4,
		caseId: null,
	},
}));

vi.mock('$lib/server/db/client', () => ({
	db: { select: mocks.select },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'caseId', userId: 'caseUserId', assignedAttorney: 'assignedAttorney' },
	evidence: {
		id: 'id',
		fileUrl: 'fileUrl',
		fileName: 'fileName',
		mimeType: 'mimeType',
		fileType: 'fileType',
		fileSize: 'fileSize',
		caseId: 'caseId',
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
	getSeaweedPartialStream: mocks.getPartialStream,
	statSeaweedObject: mocks.statObject,
}));

vi.mock('$lib/server/env.server.js', () => ({ ENV: { MINIO_EVIDENCE_BUCKET: 'legal-evidence' } }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: () => true }));
vi.mock('$lib/server/ingest/upload-classification-v1.js', () => ({ probeObservedMime: () => mocks.observedMime }));

describe('GET /api/evidence/[id]/download', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.observedMime = 'application/pdf';
		mocks.row.caseId = null;
		mocks.stream = {
			async *[Symbol.asyncIterator]() { yield Buffer.from('%PDF-1.7'); },
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
		mocks.statObject.mockResolvedValue({ size: 8 });
		mocks.getStream.mockResolvedValue(mocks.stream);
		mocks.getPartialStream.mockResolvedValue(mocks.stream);
	});

	it('allows the uploader to retrieve an inline preview', async () => {
		const caseId = 'fc0277ba-9d09-4d52-8d74-f16db1a678ce';
		mocks.row.caseId = caseId;
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL(`http://localhost/api/evidence/example/download?inline=1&caseId=${caseId}`),
			request: new Request('http://localhost/api/evidence/example/download?inline=1'),
		} as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-disposition')).toContain('inline;');
		expect(await response.text()).toBe('test');
		expect(mocks.where).toHaveBeenLastCalledWith({
			operator: 'and',
			args: [
				{ operator: 'eq', args: ['id', mocks.row.id] },
				{ operator: 'eq', args: ['caseId', caseId] },
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
			request: new Request('http://localhost/api/evidence/example/download'),
		} as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-disposition')).toContain('attachment;');
	});

	it('does not throw when source events arrive after the client cancels', async () => {
		const handlers: Record<string, (value?: Buffer | Error) => void> = {};
		const destroy = vi.fn();
		mocks.stream = {
			on(event: string, callback: (value?: Buffer | Error) => void) {
				handlers[event] = callback;
				return this;
			},
			destroy,
		};
		mocks.getStream.mockResolvedValue(mocks.stream);
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL('http://localhost/api/evidence/example/download'),
			request: new Request('http://localhost/api/evidence/example/download'),
		} as any);

		await response.body?.cancel();
		expect(destroy).toHaveBeenCalledOnce();
		expect(() => handlers.error(new Error('source closed after cancel'))).not.toThrow();
		expect(() => handlers.data(Buffer.from('late chunk'))).not.toThrow();
		expect(() => handlers.end()).not.toThrow();
	});

	it('serves a valid byte range for media seeking', async () => {
		mocks.statObject.mockResolvedValue({ size: 10 });
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL('http://localhost/api/evidence/example/download'),
			request: new Request('http://localhost/api/evidence/example/download', { headers: { Range: 'bytes=2-5' } }),
		} as any);

		expect(response.status).toBe(206);
		expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
		expect(response.headers.get('content-length')).toBe('4');
		expect(mocks.getPartialStream).toHaveBeenCalledWith('legal-evidence', 'evidence/example.pdf', 2, 4);
	});

	it.each([
		{ header: 'bytes=2-', start: 2, end: 9, length: 8 },
		{ header: 'bytes=-3', start: 7, end: 9, length: 3 },
	])('supports open-ended and suffix range $header', async ({ header, start, end, length }) => {
		mocks.statObject.mockResolvedValue({ size: 10 });
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL('http://localhost/api/evidence/example/download'),
			request: new Request('http://localhost/api/evidence/example/download', { headers: { Range: header } }),
		} as any);

		expect(response.status).toBe(206);
		expect(response.headers.get('content-range')).toBe(`bytes ${start}-${end}/10`);
		expect(response.headers.get('content-length')).toBe(String(length));
		expect(mocks.getPartialStream).toHaveBeenCalledWith('legal-evidence', 'evidence/example.pdf', start, length);
	});

	it('rejects an unsatisfiable byte range', async () => {
		mocks.statObject.mockResolvedValue({ size: 4 });
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL('http://localhost/api/evidence/example/download'),
			request: new Request('http://localhost/api/evidence/example/download', { headers: { Range: 'bytes=9-' } }),
		} as any);

		expect(response.status).toBe(416);
		expect(response.headers.get('content-range')).toBe('bytes */4');
		expect(mocks.getStream).not.toHaveBeenCalled();
	});

	it('requires the caller-owned case and matching evidence membership', async () => {
		const caseId = 'fc0277ba-9d09-4d52-8d74-f16db1a678ce';
		mocks.row.caseId = caseId;
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL(`http://localhost/api/evidence/${mocks.row.id}/download?caseId=${caseId}&inline=1`),
			request: new Request('http://localhost/api/evidence/example/download'),
		} as any);

		expect(response.status).toBe(200);
		expect(mocks.where).toHaveBeenCalledTimes(2);
		expect(mocks.where).toHaveBeenLastCalledWith({
			operator: 'and',
			args: [
				{ operator: 'eq', args: ['id', mocks.row.id] },
				{ operator: 'eq', args: ['caseId', caseId] },
			],
		});
	});

	it('does not access object storage when the caller cannot access the case', async () => {
		mocks.limit.mockResolvedValueOnce([]);
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL('http://localhost/api/evidence/example/download?caseId=fc0277ba-9d09-4d52-8d74-f16db1a678ce&inline=1'),
			request: new Request('http://localhost/api/evidence/example/download'),
		} as any);

		expect(response.status).toBe(404);
		expect(mocks.getStream).not.toHaveBeenCalled();
		expect(mocks.getPartialStream).not.toHaveBeenCalled();
	});

	it('blocks inline display when observed bytes disagree with stored MIME', async () => {
		const caseId = 'fc0277ba-9d09-4d52-8d74-f16db1a678ce';
		mocks.row.caseId = caseId;
		mocks.observedMime = 'image/jpeg';
		const { GET } = await import('./+server.js');
		const response = await GET({
			params: { id: mocks.row.id },
			locals: { user: { id: 2 } },
			url: new URL(`http://localhost/api/evidence/example/download?inline=1&caseId=${caseId}`),
			request: new Request('http://localhost/api/evidence/example/download?inline=1'),
		} as any);

		expect(response.status).toBe(415);
		expect(mocks.getStream).not.toHaveBeenCalled();
	});
});
