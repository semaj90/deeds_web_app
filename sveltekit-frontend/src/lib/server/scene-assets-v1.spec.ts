import { describe, expect, it } from 'vitest';
import { isGlbV2, SCENE_ASSET_MAX_BYTES, sha256Bytes } from './scene-assets-v1.js';

function glbV2(): Uint8Array {
	const bytes = new Uint8Array(20);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, 0x46546c67, true);
	view.setUint32(4, 2, true);
	view.setUint32(8, bytes.byteLength, true);
	view.setUint32(12, 0, true);
	view.setUint32(16, 0x4e4f534a, true);
	return bytes;
}

describe('case scene asset boundary', () => {
	it('accepts only GLB v2 magic and exact declared container length', () => {
		const bytes = glbV2();
		expect(isGlbV2(bytes)).toBe(true);
		bytes[4] = 1;
		expect(isGlbV2(bytes)).toBe(false);
	});

	it('hashes bytes on the server and declares a bounded 64 MiB upload cap', () => {
		expect(sha256Bytes(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
		expect(SCENE_ASSET_MAX_BYTES).toBe(64 * 1024 * 1024);
	});
});
