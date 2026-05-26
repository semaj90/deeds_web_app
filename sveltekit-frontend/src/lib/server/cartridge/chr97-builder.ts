/**
 * CH-ROM97 Cartridge Builder/Reader — TypeScript port
 * Ported from chr97.mjs for SvelteKit server-side use.
 *
 * Binary layout:
 *   [Header 4096B] [RuneBlocks 36B each] [TensorBank FP16] [GraphCSR] [Metadata JSON]
 *
 * Simplified vs chr97.mjs:
 *   - No tile atlas (not needed for vector-only cartridges)
 *   - No latent bank (embeddings stored as FP16 tensors only)
 *   - No visual card (added later if needed)
 */

import crypto from 'crypto';

// Constants
const CHR97_MAGIC = Buffer.from('CHR97\x00\x00\x00');
const HEADER_SIZE = 4096;
const RUNE_BLOCK_SIZE = 36;
const MANIFOLD_DIM = 4;

// ─── Types ───────────────────────────────────────────────────────────────

export interface RuneData {
	id: number;
	clusterId: number;
	embedding: number[];       // 768-dim float32 from Qdrant
	text: string;              // chunk text for display
	sourceId?: string;         // evidence record ID
	sourceName?: string;       // original filename
	entities?: string[];       // extracted entities
}

export interface CartridgeHeader {
	magic: string;
	version: number;
	flags: number;
	runeCount: number;
	tensorSize: number;
	graphNodeCount: number;
	manifoldDim: number;
}

export interface CartridgeMetadata {
	caseId: string;
	createdAt: string;
	runeCount: number;
	embeddingDim: number;
	collections: string[];
	sources: string[];
	cartridge_kind?: string | null;
	glyph_kind?: string | null;
	cluster_key?: string | null;
}

export interface ParsedRune {
	id: number;
	clusterId: number;
	manifold: [number, number, number, number];
	quant4: [number, number, number, number];
	graphDegree: number;
	tensorUuid: bigint;
}

export interface ParsedCartridge {
	header: CartridgeHeader;
	runes: ParsedRune[];
	tensors: Float32Array[];   // dequantized from FP16 back to f32
	metadata: CartridgeMetadata;
}

// ─── Builder ─────────────────────────────────────────────────────────────

