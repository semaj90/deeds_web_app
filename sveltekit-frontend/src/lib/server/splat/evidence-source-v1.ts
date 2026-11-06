import { createHash } from 'node:crypto';
import { parseSpz, SPZ_DEFAULT_MAX_POINTS, SPZ_DEFAULT_MAX_SOURCE_BYTES } from '$lib/splat/spz-loader.js';

export const SPZ_EVIDENCE_SOURCE_MAX_POINTS = 1_100_000;

export type SpzEvidenceSourceErrorCode =
	| 'EVIDENCE_SOURCE_NOT_SPZ'
	| 'EVIDENCE_SOURCE_HASH_INVALID'
	| 'EVIDENCE_SOURCE_HASH_MISMATCH'
	| 'EVIDENCE_SOURCE_TOO_LARGE'
	| 'EVIDENCE_SOURCE_INVALID';

export class SpzEvidenceSourceError extends Error {
	constructor(readonly code: SpzEvidenceSourceErrorCode, message: string = code) {
		super(message);
		this.name = 'SpzEvidenceSourceError';
	}
}

/** Verify exact canonical evidence bytes before allowing the browser fixture viewer to decode them. */
export function verifySpzEvidenceSourceV1(input: {
	fileName: string | null;
	mimeType: string | null;
	expectedSha256: string | null;
	bytes: Uint8Array;
}): { sourceSha256: string; byteLength: number; decodedByteLength: number; pointCount: number; shDegree: number } {
	if (!input.fileName?.toLowerCase().endsWith('.spz')) {
		throw new SpzEvidenceSourceError('EVIDENCE_SOURCE_NOT_SPZ');
	}
	const mimeType = input.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
	if (mimeType && !['model/x-spz', 'application/vnd.spz', 'application/octet-stream'].includes(mimeType)) {
		throw new SpzEvidenceSourceError('EVIDENCE_SOURCE_NOT_SPZ');
	}
	if (!/^sha256:[a-f0-9]{64}$/.test(input.expectedSha256 ?? '')) {
		throw new SpzEvidenceSourceError('EVIDENCE_SOURCE_HASH_INVALID');
	}
	if (input.bytes.byteLength === 0 || input.bytes.byteLength > SPZ_DEFAULT_MAX_SOURCE_BYTES) {
		throw new SpzEvidenceSourceError('EVIDENCE_SOURCE_TOO_LARGE');
	}
	const sourceSha256 = `sha256:${createHash('sha256').update(input.bytes).digest('hex')}`;
	if (sourceSha256 !== input.expectedSha256) {
		throw new SpzEvidenceSourceError('EVIDENCE_SOURCE_HASH_MISMATCH');
	}
	try {
		const decoded = parseSpz(input.bytes, { maxPoints: Math.min(SPZ_DEFAULT_MAX_POINTS, SPZ_EVIDENCE_SOURCE_MAX_POINTS) });
		const decodedByteLength = decoded.positions.byteLength + decoded.alphas.byteLength + decoded.colors.byteLength + decoded.scales.byteLength + decoded.rotations.byteLength + decoded.sh.byteLength;
		return {
			sourceSha256,
			byteLength: input.bytes.byteLength,
			decodedByteLength,
			pointCount: decoded.numPoints,
			shDegree: decoded.shDegree,
		};
	} catch (cause) {
		throw new SpzEvidenceSourceError('EVIDENCE_SOURCE_INVALID', cause instanceof Error ? cause.message : String(cause));
	}
}
