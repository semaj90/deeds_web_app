// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
	uploadLibraryDocumentStreamV1: vi.fn(),
	getAuthorizedCase: vi.fn(),
}));

vi.mock('$lib/server/legal/ingestion-worker.js', () => ({
	uploadLibraryDocumentStreamV1: h.uploadLibraryDocumentStreamV1,
}));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: h.getAuthorizedCase }));

import { POST } from './+server.js';

const CASE_ID = '44444444-4444-4444-8444-444444444444';

async function boundedMultipartRequest(form: FormData) {
	const encoded = new Request('http://localhost/api/library/upload', { method: 'POST', body: form });
	const contentType = encoded.headers.get('content-type');
	if (!contentType) throw new Error('FormData request did not set a multipart content type');
	const body = await encoded.arrayBuffer();
	return new Request('http://localhost/api/library/upload', {
		method: 'POST',
		headers: { 'content-type': contentType, 'content-length': String(body.byteLength) },
		body,
	});
}

async function requestWithCase(caseId: string) {
	const form = new FormData();
	form.append('file', new Blob(['%PDF-1.7 test'], { type: 'application/pdf' }), 'test.pdf');
	form.append('title', 'Test document');
	form.append('caseId', caseId);
	return boundedMultipartRequest(form);
}

function rawPdfRequest(caseId: string) {
	return new Request('http://localhost/api/library/upload', {
		method: 'POST',
		headers: {
			'content-type': 'application/pdf',
			'x-library-byte-length': '13',
			'x-library-title': 'Streamed document',
			'x-case-id': caseId,
		},
		body: Buffer.from('%PDF-1.7 test'),
	});
}

function rawPdfRequestWithMetadata(metadata: Record<string, unknown>) {
	const encoded = Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64url');
	return new Request('http://localhost/api/library/upload', {
		method: 'POST',
		headers: {
			'content-type': 'application/pdf',
			'x-library-byte-length': '13',
			'x-library-metadata': encoded,
			'x-file-name': encodeURIComponent('Déclaration.pdf'),
		},
		body: Buffer.from('%PDF-1.7 test'),
	});
}

