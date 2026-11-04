/**
 * Pure source-integrity check for evidence processing.
 *
 * The queue worker compares the stored object's SHA-256 with the expected source hash before
 * extraction or embedding. This helper holds that comparison so it can be tested directly.
 * Wiring it into the worker is a separate, reviewed change.
 */
import { createHash } from 'node:crypto';

export type SourceCheck =
	| { ok: true; computed: string }
	| { ok: false; code: 'EVIDENCE_SOURCE_SHA256_REQUIRED' | 'EVIDENCE_SOURCE_SHA256_MISMATCH'; computed: string };

const EXPECTED = /^sha256:[a-f0-9]{64}$/;

export function checkSourceSha256(bytes: Uint8Array, expected: string | null | undefined): SourceCheck {
	const computed = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
	if (!expected || !EXPECTED.test(expected)) {
		return { ok: false, code: 'EVIDENCE_SOURCE_SHA256_REQUIRED', computed };
	}
	if (computed !== expected) {
		return { ok: false, code: 'EVIDENCE_SOURCE_SHA256_MISMATCH', computed };
	}
	return { ok: true, computed };
}
