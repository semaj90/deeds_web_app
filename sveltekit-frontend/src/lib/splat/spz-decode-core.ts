/**
 * Worker-safe SPZ decode core. No DOM and no `self` references, so it runs in Node tests and in a worker.
 *
 * Message protocol (typed):
 *   request  decode  { type, id, bytes: ArrayBuffer, maxPoints? }   bytes are TRANSFERRED: the sender's buffer is detached
 *   request  cancel  { type, id }
 *   response result  { type, id, payload }                          payload typed arrays are TRANSFERRED to the caller
 *   response error   { type, id, code, message }
 *
 * Cancellation: a cancel that arrives before the decode starts drops the job. A cancel that arrives while
 * the decode runs drops the result when it finishes. The decode itself is not interrupted.
 */
import { parseSpz, sha256Hex, SpzError, SPZ_DEFAULT_MAX_SOURCE_BYTES, type SpzData } from './spz-loader.js';

export interface SpzDecodeRequest {
	type: 'decode';
	id: number;
	bytes: ArrayBuffer;
	maxPoints?: number;
}

export interface SpzCancelRequest {
	type: 'cancel';
	id: number;
}

export type SpzWorkerRequest = SpzDecodeRequest | SpzCancelRequest;

export interface SpzDecodedPayload extends SpzData {
	/** SHA-256 of the compressed SPZ bytes as received. */
	sourceSha256: string;
	/** SHA-256 over the decoded typed-array bytes, in fixed field order. Compare this across worker and main-thread decodes. */
	decodedSha256: string;
}

export type SpzWorkerResponse =
	| { type: 'result'; id: number; payload: SpzDecodedPayload }
	| { type: 'error'; id: number; code: string; message: string };

/** Fixed field order for the decoded checksum. Changing it changes every decodedSha256. */
const DECODED_FIELDS = ['positions', 'alphas', 'colors', 'scales', 'rotations', 'sh'] as const;

/** Decode SPZ bytes and compute both checksums. Throws SpzError on anything the loader rejects. */
export async function decodeSpz(bytes: Uint8Array, maxPoints?: number): Promise<SpzDecodedPayload> {
	if (bytes.byteLength > SPZ_DEFAULT_MAX_SOURCE_BYTES) {
		throw new SpzError('SPZ_SOURCE_TOO_LARGE', `${bytes.byteLength} > ${SPZ_DEFAULT_MAX_SOURCE_BYTES}`);
	}
	const sourceSha256 = await sha256Hex(bytes);
	const data = parseSpz(bytes, maxPoints === undefined ? {} : { maxPoints });
	const parts = DECODED_FIELDS.map((k) => new Uint8Array(data[k].buffer, data[k].byteOffset, data[k].byteLength));
	const total = parts.reduce((a, p) => a + p.byteLength, 0);
	const joined = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		joined.set(p, off);
		off += p.byteLength;
	}
	const decodedSha256 = await sha256Hex(joined);
	return { ...data, sourceSha256, decodedSha256 };
}

/** Typed arrays that a result message transfers to the caller. */
export function transferListFor(payload: SpzDecodedPayload): ArrayBuffer[] {
	return DECODED_FIELDS.map((k) => payload[k].buffer as ArrayBuffer);
}

/**
 * Create a message handler. `post` sends a response, with an optional transfer list.
 * The worker file passes `self.postMessage`. Tests pass a fake.
 */
export function createSpzWorkerHandler(post: (msg: SpzWorkerResponse, transfer?: ArrayBuffer[]) => void) {
	const cancelled = new Set<number>();

	return async function handle(req: SpzWorkerRequest): Promise<void> {
		if (req.type === 'cancel') {
			cancelled.add(req.id);
			return;
		}
		if (cancelled.has(req.id)) {
			cancelled.delete(req.id);
			post({ type: 'error', id: req.id, code: 'SPZ_CANCELLED', message: 'cancelled before decode' });
			return;
		}
		try {
			const payload = await decodeSpz(new Uint8Array(req.bytes), req.maxPoints);
			if (cancelled.has(req.id)) {
				cancelled.delete(req.id);
				post({ type: 'error', id: req.id, code: 'SPZ_CANCELLED', message: 'cancelled during decode' });
				return;
			}
			post({ type: 'result', id: req.id, payload }, transferListFor(payload));
		} catch (err) {
			const code = err instanceof SpzError ? err.code : 'SPZ_DECODE_UNEXPECTED';
			const message = err instanceof Error ? err.message : String(err);
			post({ type: 'error', id: req.id, code, message });
		}
	};
}
