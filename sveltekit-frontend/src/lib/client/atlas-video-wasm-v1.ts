export const ATLAS_VIDEO_WASM_ABI_V1 = 1;
export const FILMCRAFT_TICKS_PER_MILLISECOND_V1 = 254_016_000n;

type VideoWasmExports = WebAssembly.Exports & {
	atlas_video_wasm_abi_version: () => number;
	ms_to_filmcraft_ticks: (milliseconds: number) => bigint;
	dhash_hamming_distance: (left: bigint, right: bigint) => number;
	dhash_gray_9x8: (
		word0: bigint,
		word1: bigint,
		word2: bigint,
		word3: bigint,
		word4: bigint,
		word5: bigint,
		word6: bigint,
		word7: bigint,
		word8: bigint
	) => bigint;
};

export interface AtlasVideoFrameHashV1 {
	readonly timestampMs: number;
	readonly filmcraftTicks: string;
	readonly dhashHex: string;
	readonly engine: 'atlas-video-wasm-v1';
	readonly canonicalEvidence: false;
}

let wasmInstancePromise: Promise<VideoWasmExports> | undefined;

async function loadExports(wasmUrl: string): Promise<VideoWasmExports> {
	const response = await fetch(wasmUrl, { credentials: 'same-origin' });
	if (!response.ok) throw new Error(`ATLAS_VIDEO_WASM_FETCH_FAILED:${response.status}`);
	const bytes = await response.arrayBuffer();
	const { instance } = await WebAssembly.instantiate(bytes, {});
	const exports = instance.exports as VideoWasmExports;
	if (
		typeof exports.atlas_video_wasm_abi_version !== 'function' ||
		exports.atlas_video_wasm_abi_version() !== ATLAS_VIDEO_WASM_ABI_V1 ||
		typeof exports.ms_to_filmcraft_ticks !== 'function' ||
		typeof exports.dhash_hamming_distance !== 'function' ||
		typeof exports.dhash_gray_9x8 !== 'function'
	) {
		throw new Error('ATLAS_VIDEO_WASM_ABI_MISMATCH');
	}
	return exports;
}

export function loadAtlasVideoWasmV1(wasmUrl = '/wasm/atlas-video-wasm.wasm'): Promise<VideoWasmExports> {
	if (!wasmInstancePromise) {
		wasmInstancePromise = loadExports(wasmUrl).catch((error) => {
			wasmInstancePromise = undefined;
			throw error;
		});
	}
	return wasmInstancePromise;
}

export function packGrayPixelsLsb0V1(pixels: Uint8ClampedArray): bigint[] {
	if (pixels.length !== 9 * 8 * 4) throw new RangeError('VIDEO_SAMPLE_MUST_BE_9X8_RGBA');
	const words = Array<bigint>(9).fill(0n);
	for (let pixelIndex = 0; pixelIndex < 72; pixelIndex += 1) {
		const rgbaOffset = pixelIndex * 4;
		const r = pixels[rgbaOffset];
		const g = pixels[rgbaOffset + 1];
		const b = pixels[rgbaOffset + 2];
		const gray = (77 * r + 150 * g + 29 * b) >> 8;
		words[Math.floor(pixelIndex / 8)] |= BigInt(gray) << BigInt((pixelIndex % 8) * 8);
	}
	return words;
}

export async function analyzeCurrentVideoFrameWasmV1(
	video: HTMLVideoElement,
	wasmUrl?: string
): Promise<AtlasVideoFrameHashV1> {
	if (!Number.isFinite(video.currentTime) || video.currentTime < 0) {
		throw new RangeError('VIDEO_CURRENT_TIME_INVALID');
	}
	if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
		throw new Error('VIDEO_FRAME_NOT_READY');
	}
	const timestampMs = Math.round(video.currentTime * 1000);
	if (!Number.isSafeInteger(timestampMs) || timestampMs < 0 || timestampMs > 0xffff_ffff) {
		throw new RangeError('VIDEO_TIMESTAMP_MS_OUT_OF_WASM_RANGE');
	}
	const canvas = document.createElement('canvas');
	canvas.width = 9;
	canvas.height = 8;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('VIDEO_FRAME_CANVAS_UNAVAILABLE');
	try {
		context.drawImage(video, 0, 0, 9, 8);
		const words = packGrayPixelsLsb0V1(context.getImageData(0, 0, 9, 8).data);
		const wasm = await loadAtlasVideoWasmV1(wasmUrl);
		const dhash = wasm.dhash_gray_9x8(
			words[0], words[1], words[2], words[3], words[4], words[5], words[6], words[7], words[8]
		);
		const filmcraftTicks = wasm.ms_to_filmcraft_ticks(timestampMs);
		return {
			timestampMs,
			filmcraftTicks: filmcraftTicks.toString(),
			dhashHex: BigInt.asUintN(64, dhash).toString(16).padStart(16, '0'),
			engine: 'atlas-video-wasm-v1',
			canonicalEvidence: false
		};
	} catch (error) {
		if (error instanceof DOMException && error.name === 'SecurityError') {
			throw new Error('VIDEO_FRAME_CANVAS_CROSS_ORIGIN_BLOCKED');
		}
		throw error;
	}
}

export function hammingDistanceWasmV1(exports: VideoWasmExports, leftHex: string, rightHex: string): number {
	if (!/^[0-9a-f]{16}$/i.test(leftHex) || !/^[0-9a-f]{16}$/i.test(rightHex)) {
		throw new Error('DHASH_HEX_MUST_BE_64_BIT');
	}
	return exports.dhash_hamming_distance(BigInt(`0x${leftHex}`), BigInt(`0x${rightHex}`));
}