export function buildCartridge(runes: RuneData[], metadata: CartridgeMetadata): Buffer {
	const embeddingDim = runes.length > 0 ? runes[0].embedding.length : 768;

	// 1. Build rune blocks
	const runeBlocks: Buffer[] = [];
	const fp16Tensors: Buffer[] = [];

	for (let i = 0; i < runes.length; i++) {
		const rune = runes[i];
		const embedding = rune.embedding;

		// Derive 4D manifold from first 4 embedding dims (UMAP-like projection)
		const manifold: [number, number, number, number] = [
			embedding[0] ?? 0,
			embedding[1] ?? 0,
			embedding[2] ?? 0,
			embedding[3] ?? 0,
		];

		// Quantize manifold to uint8[4] for spatial hashing
		const quant4: [number, number, number, number] = [
			clampU8(((manifold[0] + 1) / 2) * 255),
			clampU8(((manifold[1] + 1) / 2) * 255),
			clampU8(((manifold[2] + 1) / 2) * 255),
			clampU8(((manifold[3] + 1) / 2) * 255),
		];

		// Deterministic 64-bit UUID from chunk text
		const hash = crypto.createHash('sha256').update(rune.text).digest();
		const tensorUuid = hash.readBigUInt64LE(0);

		// Graph degree = number of entities (heuristic for connectivity)
		const graphDegree = rune.entities?.length ?? 1;

		// Build 36-byte rune block
		const buf = Buffer.alloc(RUNE_BLOCK_SIZE);
		let off = 0;

		buf.writeUInt16LE(rune.id & 0xFFFF, off); off += 2;         // runeId
		buf.writeUInt16LE(i & 0xFFFF, off); off += 2;               // tileIndex (= ordinal)
		buf.writeUInt16LE(rune.clusterId & 0xFFFF, off); off += 2;  // clusterId

		// float32 manifold [4]
		for (let d = 0; d < 4; d++) {
			buf.writeFloatLE(manifold[d], off); off += 4;
		}

		// quant4 uint8[4]
		for (let d = 0; d < 4; d++) {
			buf.writeUInt8(quant4[d], off); off += 1;
		}

		buf.writeUInt16LE(graphDegree & 0xFFFF, off); off += 2;
		buf.writeBigUInt64LE(tensorUuid, off);

		runeBlocks.push(buf);

		// Convert embedding to FP16 tensor
		fp16Tensors.push(float32ArrayToFP16Buffer(embedding));
	}

	// 2. Build header
	const tensorBank = Buffer.concat(fp16Tensors);
	const graphBuffer = buildGraphCSR(runes.length);
	const metadataBuffer = Buffer.from(JSON.stringify(metadata), 'utf8');

	const headerBuf = Buffer.alloc(HEADER_SIZE);
	let hoff = 0;

	CHR97_MAGIC.copy(headerBuf, hoff); hoff += 8;          // magic
	headerBuf.writeUInt16LE(0x0100, hoff); hoff += 2;       // version 1.0
	headerBuf.writeUInt16LE(0x02, hoff); hoff += 2;         // flags: quantized
	headerBuf.writeUInt16LE(runes.length & 0xFFFF, hoff); hoff += 2;  // runeCount
	headerBuf.writeUInt16LE(0, hoff); hoff += 2;            // tileCount (unused)
	headerBuf.writeUInt32LE(tensorBank.length, hoff); hoff += 4;
	headerBuf.writeUInt32LE(0, hoff); hoff += 4;            // latentSize (unused)
	headerBuf.writeUInt32LE(runes.length, hoff); hoff += 4;
	headerBuf.writeUInt8(MANIFOLD_DIM, hoff);

	// 3. Concatenate sections
	const runeBlocksBuf = Buffer.concat(runeBlocks);
	const cartridge = Buffer.concat([
		headerBuf,
		runeBlocksBuf,
		tensorBank,
		graphBuffer,
		metadataBuffer,
	]);

	// 4. Pad to 4096-byte alignment
	const padLen = (4096 - (cartridge.length % 4096)) % 4096;
	return padLen > 0 ? Buffer.concat([cartridge, Buffer.alloc(padLen)]) : cartridge;
}

// ─── Reader (client-compatible, works with ArrayBuffer) ──────────────────

export function parseCartridgeHeader(data: Uint8Array): CartridgeHeader {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

	// Verify magic
	const magic = String.fromCharCode(...data.slice(0, 5));
	if (magic !== 'CHR97') {
		throw new Error('Invalid CH-ROM97 magic header');
	}

	return {
		magic,
		version: view.getUint16(8, true),
		flags: view.getUint16(10, true),
		runeCount: view.getUint16(12, true),
		tensorSize: view.getUint32(16, true),
		graphNodeCount: view.getUint32(24, true),
		manifoldDim: view.getUint8(28),
	};
}

