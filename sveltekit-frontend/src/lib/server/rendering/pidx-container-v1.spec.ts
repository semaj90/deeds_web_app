import { describe, expect, it } from 'vitest';
import { quantizeRgbaToIndexed4BppV1, INDEXED_PALETTE16_V1 } from '../../splat/indexed-palette-texture-v1.js';
import { decodePidxV1, encodePidxV1, PIDX_HEADER_BYTES, PidxError } from './pidx-container-v1.js';

function texture(width: number, height: number) {
	const rgba = new Uint8Array(width * height * 4);
	for (let p = 0; p < width * height; p++) {
		const entry = INDEXED_PALETTE16_V1[(p % 15) + 1]!;
		rgba.set(entry.rgba, p * 4);
	}
	return quantizeRgbaToIndexed4BppV1(width, height, rgba);
}

describe('PIDX v1 container', () => {
	it('round-trips a 128x128 texture: 8,192-byte payload, identical packed indices', () => {
		const tex = texture(128, 128);
		const bytes = encodePidxV1(tex);
		expect(bytes.length).toBe(PIDX_HEADER_BYTES + 8192);
		const back = decodePidxV1(bytes);
		expect(back.width).toBe(128);
		expect(back.height).toBe(128);
		expect(back.pixelCount).toBe(16384);
		expect(Array.from(back.packedIndices)).toEqual(Array.from(tex.packedIndices));
	});

	it('keeps an odd pixel count intact', () => {
		const tex = texture(3, 3);
		const back = decodePidxV1(encodePidxV1(tex));
		expect(back.pixelCount).toBe(9);
		expect(Array.from(back.packedIndices)).toEqual(Array.from(tex.packedIndices));
	});

	it('fails closed on bad magic, version, nibble order, truncation and hash mismatch', () => {
		const good = encodePidxV1(texture(4, 4));
		const mutate = (at: number, value: number) => { const b = good.slice(); b[at] = value; return b; };
		expect(() => decodePidxV1(mutate(0, 0x58))).toThrow('PIDX_BAD_MAGIC');
		expect(() => decodePidxV1(mutate(4, 2))).toThrow('PIDX_UNSUPPORTED_VERSION');
		expect(() => decodePidxV1(mutate(19, 1))).toThrow('PIDX_NIBBLE_ORDER_UNSUPPORTED');
		expect(() => decodePidxV1(good.subarray(0, 40))).toThrow('PIDX_TRUNCATED_HEADER');
		expect(() => decodePidxV1(good.subarray(0, good.length - 1))).toThrow('PIDX_TRUNCATED_PAYLOAD');
		const tampered = good.slice();
		tampered[PIDX_HEADER_BYTES] ^= 0x11;
		expect(() => decodePidxV1(tampered)).toThrow('PIDX_HASH_MISMATCH');
	});

	it('rejects a palette that differs from the owner palette', () => {
		const good = encodePidxV1(texture(4, 4));
		const changed = good.slice();
		changed[24 + 4] ^= 0xff; // entry 1, red channel
		expect(() => decodePidxV1(changed)).toThrow('PIDX_PALETTE_MISMATCH');
	});

	it('rejects a payload length that does not match the dimensions', () => {
		const good = encodePidxV1(texture(4, 4));
		new DataView(good.buffer).setUint32(20, 3, true);
		expect(() => decodePidxV1(good)).toThrow(PidxError);
	});
});
