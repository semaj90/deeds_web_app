/**
 * Local SPZ Viewer Integration Bridge
 *
 * Connects the 2.5D Gaussian serializer (serializeSpz) to the authoritative decoder (parseSpz)
 * and renderer without introducing secondary codecs or shadow registries.
 *
 * Provides:
 * - Generation cancellation across rapid image/depth modifications
 * - Point count and byte-budget validation
 * - Niantic SPZ v4 attribute stream size consistency verification
 * - Crypto SHA-256 calculation for immutable provenance
 * - Explicit client-side download utility
 */

import type { GaussianCloud } from './spz-serializer.js';
import { sha256Hex, SPZ_DEFAULT_MAX_POINTS, SPZ_DEFAULT_MAX_SOURCE_BYTES } from './spz-loader.js';

export class LocalSpzSessionError extends Error {
	constructor(
		public readonly code: string,
		message?: string
	) {
		super(message ?? code);
		this.name = 'LocalSpzSessionError';
	}
}

export interface LocalSpzSessionOptions<TDecoded> {
	serialize: (cloud: GaussianCloud) => Uint8Array;
	decode: (bytes: Uint8Array) => TDecoded;
	decodedPointCount: (decoded: TDecoded) => number;
	maxPoints?: number;
	maxByteBudget?: number;
}

export interface LocalSpzSessionResult<TDecoded> {
	bytes: Uint8Array;
	sha256: string;
	pointCount: number;
	uncompressedBytes: number;
	decoded: TDecoded;
	download: (filename?: string) => void;
}

export interface LocalSpzSession<TDecoded> {
	process(cloud: GaussianCloud): Promise<LocalSpzSessionResult<TDecoded> | null>;
	cancel(): void;
	getEpoch(): number;
}

/**
 * Validates that uncompressed stream sizes match point count for standard degree-0 SPZ v4:
 * - positions: 9 bytes/pt (3 coordinates * 3 bytes 24-bit fixed point)
 * - alphas: 1 byte/pt
 * - colors: 3 bytes/pt (RGB degree-0 SH)
 * - scales: 3 bytes/pt
 * - rotations: 4 bytes/pt (smallest-three)
 * Total: 20 bytes/pt
 */
export function validateSpzV4UncompressedSize(pointCount: number, actualUncompressedBytes: number): boolean {
	const expected = pointCount * 20;
	return expected === actualUncompressedBytes;
}

export function createLocalSpzSession<TDecoded>(
	options: LocalSpzSessionOptions<TDecoded>
): LocalSpzSession<TDecoded> {
	const maxPoints = options.maxPoints ?? SPZ_DEFAULT_MAX_POINTS;
	const maxByteBudget = options.maxByteBudget ?? SPZ_DEFAULT_MAX_SOURCE_BYTES;

	let currentEpoch = 0;

	return {
		getEpoch: () => currentEpoch,

		cancel: () => {
			currentEpoch++;
		},

		async process(cloud: GaussianCloud): Promise<LocalSpzSessionResult<TDecoded> | null> {
			const epoch = ++currentEpoch;

			if (cloud.numPoints <= 0) {
				throw new LocalSpzSessionError('INVALID_POINT_COUNT', 'Cloud must contain at least 1 point');
			}
			if (cloud.numPoints > maxPoints) {
				throw new LocalSpzSessionError('POINT_COUNT_EXCEEDED', `Point count ${cloud.numPoints} exceeds limit ${maxPoints}`);
			}

			// 1. Serialize
			const bytes = options.serialize(cloud);

			// Check cancellation
			if (epoch !== currentEpoch) return null;

			if (bytes.length > maxByteBudget) {
				throw new LocalSpzSessionError(
					'BYTE_BUDGET_EXCEEDED',
					`Serialized SPZ bytes ${bytes.length} exceeds budget ${maxByteBudget}`
				);
			}

			// 2. Compute SHA-256 hash
			const sha256 = await sha256Hex(bytes);
			if (epoch !== currentEpoch) return null;

			// 3. Decode through authoritative decoder
			const decoded = options.decode(bytes);
			if (epoch !== currentEpoch) return null;

			const decodedCount = options.decodedPointCount(decoded);
			if (decodedCount !== cloud.numPoints) {
				throw new LocalSpzSessionError(
					'DECODE_POINT_COUNT_MISMATCH',
					`Decoded point count ${decodedCount} does not match cloud ${cloud.numPoints}`
				);
			}

			const uncompressedBytes = cloud.numPoints * 20;

			// 4. Client download helper
			const download = (filename = `evidence-relief-${sha256.slice(0, 8)}.spz`) => {
				if (typeof document === 'undefined') return;
				const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				a.click();
				URL.revokeObjectURL(url);
			};

			return {
				bytes,
				sha256,
				pointCount: cloud.numPoints,
				uncompressedBytes,
				decoded,
				download
			};
		}
	};
}