export function parseCartridge(data: Uint8Array): ParsedCartridge {
	const header = parseCartridgeHeader(data);
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

	// Parse rune blocks
	const runes: ParsedRune[] = [];
	for (let i = 0; i < header.runeCount; i++) {
		const base = HEADER_SIZE + i * RUNE_BLOCK_SIZE;
		const manifold: [number, number, number, number] = [
			view.getFloat32(base + 6, true),
			view.getFloat32(base + 10, true),
			view.getFloat32(base + 14, true),
			view.getFloat32(base + 18, true),
		];
		const quant4: [number, number, number, number] = [
			view.getUint8(base + 22),
			view.getUint8(base + 23),
			view.getUint8(base + 24),
			view.getUint8(base + 25),
		];

		runes.push({
			id: view.getUint16(base, true),
			clusterId: view.getUint16(base + 4, true),
			manifold,
			quant4,
			graphDegree: view.getUint16(base + 26, true),
			tensorUuid: view.getBigUint64(base + 28, true),
		});
	}

	// Parse FP16 tensors → float32
	const tensorStart = HEADER_SIZE + header.runeCount * RUNE_BLOCK_SIZE;
	const embeddingDim = header.runeCount > 0 ? header.tensorSize / (header.runeCount * 2) : 768;
	const tensors: Float32Array[] = [];

	for (let i = 0; i < header.runeCount; i++) {
		const offset = tensorStart + i * embeddingDim * 2;
		const f32 = new Float32Array(embeddingDim);
		for (let d = 0; d < embeddingDim; d++) {
			f32[d] = fp16ToFloat32(view.getUint16(offset + d * 2, true));
		}
		tensors.push(f32);
	}

	// Parse metadata (after graph CSR)
	const graphStart = tensorStart + header.tensorSize;
	const graphSize = (header.graphNodeCount + 1 + header.graphNodeCount) * 4;
	const metaStart = graphStart + graphSize;

	let metadataStr = '';
	for (let i = metaStart; i < data.length; i++) {
		if (data[i] === 0 || data[i] === undefined) break;
		metadataStr += String.fromCharCode(data[i]);
	}

	let metadata: CartridgeMetadata;
	try {
		metadata = JSON.parse(metadataStr);
	} catch {
		metadata = {
			caseId: 'unknown',
			createdAt: new Date().toISOString(),
			runeCount: header.runeCount,
			embeddingDim,
			collections: [],
			sources: [],
		};
	}

	return { header, runes, tensors, metadata };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function clampU8(v: number): number {
	return Math.max(0, Math.min(255, Math.round(v)));
}

/** Convert float32 array to FP16 buffer (IEEE 754 half-precision). */
function float32ArrayToFP16Buffer(floats: number[]): Buffer {
	const buf = Buffer.alloc(floats.length * 2);
	for (let i = 0; i < floats.length; i++) {
		buf.writeUInt16LE(float32ToFP16(floats[i]), i * 2);
	}
	return buf;
}

/** Simplified float32 → float16 conversion. */
function float32ToFP16(value: number): number {
	if (value === 0) return 0;
	const sign = value < 0 ? 1 : 0;
	const abs = Math.abs(value);

	if (abs > 65504) return sign ? 0xFC00 : 0x7C00; // ±Inf for overflow
	if (abs < 5.96e-8) return sign << 15; // Flush to zero

	const exp = Math.floor(Math.log2(abs));
	const biasedExp = exp + 15;

	if (biasedExp <= 0) return sign << 15; // Denorm → zero
	if (biasedExp >= 31) return sign ? 0xFC00 : 0x7C00; // Overflow

	const mant = Math.round((abs / Math.pow(2, exp) - 1) * 1024);
	return (sign << 15) | (biasedExp << 10) | (mant & 0x3FF);
}

/** FP16 → float32 conversion. */
function fp16ToFloat32(fp16: number): number {
	const sign = (fp16 >> 15) & 1;
	const exp = (fp16 >> 10) & 0x1F;
	const mant = fp16 & 0x3FF;

	if (exp === 0) return sign ? -0 : 0; // Zero / denorm
	if (exp === 31) return sign ? -Infinity : Infinity;

	const value = (1 + mant / 1024) * Math.pow(2, exp - 15);
	return sign ? -value : value;
}

/** Build CSR graph (circular neighbor list). */
function buildGraphCSR(nodeCount: number): Buffer {
	const offsets = Buffer.alloc((nodeCount + 1) * 4);
	const edges = Buffer.alloc(nodeCount * 4);

	for (let i = 0; i < nodeCount; i++) {
		offsets.writeUInt32LE(i, i * 4);
		edges.writeUInt32LE((i + 1) % nodeCount, i * 4);
	}
	offsets.writeUInt32LE(nodeCount, nodeCount * 4);

	return Buffer.concat([offsets, edges]);
}
