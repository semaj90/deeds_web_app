/**
 * Niantic SPZ v4 Gaussian-Splat Serializer / Encoder
 *
 * Encodes 3D and 2.5D Gaussian splat point clouds into standard Niantic SPZ v4 binary format:
 * - 32-byte header: magic (0x5053474e "NGSP"), version 4, numPoints, shDegree 0, fractionalBits, flags
 * - Table of Contents (TOC): 5 streams back-to-back (positions, alphas, colors, scales, rotations)
 * - 24-bit fixed-point positions with configurable fractionalBits (default 12 = 1/4096 units)
 * - Inverse-sigmoid encoded opacity
 * - Smallest-three unit quaternion compression (4 bytes per rotation)
 * - Zstandard compressed frames (RFC 8878) using Node 22 zlib or custom frame encoder
 */

const SPZ_MAGIC = 0x5053474e; // "NGSP" in little-endian
const SPZ_VERSION = 4;
const HEADER_BYTES = 32;
const SQRT1_2 = Math.SQRT1_2;

/** Spherical Harmonics degree-0 DC basis coefficient Y_0^0 = 1 / (2 * sqrt(pi)) ~= 0.2820947918 */
export const SH_C0 = 0.28209479177387814;
/** SPZ v4 color quantization scale factor */
export const SPZ_COLOR_SCALE = 0.15;

/** Convert Display RGB [0, 1] to Spherical Harmonics degree-0 DC coefficient. */
export function rgbToShDc(rgb: number): number {
	return (rgb - 0.5) / SH_C0;
}

/** Convert Spherical Harmonics degree-0 DC coefficient to Display RGB [0, 1]. */
export function shDcToRgb(shDc: number): number {
	return Math.max(0, Math.min(1, shDc * SH_C0 + 0.5));
}

/** Quantize Display RGB [0, 1] into SPZ v4 packed byte [0, 255]. */
export function rgbToSpzByte(rgb: number): number {
	const cDc = rgbToShDc(rgb);
	return Math.max(0, Math.min(255, Math.round(255 * (0.5 + SPZ_COLOR_SCALE * cDc))));
}

/** Dequantize SPZ v4 packed byte [0, 255] into Spherical Harmonics degree-0 DC coefficient. */
export function spzByteToShDc(byte: number): number {
	return (byte / 255 - 0.5) / SPZ_COLOR_SCALE;
}

/** Dequantize SPZ v4 packed byte [0, 255] into Display RGB [0, 1]. */
export function spzByteToRgb(byte: number): number {
	return shDcToRgb(spzByteToShDc(byte));
}

export interface GaussianCloud {
	numPoints: number;
	/** numPoints * 3, world coordinates (RUB / Three.js). */
	positions: Float32Array;
	/** numPoints * 3, RGB colors in range 0.0 to 1.0. */
	colors: Float32Array;
	/** numPoints, opacities in range 0.0 to 1.0 (defaults to 1.0). */
	alphas?: Float32Array;
	/** numPoints * 3, scale factors per axis (defaults to 0.01). */
	scales?: Float32Array;
	/** numPoints * 4, unit quaternions xyzw (defaults to identity [0,0,0,1]). */
	rotations?: Float32Array;
	/** Fixed-point precision exponent for positions (default 12 bits = 1/4096 unit). */
	fractionalBits?: number;
	antialiased?: boolean;
}

export type ZstdCompressor = (data: Uint8Array) => Uint8Array;

/**
 * Universal RFC 8878 Zstandard frame encoder using standard uncompressed raw blocks (Block_Type = 0).
 * Decodes reliably in fzstd, libzstd, and any compliant Zstandard decompressor in browser and Node.
 */
export function rfc8878RawZstdFrame(data: Uint8Array): Uint8Array {
	const header = [0x28, 0xb5, 0x2f, 0xfd, 0xa0];
	const fcs = data.length;
	header.push(fcs & 0xff, (fcs >> 8) & 0xff, (fcs >> 16) & 0xff, (fcs >>> 24) & 0xff);

	const maxBlockSize = 128 * 1024;
	if (data.length === 0) {
		const out = new Uint8Array(header.length + 3);
		out.set(header, 0);
		// Last_Block = 1, Block_Type = 0 (Raw), Block_Size = 0
		out[header.length] = 1;
		out[header.length + 1] = 0;
		out[header.length + 2] = 0;
		return out;
	}

	const numBlocks = Math.ceil(data.length / maxBlockSize) || 1;
	const totalLength = header.length + numBlocks * 3 + data.length;
	const out = new Uint8Array(totalLength);
	out.set(header, 0);

	let writePos = header.length;
	let readPos = 0;
	while (readPos < data.length) {
		const chunkLen = Math.min(data.length - readPos, maxBlockSize);
		const isLast = (readPos + chunkLen >= data.length) ? 1 : 0;
		const blockHeader = isLast | (0 << 1) | (chunkLen << 3);
		out[writePos++] = blockHeader & 0xff;
		out[writePos++] = (blockHeader >> 8) & 0xff;
		out[writePos++] = (blockHeader >> 16) & 0xff;
		out.set(data.subarray(readPos, readPos + chunkLen), writePos);
		writePos += chunkLen;
		readPos += chunkLen;
	}
	return out;
}

