/**
 * CH-ROM97 Cartridge Reader — browser-compatible subset
 * Extracted from $lib/server/cartridge/chr97-builder.ts (which uses Buffer/crypto for building)
 * This module only uses DataView/Uint8Array/Float32Array — safe for both browser and server.
 */

const HEADER_SIZE = 4096;
const RUNE_BLOCK_SIZE = 36;

// ─── Types ───────────────────────────────────────────────────────────────

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
	tensors: Float32Array[];
	metadata: CartridgeMetadata;
}

// ─── Reader ──────────────────────────────────────────────────────────────

export function parseCartridgeHeader(data: Uint8Array): CartridgeHeader {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
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

function fp16ToFloat32(fp16: number): number {
	const sign = (fp16 >> 15) & 1;
	const exp = (fp16 >> 10) & 0x1F;
	const mant = fp16 & 0x3FF;
	if (exp === 0) return sign ? -0 : 0;
	if (exp === 31) return sign ? -Infinity : Infinity;
	const value = (1 + mant / 1024) * Math.pow(2, exp - 15);
	return sign ? -value : value;
}
