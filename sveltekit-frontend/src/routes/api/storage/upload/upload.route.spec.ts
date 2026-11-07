// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './+server.js';
import { storageBuckets } from '$lib/server/storage/storage-buckets.js';
import crypto from 'node:crypto';

// Mock putFileToSeaweed
vi.mock('$lib/server/storage/seaweed.js', () => ({
	putFileToSeaweed: vi.fn().mockResolvedValue({ etag: '"etag-mock-sha256"' })
}));

import { putFileToSeaweed } from '$lib/server/storage/seaweed.js';

describe('POST /api/storage/upload (SeaweedFS Multi-Bucket S3 Stream)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(putFileToSeaweed).mockResolvedValue({ etag: '"etag-mock-sha256"' });
	});

	it('rejects unauthenticated requests with 401 and stable JSON', async () => {
		const request = new Request('http://localhost/api/storage/upload', {
			method: 'POST'
		});
		const locals = { user: null };

		const res = await POST({ request, locals } as any);
		expect(res.status).toBe(401);

		const data = await res.json();
		expect(data).toMatchObject({
			success: false,
			error: 'Unauthorized',
			bucket: null,
			objectKey: null,
			sha256: null
		});
	});

	it('rejects invalid or missing bucket with 400', async () => {
		const formData = new FormData();
		const file = new File(['mock content'], 'test.txt', { type: 'text/plain' });
		formData.append('file', file);
		formData.append('bucket', 'invalid-bucket-xyz');

		const request = new Request('http://localhost/api/storage/upload', {
			method: 'POST',
			body: formData
		});
		const locals = { user: { id: 'usr-123' } };

		const res = await POST({ request, locals } as any);
		expect(res.status).toBe(400);

		const data = await res.json();
		expect(data.success).toBe(false);
		expect(data.error).toBeDefined();
	});

	it('successfully streams to legal-evidence with real SHA-256', async () => {
		const content = 'Test legal evidence statement under penalty of perjury.';
		const expectedSha256 = crypto.createHash('sha256').update(content).digest('hex');

		const formData = new FormData();
		const file = new File([content], 'deposition.txt', { type: 'text/plain' });
		formData.append('file', file);
		formData.append('bucket', storageBuckets.evidence);
		formData.append('objectKey', 'cases/case-986/deposition.txt');
		formData.append('category', 'deposition');

		const request = new Request('http://localhost/api/storage/upload', {
			method: 'POST',
			body: formData
		});
		const locals = { user: { id: 'usr-123' } };

		const res = await POST({ request, locals } as any);
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(data).toMatchObject({
			success: true,
			bucket: 'legal-evidence',
			objectKey: 'cases/case-986/deposition.txt',
			sha256: expectedSha256,
			size: Buffer.from(content).length,
			contentType: 'text/plain',
			etag: '"etag-mock-sha256"'
		});

		expect(putFileToSeaweed).toHaveBeenCalledWith(
			expect.objectContaining({
				bucket: 'legal-evidence',
				objectKey: 'cases/case-986/deposition.txt',
				contentType: 'text/plain',
				metadata: expect.objectContaining({
					'x-sha256': expectedSha256,
					'x-category': 'deposition'
				})
			})
		);
	});

	it('successfully routes to federal-law and state-law buckets', async () => {
		const bucketsToTest = [
			storageBuckets.federalLaw,
			storageBuckets.stateLaw,
			storageBuckets.legalCorpus
		];

		for (const targetBucket of bucketsToTest) {
			const content = `Statutory code snippet for ${targetBucket}`;
			const formData = new FormData();
			const file = new File([content], 'code.txt', { type: 'text/plain' });
			formData.append('file', file);
			formData.append('bucket', targetBucket);

			const request = new Request('http://localhost/api/storage/upload', {
				method: 'POST',
				body: formData
			});
			const locals = { user: { id: 'usr-456' } };

			const res = await POST({ request, locals } as any);
			expect(res.status).toBe(200);

			const data = await res.json();
			expect(data.success).toBe(true);
			expect(data.bucket).toBe(targetBucket);
			expect(data.sha256).toBe(crypto.createHash('sha256').update(content).digest('hex'));
		}
	});

	it('returns 500 with stable shape when SeaweedFS upload fails', async () => {
		vi.mocked(putFileToSeaweed).mockRejectedValueOnce(new Error('Seaweed S3 Connection Refused'));

		const formData = new FormData();
		const file = new File(['content'], 'sample.pdf', { type: 'application/pdf' });
		formData.append('file', file);
		formData.append('bucket', storageBuckets.evidence);

		const request = new Request('http://localhost/api/storage/upload', {
			method: 'POST',
			body: formData
		});
		const locals = { user: { id: 'usr-789' } };

		const res = await POST({ request, locals } as any);
		expect(res.status).toBe(500);

		const data = await res.json();
		expect(data).toMatchObject({
			success: false,
			error: 'Seaweed S3 Connection Refused',
			bucket: null,
			objectKey: null,
			sha256: null
		});
	});
});
