// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
	authorizeLibraryDocument: vi.fn(),
	pgQuery: vi.fn(),
	statSeaweedObject: vi.fn(),
	getSeaweedStream: vi.fn(),
	getSeaweedPartialStream: vi.fn(),
	generateSingleEmbedding: vi.fn(),
	recordSearchQuery: vi.fn(),
	filterVisibleLibraryDocumentIds: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({ pool: { query: h.pgQuery } }));
vi.mock('$lib/server/seaweed-client.js', () => ({
	statSeaweedObject: h.statSeaweedObject,
	getSeaweedStream: h.getSeaweedStream,
	getSeaweedPartialStream: h.getSeaweedPartialStream,
}));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { MINIO_LIBRARY_BUCKET: 'test-library', GO_SEARCH_URL: '' } }));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({ generateSingleEmbedding: h.generateSingleEmbedding }));
vi.mock('$lib/server/analytics/search-analytics.js', () => ({ recordSearchQuery: h.recordSearchQuery }));
vi.mock('$lib/server/middleware/cache-headers.js', () => ({ cacheControl: { short: {} } }));
vi.mock('$lib/server/library/library-document-access-v1.js', () => ({
	authorizeLibraryDocumentV1: h.authorizeLibraryDocument,
	filterVisibleLibraryDocumentIdsV1: h.filterVisibleLibraryDocumentIds,
	libraryVisibilityPredicateV1: () => '(ld.uploaded_by IS NULL OR ld.uploaded_by = $2::integer)',
	normalizeLibraryActorIdV1: (id: unknown) => Number(id) || null,
}));

import { GET as getLibrarySearch } from './search/+server.js';
import { GET as getLibraryPdf } from './documents/[documentId]/pdf/+server.js';

const actorA = '202';
const actorB = '101';
const documentA = '01932000-0000-8000-8000-00000000d0ca';
const documentB = '01932000-0000-8000-8000-00000000d0cb';

describe('library document read routes deny foreign documents before downstream work', () => {
	it.each([
		[actorB, documentA],
		[actorA, documentB],
	])('denies actor %s reading foreign PDF %s before metadata or SeaweedFS access', async (actorId, documentId) => {
		h.authorizeLibraryDocument.mockResolvedValue({ allowed: false, reason: 'DOCUMENT_NOT_OWNED' });

		await expect(getLibraryPdf({
			params: { documentId },
			locals: { user: { id: actorId } },
			request: new Request(`http://x/api/library/documents/${documentId}/pdf`, { headers: { range: 'bytes=0-63' } }),
			url: new URL(`http://x/api/library/documents/${documentId}/pdf`),
		} as never)).rejects.toMatchObject({ status: 404 });

		expect(h.authorizeLibraryDocument).toHaveBeenCalledWith({ documentId, actorId });
		expect(h.pgQuery).not.toHaveBeenCalled();
		expect(h.statSeaweedObject).not.toHaveBeenCalled();
		expect(h.getSeaweedStream).not.toHaveBeenCalled();
		expect(h.getSeaweedPartialStream).not.toHaveBeenCalled();
	});

	it.each([
		[actorB, documentA],
		[actorA, documentB],
	])('denies actor %s searching foreign document %s before analytics, embedding, or SQL', async (actorId, documentId) => {
		h.authorizeLibraryDocument.mockResolvedValue({ allowed: false, reason: 'DOCUMENT_NOT_OWNED' });
		const response = await getLibrarySearch({
			url: new URL(`http://x/api/library/search?q=hearing&documentId=${documentId}`),
			locals: { user: { id: actorId } },
		} as never);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ hits: [], results: [], total: 0 });
		expect(h.authorizeLibraryDocument).toHaveBeenCalledWith({ documentId, actorId: Number(actorId) });
		expect(h.recordSearchQuery).not.toHaveBeenCalled();
		expect(h.generateSingleEmbedding).not.toHaveBeenCalled();
		expect(h.pgQuery).not.toHaveBeenCalled();
		expect(h.filterVisibleLibraryDocumentIds).not.toHaveBeenCalled();
	});
});