/** Default Zstandard compressor using Node 22 native zlib when available, or universal RFC 8878 raw blocks */
export function defaultNodeZstdCompress(data: Uint8Array): Uint8Array {
	try {
		if (typeof process !== 'undefined' && process.versions?.node) {
			const zlibSync = (globalThis as any)?.__zlibCompressSync;
			if (typeof zlibSync === 'function') {
				return new Uint8Array(zlibSync(data));
			}
		}
	} catch {
		// Fall through
	}
	return rfc8878RawZstdFrame(data);
}

/**
 * Encodes a unit quaternion into Niantic's 4-byte smallest-three format.
 * Bits 30..31: index of largest component.
 * Bits 0..29: 3 remaining components (each 10 bits: 1 sign bit + 9 bits magnitude scaled by sqrt(1/2)).
 */
export function encodeSmallestThree(x: number, y: number, z: number, w: number): [number, number, number, number] {
	let q = [x, y, z, w];
	let largest = 0;
	let maxAbs = Math.abs(q[0]);
	for (let i = 1; i < 4; i++) {
		const absVal = Math.abs(q[i]);
		if (absVal > maxAbs) {
			maxAbs = absVal;
			largest = i;
		}
	}
	// Negate entire quaternion if largest component is negative (q and -q represent same rotation)
	if (q[largest] < 0) {
		q = [-q[0], -q[1], -q[2], -q[3]];
	}

	const others: number[] = [];
	for (let i = 3; i >= 0; i--) {
		if (i !== largest) others.push(i);
	}

	let comp0 = 0;
	for (let idx = 0; idx < 3; idx++) {
		const i = others[idx];
		const val = q[i];
		const negbit = val < 0 ? 1 : 0;
		const mag = Math.min(511, Math.round((Math.abs(val) / SQRT1_2) * 511));
		const piece = ((negbit << 9) | (mag & 0x1ff)) >>> 0;
		comp0 = (comp0 | (piece << (idx * 10))) >>> 0;
	}
	comp0 = (comp0 | (largest << 30)) >>> 0;

	return [
		comp0 & 0xff,
		(comp0 >>> 8) & 0xff,
		(comp0 >>> 16) & 0xff,
		(comp0 >>> 24) & 0xff
	];
}

/**
 * Serializes Gaussian point cloud data into a standard Niantic SPZ v4 binary.
 */
