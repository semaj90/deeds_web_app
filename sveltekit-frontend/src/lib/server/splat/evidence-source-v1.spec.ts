import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifySpzEvidenceSourceV1 } from './evidence-source-v1.js';

function smallSpzFixture(): Uint8Array {
	// A valid small Niantic-produced fixture is used by the decoder tests.
	return new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/splat/fixtures/niantic-official-degree0-5pt.spz')));
}

describe('verifySpzEvidenceSourceV1', () => {
	it('requires an SPZ filename and trusted SHA-256 before decoding', () => {
		const bytes = smallSpzFixture();
		expect(() => verifySpzEvidenceSourceV1({ fileName: 'evidence.pdf', mimeType: 'application/pdf', expectedSha256: 'sha256:' + 'a'.repeat(64), bytes })).toThrow('EVIDENCE_SOURCE_NOT_SPZ');
		expect(() => verifySpzEvidenceSourceV1({ fileName: 'scene.spz', mimeType: 'application/octet-stream', expectedSha256: null, bytes })).toThrow('EVIDENCE_SOURCE_HASH_INVALID');
	});

	it('rejects a mismatched digest before parser work', () => {
		const bytes = smallSpzFixture();
		const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		expect(() => verifySpzEvidenceSourceV1({ fileName: 'scene.spz', mimeType: 'model/x-spz', expectedSha256: 'sha256:' + 'a'.repeat(64), bytes })).toThrow('EVIDENCE_SOURCE_HASH_MISMATCH');
		expect(digest).not.toBe('sha256:' + 'a'.repeat(64));
	});
});
