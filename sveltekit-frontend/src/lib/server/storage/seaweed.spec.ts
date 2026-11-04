import { afterEach, describe, expect, it, vi } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { putFileToSeaweed, seaweed } from './seaweed.js';

describe('putFileToSeaweed', () => {
	afterEach(() => vi.restoreAllMocks());

	it('writes to the explicit bucket and key without a bucket-creation request', async () => {
		const send = vi.spyOn(seaweed, 'send').mockResolvedValue({ ETag: 'fixture-etag' } as never);
		const bytes = Buffer.from('scratch fixture');

		await expect(putFileToSeaweed({
			bucket: 'legal-evidence',
			objectKey: 'evidence/scratch/fixture.txt',
			bytes,
			contentType: 'text/plain',
			metadata: { 'X-Evidence-Hash': 'fixture-sha256' },
		})).resolves.toEqual({ etag: 'fixture-etag' });

		expect(send).toHaveBeenCalledTimes(1);
		const command = send.mock.calls[0][0];
		expect(command).toBeInstanceOf(PutObjectCommand);
		expect(command.input).toMatchObject({
			Bucket: 'legal-evidence',
			Key: 'evidence/scratch/fixture.txt',
			ContentType: 'text/plain',
			Metadata: { 'X-Evidence-Hash': 'fixture-sha256' },
		});
	});
});
