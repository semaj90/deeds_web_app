/**
 * PIDX v1 container around the existing 4bpp owner (src/lib/splat/indexed-palette-texture-v1.ts).
 *
 * Packing and quantization are NOT reimplemented here: this module only adds a versioned header,
 * the palette used, and a SHA-256 over the packed payload.
 *
 * Layout (little-endian), 120-byte header then payload:
 *   magic "PIDX" (4) | version u16=1 | reserved u16=0 | width u32 | height u32 |
 *   paletteCount u16=16 | pixelFormat u8=1 (4bpp) | nibbleOrder u8=2 (low nibble = even pixel) |
 *   payloadLength u32 | palette 16 x RGBA (64) | SHA-256 of payload (32)
 *
 * Fail-closed: a palette that differs from the owner's fixed palette is rejected.
 */
import { createHash } from 'node:crypto';
import {
	INDEXED_PALETTE16_V1,
	INDEXED_PALETTE_TEXTURE_REVISION_V1,
	type IndexedTexture4BppV1,
} from '../../splat/indexed-palette-texture-v1.js';

export const PIDX_MAGIC = 'PIDX';
export const PIDX_VERSION = 1;
export const PIDX_HEADER_BYTES = 120;
export const PIDX_PIXEL_FORMAT_4BPP = 1;
export const PIDX_NIBBLE_ORDER_LOW_FIRST = 2;

export class PidxError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'PidxError';
	}
}

function paletteBytes(): Uint8Array {
	if (INDEXED_PALETTE16_V1.length !== 16) throw new PidxError('PIDX_OWNER_PALETTE_NOT_16');
	const out = new Uint8Array(64);
	INDEXED_PALETTE16_V1.forEach((entry, i) => out.set(entry.rgba, i * 4));
	return out;
}

export function encodePidxV1(texture: IndexedTexture4BppV1): Uint8Array {
	const expected = Math.ceil(texture.pixelCount / 2);
	if (texture.packedIndices.length !== expected) throw new PidxError('PIDX_PAYLOAD_LENGTH_MISMATCH');
	const palette = paletteBytes();
	const payload = texture.packedIndices;
	const out = new Uint8Array(PIDX_HEADER_BYTES + payload.length);
	const view = new DataView(out.buffer);
	out.set(new TextEncoder().encode(PIDX_MAGIC), 0);
	view.setUint16(4, PIDX_VERSION, true);
	view.setUint16(6, 0, true);
	view.setUint32(8, texture.width, true);
	view.setUint32(12, texture.height, true);
	view.setUint16(16, 16, true);
	out[18] = PIDX_PIXEL_FORMAT_4BPP;
	out[19] = PIDX_NIBBLE_ORDER_LOW_FIRST;
	view.setUint32(20, payload.length, true);
	out.set(palette, 24);
	out.set(new Uint8Array(createHash('sha256').update(payload).digest()), 88);
	out.set(payload, PIDX_HEADER_BYTES);
	return out;
}

export function decodePidxV1(bytes: Uint8Array): IndexedTexture4BppV1 {
	if (bytes.length < PIDX_HEADER_BYTES) throw new PidxError('PIDX_TRUNCATED_HEADER');
	if (new TextDecoder().decode(bytes.subarray(0, 4)) !== PIDX_MAGIC) throw new PidxError('PIDX_BAD_MAGIC');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint16(4, true) !== PIDX_VERSION) throw new PidxError('PIDX_UNSUPPORTED_VERSION');
	if (view.getUint16(6, true) !== 0) throw new PidxError('PIDX_RESERVED_NONZERO');
	const width = view.getUint32(8, true);
	const height = view.getUint32(12, true);
	if (width <= 0 || height <= 0 || width * height > 4_194_304) throw new PidxError('PIDX_DIMENSIONS_INVALID');
	if (view.getUint16(16, true) !== 16) throw new PidxError('PIDX_PALETTE_COUNT_UNSUPPORTED');
	if (bytes[18] !== PIDX_PIXEL_FORMAT_4BPP) throw new PidxError('PIDX_PIXEL_FORMAT_UNSUPPORTED');
	if (bytes[19] !== PIDX_NIBBLE_ORDER_LOW_FIRST) throw new PidxError('PIDX_NIBBLE_ORDER_UNSUPPORTED');
	const pixelCount = width * height;
	const payloadLength = view.getUint32(20, true);
	if (payloadLength !== Math.ceil(pixelCount / 2)) throw new PidxError('PIDX_PAYLOAD_LENGTH_MISMATCH');
	if (bytes.length !== PIDX_HEADER_BYTES + payloadLength) throw new PidxError('PIDX_TRUNCATED_PAYLOAD');
	const expectedPalette = paletteBytes();
	if (!equalBytes(bytes.subarray(24, 88), expectedPalette)) throw new PidxError('PIDX_PALETTE_MISMATCH');
	const payload = bytes.slice(PIDX_HEADER_BYTES);
	const hash = new Uint8Array(createHash('sha256').update(payload).digest());
	if (!equalBytes(hash, bytes.subarray(88, 120))) throw new PidxError('PIDX_HASH_MISMATCH');
	return {
		format: INDEXED_PALETTE_TEXTURE_REVISION_V1,
		width,
		height,
		paletteRevision: INDEXED_PALETTE_TEXTURE_REVISION_V1,
		packedIndices: payload,
		pixelCount,
	};
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