export function serializeSpz(cloud: GaussianCloud, compressFn: ZstdCompressor = defaultNodeZstdCompress): Uint8Array {
	const { numPoints } = cloud;
	const fractionalBits = cloud.fractionalBits ?? 12;
	const antialiased = cloud.antialiased ?? false;
	const shDegree = 0; // degree 0 (5 streams: positions, alphas, colors, scales, rotations)
	const numStreams = 5;

	const scaleFactor = 2 ** fractionalBits;

	// Stream 1: Positions (3 x 24-bit fixed point = 9 bytes per point)
	const posRaw = new Uint8Array(numPoints * 9);
	for (let i = 0; i < numPoints * 3; i++) {
		const val = Math.round(cloud.positions[i] * scaleFactor);
		const b = i * 3;
		posRaw[b] = val & 0xff;
		posRaw[b + 1] = (val >> 8) & 0xff;
		posRaw[b + 2] = (val >> 16) & 0xff;
	}

	// Stream 2: Alphas (1 byte per point, clamped [1, 254] for finite logit)
	const alpRaw = new Uint8Array(numPoints);
	const alphas = cloud.alphas;
	for (let i = 0; i < numPoints; i++) {
		const a = alphas ? alphas[i] : 1.0;
		alpRaw[i] = Math.max(1, Math.min(254, Math.round(a * 255)));
	}

	// Stream 3: Colors (3 bytes per point, quantized: byte = round((0.5 + SPZ_COLOR_SCALE * c_DC) * 255))
	const colRaw = new Uint8Array(numPoints * 3);
	for (let i = 0; i < numPoints * 3; i++) {
		colRaw[i] = rgbToSpzByte(cloud.colors[i]);
	}

	// Stream 4: Scales (3 bytes per point, log-scale: byte = round((logScale + 10) * 16))
	const sclRaw = new Uint8Array(numPoints * 3);
	const scales = cloud.scales;
	for (let i = 0; i < numPoints * 3; i++) {
		// Default to log(0.01) ~= -4.605
		const s = scales ? scales[i] : -4.6;
		sclRaw[i] = Math.max(0, Math.min(255, Math.round((s + 10) * 16)));
	}

	// Stream 5: Rotations (4 bytes per point, smallest-three)
	const rotRaw = new Uint8Array(numPoints * 4);
	const rots = cloud.rotations;
	for (let p = 0; p < numPoints; p++) {
		const base = p * 4;
		const rx = rots ? rots[base] : 0;
		const ry = rots ? rots[base + 1] : 0;
		const rz = rots ? rots[base + 2] : 0;
		const rw = rots ? rots[base + 3] : 1;
		const [b0, b1, b2, b3] = encodeSmallestThree(rx, ry, rz, rw);
		rotRaw[base] = b0;
		rotRaw[base + 1] = b1;
		rotRaw[base + 2] = b2;
		rotRaw[base + 3] = b3;
	}

	// Compress individual streams
	const uncompressedStreams = [posRaw, alpRaw, colRaw, sclRaw, rotRaw];
	const compressedFrames = uncompressedStreams.map((raw) => compressFn(raw));

	const tocBytes = numStreams * 16;
	let totalBytes = HEADER_BYTES + tocBytes;
	for (const frame of compressedFrames) totalBytes += frame.length;

	const out = new Uint8Array(totalBytes);
	const dv = new DataView(out.buffer);

	// Write 32-byte Header
	dv.setUint32(0, SPZ_MAGIC, true);
	dv.setUint32(4, SPZ_VERSION, true);
	dv.setUint32(8, numPoints, true);
	out[12] = shDegree;
	out[13] = fractionalBits;
	out[14] = antialiased ? 0x1 : 0x0;
	out[15] = numStreams;
	dv.setUint32(16, HEADER_BYTES, true); // tocByteOffset = 32

	// Write 16-byte TOC entries: u64 compressedSize, u64 uncompressedSize
	let streamCursor = HEADER_BYTES + tocBytes;
	for (let i = 0; i < numStreams; i++) {
		const entryOff = HEADER_BYTES + i * 16;
		const compSize = compressedFrames[i].length;
		const uncompSize = uncompressedStreams[i].length;
		dv.setBigUint64(entryOff, BigInt(compSize), true);
		dv.setBigUint64(entryOff + 8, BigInt(uncompSize), true);

		// Write stream payload back-to-back
		out.set(compressedFrames[i], streamCursor);
		streamCursor += compSize;
	}

	return out;
}

/**
 * Converts a 2D image RGB buffer and depth array into a 2.5D Gaussian point cloud.
 */
export function create2DDepthReliefGaussianCloud(
	width: number,
	height: number,
	rgbBytes: Uint8Array,
	depthValues: Float32Array,
	options: { step?: number; depthScale?: number } = {}
): GaussianCloud {
	const step = Math.max(1, options.step ?? 2);
	const depthScale = options.depthScale ?? 1.0;

	const numCols = Math.floor(width / step);
	const numRows = Math.floor(height / step);
	const numPoints = numCols * numRows;

	const positions = new Float32Array(numPoints * 3);
	const colors = new Float32Array(numPoints * 3);
	const alphas = new Float32Array(numPoints);
	const scales = new Float32Array(numPoints * 3);
	const rotations = new Float32Array(numPoints * 4);

	let ptIdx = 0;
	for (let r = 0; r < numRows; r++) {
		const y = r * step;
		for (let c = 0; c < numCols; c++) {
			const x = c * step;
			const pixelIdx = y * width + x;

			// World coordinates centered around (0,0)
			const posX = (x - width / 2) / (width / 2);
			const posY = (height / 2 - y) / (height / 2);
			const posZ = (depthValues[pixelIdx] ?? 0.0) * depthScale;

			const p3 = ptIdx * 3;
			positions[p3] = posX;
			positions[p3 + 1] = posY;
			positions[p3 + 2] = posZ;

			const rgbIdx = pixelIdx * 3;
			colors[p3] = (rgbBytes[rgbIdx] ?? 200) / 255;
			colors[p3 + 1] = (rgbBytes[rgbIdx + 1] ?? 200) / 255;
			colors[p3 + 2] = (rgbBytes[rgbIdx + 2] ?? 200) / 255;

			alphas[ptIdx] = 0.98;

			// Splat scale tailored to point spacing
			const splatRadius = Math.log(step / width);
			scales[p3] = splatRadius;
			scales[p3 + 1] = splatRadius;
			scales[p3 + 2] = splatRadius - 1.0; // flattens into 2.5D disc

			// Default surface-aligned quaternion
			const p4 = ptIdx * 4;
			rotations[p4] = 0;
			rotations[p4 + 1] = 0;
			rotations[p4 + 2] = 0;
			rotations[p4 + 3] = 1;

			ptIdx++;
		}
	}

	return {
		numPoints,
		positions,
		colors,
		alphas,
		scales,
		rotations,
		fractionalBits: 12,
		antialiased: true
	};
}
