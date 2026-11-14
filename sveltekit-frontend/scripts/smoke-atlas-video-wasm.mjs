import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const artifactUrl = new URL('../static/wasm/atlas-video-wasm.wasm', import.meta.url);
const bytes = await readFile(artifactUrl);
const { instance } = await WebAssembly.instantiate(bytes);
const wasm = instance.exports;

assert.equal(wasm.atlas_video_wasm_abi_version(), 1);
assert.equal(wasm.ms_to_filmcraft_ticks(1000), 254_016_000_000n);
assert.equal(wasm.dhash_hamming_distance(0n, 0xffff_ffff_ffff_ffffn), 64);

const words = Array.from({ length: 9 }, () => 0n);
for (let row = 0; row < 8; row += 1) {
	for (let col = 0; col < 9; col += 1) {
		const index = row * 9 + col;
	const value = col * 20;
		words[Math.floor(index / 8)] |= BigInt(value) << BigInt((index % 8) * 8);
	}
}
assert.equal(BigInt.asUintN(64, wasm.dhash_gray_9x8(...words)), 0xffff_ffff_ffff_ffffn);
process.stdout.write(`atlas_video_wasm_smoke=PASS bytes=${bytes.byteLength} hash=ffffffffffffffff\n`);
