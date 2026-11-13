import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BoundedStreamErrorV1, pipeBoundedWebStreamV1 } from './library-bounded-stream-v1.js';

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

describe('bounded library upload stream v1', () => {
	it('streams bytes with backpressure and returns their exact SHA-256', async () => {
		const body = Buffer.from('%PDF-1.7\nsource text');
		const sink = vi.fn(async (stream) => { expect(await collect(stream)).toEqual(body); });
		const receipt = await pipeBoundedWebStreamV1({
			body: new ReadableStream({ start(controller) { controller.enqueue(body); controller.close(); } }),
			expectedByteLength: body.byteLength,
			maxBytes: 1024,
			sink,
		});
		expect(receipt).toEqual({ byteLength: body.byteLength, sourceHash: createHash('sha256').update(body).digest('hex') });
		expect(sink).toHaveBeenCalledTimes(1);
	});

	it('validates the file signature before forwarding bytes to storage', async () => {
		const body = Buffer.from('%PDF-1.7\nsource text');
		const sink = vi.fn(async (stream) => { expect(await collect(stream)).toEqual(body); });
		const receipt = await pipeBoundedWebStreamV1({
			body: new ReadableStream({ start(controller) { controller.enqueue(body); controller.close(); } }),
			expectedByteLength: body.byteLength,
			maxBytes: 1024,
			signaturePrefixBytes: 5,
			validateSignaturePrefix: (prefix) => prefix.equals(Buffer.from('%PDF-')),
			sink,
		});
		expect(receipt.sourceHash).toBe(createHash('sha256').update(body).digest('hex'));
		expect(sink).toHaveBeenCalledTimes(1);
	});

	it('rejects a MIME/signature mismatch before forwarding any bytes', async () => {
		const forwarded: Buffer[] = [];
		const invalidBody = Buffer.from('<html>not a PDF');
		await expect(pipeBoundedWebStreamV1({
			body: new ReadableStream({ start(controller) { controller.enqueue(invalidBody); controller.close(); } }),
			expectedByteLength: invalidBody.byteLength,
			maxBytes: 1024,
			signaturePrefixBytes: 5,
			validateSignaturePrefix: (prefix) => prefix.equals(Buffer.from('%PDF-')),
			sink: async (stream) => { for await (const chunk of stream as AsyncIterable<Buffer>) forwarded.push(Buffer.from(chunk)); },
		})).rejects.toMatchObject({ name: 'BoundedStreamErrorV1', message: 'LIBRARY_UPLOAD_SIGNATURE_MISMATCH' });
		expect(forwarded).toHaveLength(0);
	});

	it('aborts a stream that exceeds the declared size or configured maximum', async () => {
		const sink = async (stream: NodeJS.ReadableStream) => { await collect(stream); };
		await expect(pipeBoundedWebStreamV1({
			body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9)); controller.close(); } }),
			expectedByteLength: 8,
			maxBytes: 10,
			sink,
		})).rejects.toMatchObject({ name: 'BoundedStreamErrorV1', message: 'LIBRARY_UPLOAD_LENGTH_EXCEEDED' });
		await expect(pipeBoundedWebStreamV1({
			body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); controller.close(); } }),
			expectedByteLength: 12,
			maxBytes: 10,
			sink,
		})).rejects.toThrow('LIBRARY_UPLOAD_LENGTH_OUT_OF_RANGE');
	});

	it('rejects a short body after sink completion with a reconciliation hash', async () => {
		await expect(pipeBoundedWebStreamV1({
			body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }),
			expectedByteLength: 4,
			maxBytes: 10,
			sink: async (stream) => { await collect(stream); },
		})).rejects.toMatchObject({
			name: 'BoundedStreamErrorV1',
			message: 'LIBRARY_UPLOAD_LENGTH_MISMATCH',
			byteLength: 3,
			partialSha256: createHash('sha256').update(Buffer.from([1, 2, 3])).digest('hex'),
		});
	});
});
