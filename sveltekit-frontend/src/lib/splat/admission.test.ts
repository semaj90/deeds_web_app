import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { admitSpzSource, type AdmissionInput } from './admission.js';
import { decodeSpz } from './spz-decode-core.js';

const fixturePath = resolve(process.cwd(), 'src/lib/splat/fixtures/niantic-official-degree1-3pt.spz');
const bytes = new Uint8Array(readFileSync(fixturePath));
const EVIDENCE = '00000000-0000-4000-8000-000000000001';
const LIMITS = { maxSourceBytes: 1_000_000, maxPoints: 1000 };

async function baseInput(over: Partial<AdmissionInput> = {}): Promise<AdmissionInput> {
	const direct = await decodeSpz(bytes);
	return {
		bytes,
		evidenceId: EVIDENCE,
		expectedSourceSha256: direct.sourceSha256,
		caseAuthorized: true,
		limits: LIMITS,
		...over
	};
}

describe('admitSpzSource', () => {
	it('admits an authorized, hash-matching official fixture with both checksums recorded', async () => {
		const scene = await admitSpzSource(await baseInput());
		const direct = await decodeSpz(bytes);
		expect(scene.evidenceId).toBe(EVIDENCE);
		expect(scene.sourceSha256).toBe(direct.sourceSha256);
		expect(scene.decodedSha256).toBe(direct.decodedSha256);
		expect(scene.pointCount).toBe(3);
		expect(scene.shDegree).toBe(1);
		expect(scene.formatVersion).toBe(4);
		expect(scene.coordinateSystem).toBe('RUB');
	});

	it('rejects callers the server did not authorize for the case', async () => {
		await expect(admitSpzSource(await baseInput({ caseAuthorized: false }))).rejects.toMatchObject({
			code: 'ADMISSION_UNAUTHORIZED'
		});
	});

	it('rejects a source above the byte limit before decoding', async () => {
		await expect(
			admitSpzSource(await baseInput({ limits: { maxSourceBytes: 10, maxPoints: 1000 } }))
		).rejects.toMatchObject({ code: 'ADMISSION_SOURCE_TOO_LARGE' });
	});

	it('rejects a malformed expected hash', async () => {
		await expect(admitSpzSource(await baseInput({ expectedSourceSha256: 'ABC' }))).rejects.toMatchObject({
			code: 'ADMISSION_SHA256_FORMAT'
		});
	});

	it('rejects a source whose SHA-256 does not match the recorded value', async () => {
		await expect(
			admitSpzSource(await baseInput({ expectedSourceSha256: '0'.repeat(64) }))
		).rejects.toMatchObject({ code: 'ADMISSION_SHA256_MISMATCH' });
	});

	it('checks the trusted source hash before attempting to decode malformed bytes', async () => {
		const garbage = new Uint8Array(64).fill(9);
		await expect(admitSpzSource({ ...(await baseInput()), bytes: garbage })).rejects.toMatchObject({
			code: 'ADMISSION_SHA256_MISMATCH'
		});
	});

	it('rejects bytes that are not a valid SPZ, using the format code', async () => {
		const garbage = new Uint8Array(64).fill(9);
		const { sha256Hex } = await import('./spz-loader.js');
		const expected = await sha256Hex(garbage);
		await expect(
			admitSpzSource({ ...(await baseInput()), bytes: garbage, expectedSourceSha256: expected })
		).rejects.toMatchObject({ code: 'ADMISSION_FORMAT_INVALID' });
	});

	it('rejects a scene above the point cap', async () => {
		await expect(
			admitSpzSource(await baseInput({ limits: { maxSourceBytes: 1_000_000, maxPoints: 2 } }))
		).rejects.toMatchObject({ code: 'ADMISSION_FORMAT_INVALID' });
	});
});