describe('POST /api/library/upload case binding', () => {
	beforeEach(() => {
		h.uploadLibraryDocumentStreamV1.mockReset();
		h.getAuthorizedCase.mockReset();
		h.uploadLibraryDocumentStreamV1.mockResolvedValue({ documentId: 'doc-2', jobId: 'job-2', sourceHash: 'a'.repeat(64), byteLength: 13, alreadyExists: false, processingStatus: 'queued' });
	});

	it('authorizes and persists the caseId supplied in multipart form data', async () => {
		h.getAuthorizedCase.mockResolvedValue({ id: CASE_ID });
		const response = await POST({ request: await requestWithCase(CASE_ID), locals: { user: { id: '7' } } } as never);

		expect(response.status).toBe(202);
		expect(h.getAuthorizedCase).toHaveBeenCalledWith(CASE_ID, 7);
		expect(h.uploadLibraryDocumentStreamV1).toHaveBeenCalledWith(expect.objectContaining({ caseId: CASE_ID, mimeType: 'application/pdf', userId: '7' }));
	});

	it('rejects a denied multipart case before storage or queue writes', async () => {
		h.getAuthorizedCase.mockResolvedValue(null);
		const response = await POST({ request: await requestWithCase(CASE_ID), locals: { user: { id: '7' } } } as never);

		expect(response.status).toBe(404);
		expect(h.uploadLibraryDocumentStreamV1).not.toHaveBeenCalled();
	});

	it('uses the bounded raw-PDF stream path after case authorization', async () => {
		h.getAuthorizedCase.mockResolvedValue({ id: CASE_ID });
		const response = await POST({ request: rawPdfRequest(CASE_ID), locals: { user: { id: '7' } }, url: new URL('http://x/api/library/upload') } as never);

		expect(response.status).toBe(202);
		expect(h.getAuthorizedCase).toHaveBeenCalledWith(CASE_ID, 7);
		expect(h.uploadLibraryDocumentStreamV1).toHaveBeenCalledWith(expect.objectContaining({ caseId: CASE_ID, byteLength: 13, userId: '7' }));
	});

	it('decodes raw-upload metadata and a Unicode filename from headers without URL metadata', async () => {
		const request = rawPdfRequestWithMetadata({ title: 'Déclaration № 3', caseId: CASE_ID, corpusType: 'case' });
		h.getAuthorizedCase.mockResolvedValue({ id: CASE_ID });
		const response = await POST({ request, locals: { user: { id: '7' } }, url: new URL('http://x/api/library/upload') } as never);

		expect(response.status).toBe(202);
		expect(h.getAuthorizedCase).toHaveBeenCalledWith(CASE_ID, 7);
		expect(h.uploadLibraryDocumentStreamV1).toHaveBeenCalledWith(expect.objectContaining({
			title: 'Déclaration № 3',
				corpusType: 'case',
				caseId: CASE_ID,
				fileName: 'Déclaration.pdf',
		}));
	});

	it('rejects malformed raw-upload metadata before authorization or storage', async () => {
		const request = new Request('http://localhost/api/library/upload', {
			method: 'POST',
			headers: { 'content-type': 'application/pdf', 'x-library-byte-length': '13', 'x-library-metadata': 'not-json' },
			body: Buffer.from('%PDF-1.7 test'),
		});
		const response = await POST({ request, locals: { user: { id: '7' } }, url: new URL('http://x/api/library/upload') } as never);

		expect(response.status).toBe(400);
		expect(h.getAuthorizedCase).not.toHaveBeenCalled();
		expect(h.uploadLibraryDocumentStreamV1).not.toHaveBeenCalled();
		expect(request.bodyUsed).toBe(false);
	});

	it('rejects denied case before invoking the raw stream writer', async () => {
		h.getAuthorizedCase.mockResolvedValue(null);
		const request = rawPdfRequest(CASE_ID);
		const response = await POST({ request, locals: { user: { id: '7' } }, url: new URL('http://x/api/library/upload') } as never);

		expect(response.status).toBe(404);
		expect(h.uploadLibraryDocumentStreamV1).not.toHaveBeenCalled();
		expect(request.bodyUsed).toBe(false);
	});

	it('admits an authorized PNG through the same bounded stream path', async () => {
		h.getAuthorizedCase.mockResolvedValue({ id: CASE_ID });
		const form = new FormData();
		form.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], { type: 'image/png' }), 'scan.png');
		form.append('caseId', CASE_ID);
		const response = await POST({ request: await boundedMultipartRequest(form), locals: { user: { id: '7' } } } as never);

		expect(response.status).toBe(202);
		expect(h.uploadLibraryDocumentStreamV1).toHaveBeenCalledWith(expect.objectContaining({ caseId: CASE_ID, mimeType: 'image/png', fileName: 'scan.png', userId: '7' }));
	});

	it('rejects multipart without Content-Length before parsing the body', async () => {
		const request = new Request('http://localhost/api/library/upload', {
			method: 'POST',
			headers: { 'content-type': 'multipart/form-data; boundary=test' },
			body: '--test--\r\n',
		});
		const response = await POST({ request, locals: { user: { id: '7' } } } as never);

		expect(response.status).toBe(411);
		expect(request.bodyUsed).toBe(false);
		expect(h.uploadLibraryDocumentStreamV1).not.toHaveBeenCalled();
	});

	it('rejects oversized multipart before parsing the body', async () => {
		const formDataSpy = vi.fn();
		const request = {
			headers: new Headers({
				'content-type': 'multipart/form-data; boundary=test',
				'content-length': String(201 * 1024 * 1024 + 1),
			}),
			formData: formDataSpy,
		};
		const response = await POST({ request, locals: { user: { id: '7' } } } as never);

		expect(response.status).toBe(413);
		expect(formDataSpy).not.toHaveBeenCalled();
		expect(h.uploadLibraryDocumentStreamV1).not.toHaveBeenCalled();
	});
});
