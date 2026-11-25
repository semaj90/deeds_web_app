import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	ARPC_VERSION,
	ArpcCodecId,
	alignWebGpuBytesPerRow,
	assertPixelFilingAlignmentV1,
	parseAndVerifyArpcEnvelopeV1,
} from './arpc-envelope-v1.js';

function buildTestArpcPacket(body: Uint8Array, codecId = ArpcCodecId.RAW_JSON_UTF8): Uint8Array {
	const digest = createHash('sha256').update(body).digest();
	const out = new Uint8Array(10 + body.byteLength + 32);
	out.set([0x41, 0x52, 0x50, 0x43], 0); // 'ARPC'
	const view = new DataView(out.buffer);
	view.setUint8(4, ARPC_VERSION);
	view.setUint8(5, codecId);
	view.setUint32(6, body.byteLength, true);
	out.set(body, 10);
	out.set(digest, 10 + body.byteLength);
	return out;
}

describe('arpc-envelope-v1 + pixel filing alignment', () => {
	it('verifies ARPC binary header and SHA-256 digest', async () => {
		const body = new TextEncoder().encode('{"ok":true}');
		const packet = buildTestArpcPacket(body, ArpcCodecId.ZLIB_FRAMED);
		const parsed = await parseAndVerifyArpcEnvelopeV1(packet);
		expect(parsed.version).toBe(1);
		expect(parsed.codecId).toBe(ArpcCodecId.ZLIB_FRAMED);
		expect(parsed.bodyLength).toBe(body.byteLength);
	});

	it('fails closed on tampered ARPC digest', async () => {
		const body = new TextEncoder().encode('{"ok":true}');
		const packet = buildTestArpcPacket(body);
		packet[11] ^= 0xff; // flip byte in body
		await expect(parseAndVerifyArpcEnvelopeV1(packet)).rejects.toThrow(/ARPC_CHECKSUM_MISMATCH/);
	});

	it('enforces 256-byte bytesPerRow and 16-byte uniform alignment', () => {
		expect(alignWebGpuBytesPerRow(100)).toBe(256);
		expect(alignWebGpuBytesPerRow(256)).toBe(256);
		expect(alignWebGpuBytesPerRow(300)).toBe(512);

		expect(() =>
			assertPixelFilingAlignmentV1({
				bytesPerRow: 256,
				rows: 4,
				textureBufferByteLength: 1024,
				uniformBufferByteLength: 32,
			})
		).not.toThrow();

		expect(() =>
			assertPixelFilingAlignmentV1({
				bytesPerRow: 128,
				rows: 4,
				textureBufferByteLength: 512,
			})
		).toThrow(/WEBGPU_BYTES_PER_ROW_MISALIGNED/);

		expect(() =>
			assertPixelFilingAlignmentV1({
				bytesPerRow: 256,
				rows: 4,
				textureBufferByteLength: 1024,
				uniformBufferByteLength: 12,
			})
		).toThrow(/WGSL_UNIFORM_BUFFER_MISALIGNED/);
	});
});
