/**
 * arpc-envelope-v1.ts
 *
 * Canonical TypeScript / Browser / WebGPU counterpart to Python
 * `python/atlas_graph_runtime/duckdb_bytea_rpc_packet_v1.py` (`ARPC` binary envelope)
 * plus explicit GPU/WASM memory alignment guards ("Pixel Filing"):
 *   - 256-byte `bytesPerRow` pitch for WebGPU `writeTexture` / `copyTextureToBuffer`
 *   - 16-byte alignment for WGSL uniform buffers (`vec4<f32>`)
 *   - Hard rejection of Base64 payloads and forbidden runtime keys on hot compute paths.
 */

export const ARPC_MAGIC_BYTES = [0x41, 0x52, 0x50, 0x43] as const; // 'ARPC'
export const ARPC_VERSION = 1;
export const ARPC_HEADER_BYTES = 10; // 4B magic + 1B version + 1B codec_id + 4B uint32-le len
export const ARPC_DIGEST_BYTES = 32; // SHA-256

export const WEBGPU_TEXTURE_ROW_PITCH_ALIGNMENT = 256;
export const WGSL_UNIFORM_ALIGNMENT = 16;

export const ArpcCodecId = {
	RAW_JSON_UTF8: 0,
	MSGPACK: 1,
	ZLIB_FRAMED: 2,
	LZ4_FRAMED: 3,
} as const;

export const FORBIDDEN_HOT_PATH_KEYS = new Set([
	'hiddenthoughts',
	'chainofthought',
	'kv_cache',
	'kvcache',
	'hidden_state',
	'hiddenstate',
	'device_ptr',
]);

export interface ParsedArpcHeaderV1 {
	version: number;
	codecId: number;
	bodyLength: number;
	bodySlice: Uint8Array;
	expectedSha256: Uint8Array;
}

/**
 * Parses and verifies framing + SHA-256 digest of an `ARPC` BYTEA/BLOB packet.
 */
export async function parseAndVerifyArpcEnvelopeV1(packet: Uint8Array): Promise<ParsedArpcHeaderV1> {
	if (packet.byteLength < ARPC_HEADER_BYTES + ARPC_DIGEST_BYTES) {
		throw new Error('ARPC_PACKET_TRUNCATED');
	}
	for (let i = 0; i < 4; i++) {
		if (packet[i] !== ARPC_MAGIC_BYTES[i]) {
			throw new Error('ARPC_INVALID_MAGIC');
		}
	}

	const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
	const version = view.getUint8(4);
	const codecId = view.getUint8(5);
	const bodyLength = view.getUint32(6, true);

	if (version !== ARPC_VERSION) {
		throw new Error(`ARPC_UNSUPPORTED_VERSION:${version}`);
	}
	if (packet.byteLength !== ARPC_HEADER_BYTES + bodyLength + ARPC_DIGEST_BYTES) {
		throw new Error('ARPC_LENGTH_MISMATCH');
	}

	const bodySlice = packet.subarray(ARPC_HEADER_BYTES, ARPC_HEADER_BYTES + bodyLength);
	const expectedSha256 = packet.subarray(ARPC_HEADER_BYTES + bodyLength);

	// Copy bodySlice into a clean ArrayBuffer for WebCrypto subtle.digest
	const digestInput = new Uint8Array(bodySlice.byteLength);
	digestInput.set(bodySlice);
	const actualBuf = await crypto.subtle.digest('SHA-256', digestInput);
	const actualSha256 = new Uint8Array(actualBuf);

	for (let i = 0; i < ARPC_DIGEST_BYTES; i++) {
		if (actualSha256[i] !== expectedSha256[i]) {
			throw new Error('ARPC_CHECKSUM_MISMATCH');
		}
	}

	return {
		version,
		codecId,
		bodyLength,
		bodySlice,
		expectedSha256,
	};
}

/**
 * Computes WebGPU-aligned `bytesPerRow` (>= 256B multiple) for `writeTexture` / `copyTextureToBuffer`.
 */
export function alignWebGpuBytesPerRow(unpaddedRowBytes: number): number {
	if (!Number.isInteger(unpaddedRowBytes) || unpaddedRowBytes <= 0) {
		throw new Error(`INVALID_UNPADDED_ROW_BYTES:${unpaddedRowBytes}`);
	}
	return Math.ceil(unpaddedRowBytes / WEBGPU_TEXTURE_ROW_PITCH_ALIGNMENT) * WEBGPU_TEXTURE_ROW_PITCH_ALIGNMENT;
}

/**
 * Validates that a GPU texture buffer and uniform buffer satisfy Pixel Filing alignment rules.
 */
export function assertPixelFilingAlignmentV1(opts: {
	bytesPerRow: number;
	rows: number;
	textureBufferByteLength: number;
	uniformBufferByteLength?: number;
}): void {
	if (opts.bytesPerRow <= 0 || opts.bytesPerRow % WEBGPU_TEXTURE_ROW_PITCH_ALIGNMENT !== 0) {
		throw new Error(
			`WEBGPU_BYTES_PER_ROW_MISALIGNED:${opts.bytesPerRow} (must be multiple of ${WEBGPU_TEXTURE_ROW_PITCH_ALIGNMENT})`
		);
	}
	const requiredBytes = opts.bytesPerRow * opts.rows;
	if (opts.textureBufferByteLength < requiredBytes) {
		throw new Error(
			`WEBGPU_TEXTURE_BUFFER_UNDERSIZED:${opts.textureBufferByteLength} < ${requiredBytes}`
		);
	}
	if (
		opts.uniformBufferByteLength !== undefined &&
		opts.uniformBufferByteLength % WGSL_UNIFORM_ALIGNMENT !== 0
	) {
		throw new Error(
			`WGSL_UNIFORM_BUFFER_MISALIGNED:${opts.uniformBufferByteLength} (must be multiple of ${WGSL_UNIFORM_ALIGNMENT})`
		);
	}
}
