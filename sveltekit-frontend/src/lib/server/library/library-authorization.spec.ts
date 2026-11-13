// @vitest-environment node
/**
 * Two-user / two-document denial for the library reader, PDF route and search.
 * MOCKED proof level: asserts denial happens before storage, chunk SQL, embedding,
 * external search and cache work. Not live readback.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DOC_A = '11111111-1111-4111-8111-111111111111'; // private, uploaded_by 1
const DOC_B = '22222222-2222-4222-8222-222222222222'; // private, uploaded_by 2
const DOC_SHARED = '33333333-3333-4333-8333-333333333333'; // uploaded_by NULL
const CASE_OF_USER_1 = '44444444-4444-4444-8444-444444444444';

const uploadedBy: Record<string, number | null> = { [DOC_A]: 1, [DOC_B]: 2, [DOC_SHARED]: null };

const mocks = vi.hoisted(() => ({
	queries: [] as { sql: string; params: unknown[] }[],
	statObject: vi.fn(),
	getStream: vi.fn(),
	getPartialStream: vi.fn(),
	embed: vi.fn(),
	analytics: vi.fn(),
	getAuthorizedCase: vi.fn(),
	fetch: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
	pool: {
		query: vi.fn(async (sql: string, params: unknown[] = []) => {
			mocks.queries.push({ sql, params });
			if (/SELECT ld\.uploaded_by, ld\.source_hash, current_version\.id AS revision_id/.test(sql)) {
				const id = String(params[0]);
				return {
					rows: id in uploadedBy
						? [{ uploaded_by: uploadedBy[id], source_hash: 'a'.repeat(64), revision_id: 'version-1' }]
						: [],
				};
			}
			if (/SELECT id FROM library_documents ld/.test(sql)) {
				const [ids, actor] = params as [string[], number];
				return {
					rows: ids
						.filter((id) => uploadedBy[id] === null || uploadedBy[id] === actor)
						.map((id) => ({ id })),
				};
			}
			if (/SELECT minio_key, title, mime_type/.test(sql)) {
				const isImage = String(params[0]) === DOC_SHARED;
				return { rows: [{ minio_key: isImage ? 'k/shared.png' : 'k/a.pdf', title: 'T', mime_type: isImage ? 'image/png' : 'application/pdf' }] };
			}
			if (/FROM library_documents ld\s+LEFT JOIN jurisdictions/.test(sql) && /ld\.id, ld\.title/.test(sql)) {
				return { rows: [{ id: params[0], title: 'T', corpus_type: 'other', processing_status: 'complete' }] };
			}
			return { rows: [], rowCount: 0 };
		}),
	},
	db: {},
}));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/seaweed-client.js', () => ({
	statSeaweedObject: mocks.statObject,
	getSeaweedStream: mocks.getStream,
	getSeaweedPartialStream: mocks.getPartialStream,
}));
vi.mock('$lib/server/env.server.js', () => ({
	ENV: { MINIO_LIBRARY_BUCKET: 'library', GO_SEARCH_URL: 'http://go.test' },
}));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({ generateSingleEmbedding: mocks.embed }));
vi.mock('$lib/server/analytics/search-analytics.js', () => ({ recordSearchQuery: mocks.analytics }));
vi.mock('$lib/server/middleware/cache-headers.js', () => ({ cacheControl: { short: {} } }));

import { authorizeLibraryDocumentV1, normalizeLibraryActorIdV1 } from './library-document-access-v1.js';
import { GET as pdfGET } from '../../../routes/api/library/documents/[documentId]/pdf/+server.js';
import { GET as imageGET } from '../../../routes/api/library/documents/[documentId]/image/+server.js';
import { POST as searchPOST } from '../../../routes/api/library/search/+server.js';
import { load as readerLoad } from '../../../routes/(app)/library/[documentId]/reader/+page.server.js';

const chunkSql = () => mocks.queries.filter((q) => /legal_chunks|legal_nodes/.test(q.sql));

beforeEach(() => {
	mocks.queries.length = 0;
	for (const m of [mocks.statObject, mocks.getStream, mocks.getPartialStream, mocks.embed, mocks.analytics, mocks.getAuthorizedCase, mocks.fetch]) m.mockReset();
	mocks.embed.mockResolvedValue(null);
	vi.stubGlobal('fetch', mocks.fetch);
});

describe('authorizeLibraryDocumentV1', () => {
	it('normalizes Lucia string ids and rejects junk', () => {
		expect(normalizeLibraryActorIdV1('1')).toBe(1);
		expect(normalizeLibraryActorIdV1(7)).toBe(7);
		for (const bad of [undefined, null, '', '0', '-1', '1.5', 'abc', NaN]) expect(normalizeLibraryActorIdV1(bad)).toBeNull();
	});

	it('owner (string id) and shared corpus allowed; other owner denied', async () => {
		expect(await authorizeLibraryDocumentV1({ documentId: DOC_A, actorId: '1' })).toMatchObject({ allowed: true, scope: 'owner' });
		expect(await authorizeLibraryDocumentV1({ documentId: DOC_SHARED, actorId: '2' })).toMatchObject({ allowed: true, scope: 'shared' });
		expect(await authorizeLibraryDocumentV1({ documentId: DOC_A, actorId: '2' })).toEqual({ allowed: false, reason: 'DOCUMENT_NOT_OWNED' });
		expect(await authorizeLibraryDocumentV1({ documentId: 'nope', actorId: '1' })).toEqual({ allowed: false, reason: 'INVALID_DOCUMENT_ID' });
		expect(await authorizeLibraryDocumentV1({ documentId: DOC_A, actorId: undefined })).toEqual({ allowed: false, reason: 'INVALID_ACTOR' });
	});

	it('case denial never reaches the document query', async () => {
		mocks.getAuthorizedCase.mockResolvedValue(null);
		const r = await authorizeLibraryDocumentV1({ documentId: DOC_A, actorId: '1', caseId: CASE_OF_USER_1 });
		expect(r).toEqual({ allowed: false, reason: 'CASE_DENIED' });
		expect(mocks.queries).toHaveLength(0);
	});
});

describe('PDF source route', () => {
	const call = (documentId: string, userId: string | number, download = false) =>
		pdfGET({
			params: { documentId },
			locals: { user: { id: userId } },
			request: new Request('http://x/pdf'),
			url: new URL(`http://x/pdf${download ? '?download=1' : ''}`),
		} as never);

	it('user 2 requesting user 1 document: 404 with zero storage calls and no metadata query', async () => {
		await expect(call(DOC_A, '2')).rejects.toMatchObject({ status: 404 });
		expect(mocks.statObject).not.toHaveBeenCalled();
		expect(mocks.getStream).not.toHaveBeenCalled();
		expect(mocks.getPartialStream).not.toHaveBeenCalled();
		expect(mocks.queries.some((q) => /minio_key/.test(q.sql))).toBe(false);
	});

	it('user 1 requesting user 2 document: 404 with zero storage calls and no metadata query', async () => {
		await expect(call(DOC_B, '1')).rejects.toMatchObject({ status: 404 });
		expect(mocks.statObject).not.toHaveBeenCalled();
		expect(mocks.getStream).not.toHaveBeenCalled();
		expect(mocks.getPartialStream).not.toHaveBeenCalled();
		expect(mocks.queries.some((q) => /minio_key/.test(q.sql))).toBe(false);
	});

	it('owner with a string session id reaches storage (regression: number !== string)', async () => {
		mocks.statObject.mockResolvedValue({ size: 10 });
		const { Readable } = await import('node:stream');
		mocks.getStream.mockResolvedValue(Readable.from([Buffer.from('%PDF-1.7')]));
		const res = await call(DOC_A, '1');
		expect(res.status).toBe(200);
		expect(mocks.statObject).toHaveBeenCalledTimes(1);
	});

	it('native download fallback remains authorized and requests attachment disposition', async () => {
		mocks.statObject.mockResolvedValue({ size: 10 });
		const { Readable } = await import('node:stream');
		mocks.getStream.mockResolvedValue(Readable.from([Buffer.from('%PDF-1.7')]));
		const response = await call(DOC_A, '1', true);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
	});
});

describe('raster image source route', () => {
	const call = (documentId: string, userId: string | number) =>
		imageGET({ params: { documentId }, locals: { user: { id: userId } } } as never);

	it('denies a foreign image before metadata or SeaweedFS access', async () => {
		await expect(call(DOC_B, '1')).rejects.toMatchObject({ status: 404 });
		expect(mocks.statObject).not.toHaveBeenCalled();
		expect(mocks.getStream).not.toHaveBeenCalled();
		expect(mocks.queries.some((q) => /minio_key/.test(q.sql))).toBe(false);
	});

	it('streams an authorized raster image with a safe inline response', async () => {
		const { Readable } = await import('node:stream');
		mocks.getStream.mockResolvedValue(Readable.from([Buffer.from([0x89, 0x50, 0x4e, 0x47])]));
		const response = await call(DOC_SHARED, '1');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		expect(mocks.getStream).toHaveBeenCalledWith('library', 'k/shared.png');
	});

	it('rejects non-raster content before opening the stored object', async () => {
		await expect(call(DOC_A, '1')).rejects.toMatchObject({ status: 415 });
		expect(mocks.getStream).not.toHaveBeenCalled();
	});
});

describe('reader loader', () => {
	it('user 2 loading user 1 document: empty result, zero TOC/chunk SQL', async () => {
		const out = (await readerLoad({
			params: { documentId: DOC_A },
			url: new URL('http://x/library/' + DOC_A + '/reader'),
			locals: { user: { id: '2' } },
		} as never)) as { document: unknown; toc: unknown[]; initialChunks: unknown[]; loadError: string };
		expect(out.document).toBeNull();
		expect(out.toc).toEqual([]);
		expect(out.initialChunks).toEqual([]);
		expect(chunkSql()).toHaveLength(0);
	});

	it('shared document loads for any signed-in user', async () => {
		const out = (await readerLoad({
			params: { documentId: DOC_SHARED },
			url: new URL('http://x/library/' + DOC_SHARED + '/reader'),
			locals: { user: { id: '2' } },
		} as never)) as { document: { id: string } | null };
		expect(out.document?.id).toBe(DOC_SHARED);
	});
});

describe('library search', () => {
	const post = (body: unknown, userId: string) =>
		searchPOST({
			request: new Request('http://x/search', { method: 'POST', body: JSON.stringify(body) }),
			locals: { user: { id: userId } },
		} as never);

	it('documentId of another owner: empty hits, zero embedding / Go / chunk SQL / analytics', async () => {
		const res = await post({ query: 'duty of care', documentId: DOC_A }, '2');
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ hits: [], total: 0 });
		expect(mocks.embed).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(mocks.analytics).not.toHaveBeenCalled();
		expect(chunkSql()).toHaveLength(0);
	});

	it('the reverse owner/document pair is denied before embedding or retrieval too', async () => {
		const res = await post({ query: 'duty of care', documentId: DOC_B }, '1');
		expect(res.status).toBe(404);
		expect(mocks.embed).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(mocks.analytics).not.toHaveBeenCalled();
		expect(chunkSql()).toHaveLength(0);
	});

	it('does not invoke the unscoped Go executor for library search', async () => {
		mocks.fetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					hits: [
						{ chunkId: 'c1', documentId: DOC_A, snippet: 'secret' },
						{ chunkId: 'c2', documentId: DOC_SHARED, snippet: 'public' },
						{ chunkId: 'c3', documentId: DOC_B, snippet: 'mine' },
					],
					total: 3,
				}),
			),
		);
		const res = await post({ query: 'duty of care' }, '2');
		await res.json();
		expect(res.status).toBe(200);
		expect(mocks.fetch).not.toHaveBeenCalled();
		const q = chunkSql().find((x) => /ts_rank/.test(x.sql));
		expect(q).toBeDefined();
		expect(q!.sql).toMatch(/ld\.uploaded_by IS NULL OR ld\.uploaded_by = \$2::integer/);
	});

	it('inline SQL fallback always carries the visibility predicate and actor param', async () => {
		mocks.fetch.mockRejectedValue(new Error('go down'));
		await post({ query: 'duty of care' }, '2');
		const q = chunkSql().find((x) => /ts_rank/.test(x.sql));
		expect(q).toBeDefined();
		expect(q!.sql).toMatch(/ld\.uploaded_by IS NULL OR ld\.uploaded_by = \$2::integer/);
		expect(q!.params[1]).toBe(2);
	});
});
