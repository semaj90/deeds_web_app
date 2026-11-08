/**
 * SPZ source admission gate. Runs before a scene is shown in Detective Mode.
 *
 * Checks, in order: case authorization (a boolean the server supplies after its own membership check),
 * the size limit, the compressed source SHA-256 against the trusted expected value, and only then the decode.
 * Admission records both the compressed source hash and the decoded checksum. Provenance and rendering stay separate.
 *
 * Not implemented here: the server-side case and evidence membership lookup. The caller must set caseAuthorized.
 */
import { decodeSpz } from './spz-decode-core.js';
import { sha256Hex, SpzError } from './spz-loader.js';

export interface AdmissionLimits {
	maxSourceBytes: number;
	maxPoints: number;
}

export interface AdmissionInput {
	bytes: Uint8Array;
	evidenceId: string;
	expectedSourceSha256: string;
	/** Set by the server only after it verifies the caller's membership in the case that owns evidenceId. */
	caseAuthorized: boolean;
	limits: AdmissionLimits;
}

export interface AdmittedScene {
	evidenceId: string;
	sourceSha256: string;
	decodedSha256: string;
	formatVersion: 4;
	coordinateSystem: 'RUB';
	shDegree: number;
	pointCount: number;
}

export type AdmissionCode =
	| 'ADMISSION_UNAUTHORIZED'
	| 'ADMISSION_SOURCE_TOO_LARGE'
	| 'ADMISSION_SHA256_FORMAT'
	| 'ADMISSION_SHA256_MISMATCH'
	| 'ADMISSION_FORMAT_INVALID';

export class AdmissionError extends Error {
	constructor(
		public readonly code: AdmissionCode,
		message: string
	) {
		super(message);
		this.name = 'AdmissionError';
	}
}

export async function admitSpzSource(input: AdmissionInput): Promise<AdmittedScene> {
	if (!input.caseAuthorized) throw new AdmissionError('ADMISSION_UNAUTHORIZED', 'caller is not authorized for this case');
	if (input.bytes.byteLength > input.limits.maxSourceBytes) {
		throw new AdmissionError('ADMISSION_SOURCE_TOO_LARGE', `${input.bytes.byteLength} > ${input.limits.maxSourceBytes}`);
	}
	if (!/^[a-f0-9]{64}$/.test(input.expectedSourceSha256)) {
		throw new AdmissionError('ADMISSION_SHA256_FORMAT', 'expected SHA-256 must be 64 lowercase hex characters');
	}
	const sourceSha256 = await sha256Hex(input.bytes);
	if (sourceSha256 !== input.expectedSourceSha256) {
		throw new AdmissionError('ADMISSION_SHA256_MISMATCH', 'compressed source does not match the recorded SHA-256');
	}

	let decoded: Awaited<ReturnType<typeof decodeSpz>>;
	try {
		decoded = await decodeSpz(input.bytes, input.limits.maxPoints);
	} catch (err) {
		const detail = err instanceof SpzError ? err.code : 'unknown';
		throw new AdmissionError('ADMISSION_FORMAT_INVALID', `decode rejected (${detail})`);
	}
	return {
		evidenceId: input.evidenceId,
		sourceSha256: decoded.sourceSha256,
		decodedSha256: decoded.decodedSha256,
		formatVersion: 4,
		coordinateSystem: decoded.coordinateSystem,
		shDegree: decoded.shDegree,
		pointCount: decoded.numPoints
	};
}
