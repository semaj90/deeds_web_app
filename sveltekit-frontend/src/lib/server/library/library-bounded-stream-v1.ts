import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';

export interface BoundedStreamReceiptV1 {
	byteLength: number;
	sourceHash: string;
}

export class BoundedStreamErrorV1 extends Error {
	constructor(
		message: string,
		readonly byteLength: number,
		readonly partialSha256: string,
	) {
		super(message);
		this.name = 'BoundedStreamErrorV1';
	}
}

/** Pipes a Web request body through a bounded hash meter while preserving backpressure. */
export async function pipeBoundedWebStreamV1(input: {
	body: ReadableStream<Uint8Array>;
	expectedByteLength: number;
	maxBytes: number;
	signaturePrefixBytes?: number;
	validateSignaturePrefix?: (prefix: Buffer) => boolean;
	sink: (stream: Readable) => Promise<void>;
}): Promise<BoundedStreamReceiptV1> {
	if (!Number.isSafeInteger(input.expectedByteLength) || input.expectedByteLength <= 0 || input.expectedByteLength > input.maxBytes) {
		throw new Error('LIBRARY_UPLOAD_LENGTH_OUT_OF_RANGE');
	}
	if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) throw new Error('LIBRARY_UPLOAD_LIMIT_INVALID');
	const hash = createHash('sha256');
	let byteLength = 0;
	let signaturePrefix = Buffer.alloc(0);
	let signatureValidated = !input.validateSignaturePrefix;
	const meter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			byteLength += chunk.byteLength;
			if (byteLength > input.maxBytes || byteLength > input.expectedByteLength) {
				callback(new BoundedStreamErrorV1('LIBRARY_UPLOAD_LENGTH_EXCEEDED', byteLength, hash.copy().digest('hex')));
				return;
			}
			if (!signatureValidated) {
				signaturePrefix = Buffer.concat([signaturePrefix, chunk]);
				const requiredPrefixBytes = input.signaturePrefixBytes ?? 1;
				if (signaturePrefix.byteLength < requiredPrefixBytes) {
					callback();
					return;
				}
				if (!input.validateSignaturePrefix?.(signaturePrefix.subarray(0, requiredPrefixBytes))) {
					callback(new BoundedStreamErrorV1('LIBRARY_UPLOAD_SIGNATURE_MISMATCH', byteLength, hash.copy().digest('hex')));
					return;
				}
				signatureValidated = true;
				hash.update(signaturePrefix);
				callback(null, signaturePrefix);
				signaturePrefix = Buffer.alloc(0);
				return;
			}
			hash.update(chunk);
			callback(null, chunk);
		},
		flush(callback) {
			if (!signatureValidated) {
				callback(new BoundedStreamErrorV1('LIBRARY_UPLOAD_SIGNATURE_MISMATCH', byteLength, hash.copy().digest('hex')));
				return;
			}
			callback();
		},
	});
	const source = Readable.fromWeb(input.body as import('node:stream/web').ReadableStream<Uint8Array>);
	source.once('error', (cause) => meter.destroy(cause as Error));
	source.pipe(meter);
	await input.sink(meter);
	if (byteLength !== input.expectedByteLength) {
		throw new BoundedStreamErrorV1('LIBRARY_UPLOAD_LENGTH_MISMATCH', byteLength, hash.copy().digest('hex'));
	}
	return { byteLength, sourceHash: hash.digest('hex') };
}
