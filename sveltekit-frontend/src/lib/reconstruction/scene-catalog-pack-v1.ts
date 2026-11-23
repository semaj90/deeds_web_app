/**
 * Parent Atlas Scene Catalog Binary Pack & MRL Vector Contract (v1)
 *
 * Adapted from `parent-atlas-scene-catalog-v1`:
 * 1. Deterministic 256-bit (32-byte) feature masks (`encodeFeatureMask`, `popcount256`, `hamming256`).
 * 2. 64-byte cache-line aligned `PASC` v1 binary pack (`encodeScenePack`, `decodeScenePack`) within 8 MiB budget.
 * 3. Matryoshka Representation Learning (MRL 128/256/512/768) truncation & L2 normalization for `google/embeddinggemma-2`.
 * 4. Dependency-injected case-authorized catalog query & pack builder (`createSceneCatalogService`).
 *
 * Invariants:
 * - `PASC` pack is a compact binary streaming/index format, never an authorization bypass or canonical DB store.
 * - `mayReadAsset` is re-evaluated on every request before returning or packing any entry.
 */

import { createHash } from 'node:crypto';

// ============================================================================
// 1. 256-Bit Feature Bitset (32 Bytes)
// ============================================================================

export const FEATURE_BITS = 256;
export const FEATURE_BYTES = 32;

function checkedCode(code: number): number {
	if (!Number.isInteger(code) || code < 0 || code >= FEATURE_BITS) {
		throw new RangeError(`feature code must be 0..255, received ${code}`);
	}
	return code;
}

/** Bit order: feature 0 = bit 0 (LSB) of byte 0; format v1 is fixed. */
export function encodeFeatureMask(codes: Iterable<number>): Uint8Array {
	const mask = new Uint8Array(FEATURE_BYTES);
	for (const code of codes) {
		const n = checkedCode(code);
		mask[n >>> 3] |= 1 << (n & 7);
	}
	return mask;
}

function isByteArray(value: unknown): value is Uint8Array {
	return (
		value instanceof Uint8Array ||
		Buffer.isBuffer(value) ||
		(ArrayBuffer.isView(value) && (value as Uint8Array).BYTES_PER_ELEMENT === 1)
	);
}

export function validateFeatureMask(mask: unknown): Uint8Array {
	if (!isByteArray(mask) || mask.byteLength !== FEATURE_BYTES) {
		throw new TypeError(`feature mask must be exactly ${FEATURE_BYTES} bytes`);
	}
	return mask;
}

export function hasFeature(mask: Uint8Array, code: number): boolean {
	validateFeatureMask(mask);
	const n = checkedCode(code);
	return (mask[n >>> 3] & (1 << (n & 7))) !== 0;
}

export function hasAllFeatures(mask: Uint8Array, required: Iterable<number>): boolean {
	validateFeatureMask(mask);
	for (const code of required) {
		if (!hasFeature(mask, code)) return false;
	}
	return true;
}

export function popcount256(mask: Uint8Array): number {
	validateFeatureMask(mask);
	let count = 0;
	for (const byte of mask) {
		let value = byte;
		while (value) {
			value &= value - 1;
			count++;
		}
	}
	return count;
}

export function hamming256(a: Uint8Array, b: Uint8Array): number {
	validateFeatureMask(a);
	validateFeatureMask(b);
	let count = 0;
	for (let i = 0; i < FEATURE_BYTES; i++) {
		let value = a[i] ^ b[i];
		while (value) {
			value &= value - 1;
			count++;
		}
	}
	return count;
}

// ============================================================================
// 2. 64-Byte Aligned PASC v1 Binary Scene Pack
// ============================================================================

export const MAGIC = 'PASC';
export const PACK_VERSION = 1;
export const PACK_HEADER_BYTES = 64;
export const RECORD_STRIDE = 64;
export const TRANSFORM_STRIDE = 64;
export const FEATURE_STRIDE = 32;
export const MAX_PACK_BYTES = 8 * 1024 * 1024;
export const MAX_COUNT = 20_000;

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA_RE = /^[a-f0-9]{64}$/i;
const asciiDecoder = new TextDecoder('ascii');

function align64(x: number): number {
	return Math.ceil(x / 64) * 64;
}

function intRange(n: number, max: number, label: string): number {
	if (!Number.isInteger(n) || n < 0 || n > max) {
		throw new RangeError(`${label} out of range`);
	}
	return n;
}

function uuidHex(value: string): string {
	if (!UUID_RE.test(value)) throw new TypeError(`invalid UUID ${value}`);
	return value.replaceAll('-', '').toLowerCase();
}

function hexBytes(value: string, requiredLength: number, label: string): Buffer {
	const regex = requiredLength === 32 ? SHA_RE : /^[a-f0-9]+$/i;
	if (typeof value !== 'string' || !regex.test(value) || value.length !== requiredLength * 2) {
		throw new TypeError(`${label} must be ${requiredLength}-byte hex`);
	}
	return Buffer.from(value, 'hex');
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
}

function uuidFromHex(hex: string): string {
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function identityMatrix(): Float32Array {
	const m = new Float32Array(16);
	m[0] = m[5] = m[10] = m[15] = 1;
	return m;
}

export interface ScenePackEntryInputV1 {
	id: string;
	assetSha256: string;
	handle?: number;
	taxonomyCode: number;
	lod?: number;
	flags?: number;
	materialId?: number;
	motionId?: number;
	matrix?: Float32Array | readonly number[];
	features: Uint8Array;
	embedding?: {
		modelId: string;
		modelRevision: string;
		promptProfile: string;
		vector768: Float32Array | readonly number[];
	};
}

export interface ScenePackEntryDecodedV1 {
	id: string;
	assetSha256: string;
	handle: number;
	taxonomyCode: number;
	lod: number;
	flags: number;
	materialId: number;
	motionId: number;
	matrix: Float32Array;
	features: Uint8Array;
}

export interface DecodedScenePackV1 {
	revision: number;
	entries: ScenePackEntryDecodedV1[];
	bytes: number;
	layout: {
		recordOffset: number;
		matrixOffset: number;
		featureOffset: number;
		recordStride: number;
		featureStride: number;
	};
}

/**
 * PASC v1: 64B header, 64B records, 64B world matrices, 32B masks.
 * Little-endian. File section offsets are 64B aligned.
 */
export function encodeScenePack(
	entries: readonly ScenePackEntryInputV1[],
	options: { revision?: number; maxBytes?: number } = {}
): Buffer {
	const revision = options.revision ?? 1;
	const maxBytes = options.maxBytes ?? MAX_PACK_BYTES;

	if (!Array.isArray(entries) || entries.length > MAX_COUNT) {
		throw new RangeError('too many entries');
	}
	intRange(revision, 0xffffffff, 'revision');

	const count = entries.length;
	const recordOffset = PACK_HEADER_BYTES;
	const matrixOffset = align64(recordOffset + count * RECORD_STRIDE);
	const featureOffset = align64(matrixOffset + count * TRANSFORM_STRIDE);
	const totalBytes = align64(featureOffset + count * FEATURE_STRIDE);

	if (totalBytes > maxBytes || totalBytes > MAX_PACK_BYTES) {
		throw new RangeError('catalog pack budget exceeded');
	}

	const output = Buffer.alloc(totalBytes);
	const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

	output.write(MAGIC, 0, 4, 'ascii');
	view.setUint16(4, PACK_VERSION, true);
	view.setUint16(6, 0x0102, true);
	view.setUint32(8, count, true);
	view.setUint32(12, RECORD_STRIDE, true);
	view.setUint32(16, recordOffset, true);
	view.setUint32(20, matrixOffset, true);
	view.setUint32(24, featureOffset, true);
	view.setUint32(28, totalBytes, true);
	view.setUint32(32, revision, true);

	const seenUuids = new Set<string>();
	const seenHandles = new Set<number>();

	for (let i = 0; i < count; i++) {
		const entry = entries[i];
		const uuid = uuidHex(entry.id);
		if (seenUuids.has(uuid)) throw new Error('duplicate UUID');
		seenUuids.add(uuid);

		const handle = intRange(entry.handle ?? i, 0xffffffff, 'handle');
		if (seenHandles.has(handle)) throw new Error('duplicate handle');
		seenHandles.add(handle);

		intRange(entry.taxonomyCode, 255, 'taxonomy code');
		intRange(entry.lod ?? 0, 2, 'lod');
		intRange(entry.flags ?? 0, 65535, 'flags');
		intRange(entry.materialId ?? 0, 0xffffffff, 'material id');
		intRange(entry.motionId ?? 0, 0xffffffff, 'motion id');

		const matrix = entry.matrix ?? identityMatrix();
		if (matrix.length !== 16) throw new RangeError('matrix must have 16 floats');
		const features = validateFeatureMask(entry.features);

		const offset = recordOffset + RECORD_STRIDE * i;
		hexBytes(uuid, 16, 'UUID').copy(output, offset);
		hexBytes(entry.assetSha256, 32, 'sha256').copy(output, offset + 16);
		view.setUint32(offset + 48, handle, true);
		view.setUint8(offset + 52, entry.taxonomyCode);
		view.setUint8(offset + 53, entry.lod ?? 0);
		view.setUint16(offset + 54, entry.flags ?? 0, true);
		view.setUint32(offset + 56, entry.materialId ?? 0, true);
		view.setUint32(offset + 60, entry.motionId ?? 0, true);

		for (let j = 0; j < 16; j++) {
			if (!Number.isFinite(matrix[j])) throw new TypeError('nonfinite matrix');
			view.setFloat32(matrixOffset + i * TRANSFORM_STRIDE + j * 4, matrix[j], true);
		}
		Buffer.from(features).copy(output, featureOffset + i * FEATURE_STRIDE);
	}

	return output;
}

export function decodeScenePack(data: Uint8Array): DecodedScenePackV1 {
	if (!isByteArray(data)) throw new TypeError('expected binary Uint8Array');
	if (data.byteLength < PACK_HEADER_BYTES || data.byteLength > MAX_PACK_BYTES) {
		throw new RangeError('invalid pack length');
	}

	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	if (asciiDecoder.decode(data.subarray(0, 4)) !== MAGIC) throw new Error('bad magic');
	if (view.getUint16(4, true) !== PACK_VERSION || view.getUint16(6, true) !== 0x0102) {
		throw new Error('unsupported version or endianness');
	}

	const count = view.getUint32(8, true);
	const recordStride = view.getUint32(12, true);
	const recordOffset = view.getUint32(16, true);
	const matrixOffset = view.getUint32(20, true);
	const featureOffset = view.getUint32(24, true);
	const totalBytes = view.getUint32(28, true);
	const revision = view.getUint32(32, true);

	if (
		count > MAX_COUNT ||
		recordStride !== RECORD_STRIDE ||
		recordOffset !== PACK_HEADER_BYTES ||
		matrixOffset !== align64(recordOffset + count * RECORD_STRIDE) ||
		featureOffset !== align64(matrixOffset + count * TRANSFORM_STRIDE) ||
		totalBytes !== align64(featureOffset + count * FEATURE_STRIDE) ||
		totalBytes !== data.byteLength
	) {
		throw new Error('corrupt section layout');
	}

	const entries: ScenePackEntryDecodedV1[] = [];
	const seenUuids = new Set<string>();
	const seenHandles = new Set<number>();

	for (let i = 0; i < count; i++) {
		const off = recordOffset + i * RECORD_STRIDE;
		const hex = bytesToHex(data.subarray(off, off + 16));
		const id = uuidFromHex(hex);
		const assetSha256 = bytesToHex(data.subarray(off + 16, off + 48));
		const handle = view.getUint32(off + 48, true);
		const taxonomyCode = view.getUint8(off + 52);
		const lod = view.getUint8(off + 53);
		const flags = view.getUint16(off + 54, true);
		const materialId = view.getUint32(off + 56, true);
		const motionId = view.getUint32(off + 60, true);

		if (lod > 2 || seenUuids.has(id) || seenHandles.has(handle)) {
			throw new Error('corrupt record');
		}
		seenUuids.add(id);
		seenHandles.add(handle);

		const matrix = new Float32Array(16);
		for (let j = 0; j < 16; j++) {
			const n = view.getFloat32(matrixOffset + i * TRANSFORM_STRIDE + j * 4, true);
			if (!Number.isFinite(n)) throw new Error('nonfinite matrix in pack');
			matrix[j] = n;
		}
		const features = new Uint8Array(
			data.subarray(featureOffset + i * FEATURE_STRIDE, featureOffset + (i + 1) * FEATURE_STRIDE)
		);
		entries.push({ id, assetSha256, handle, taxonomyCode, lod, flags, materialId, motionId, matrix, features });
	}

	return {
		revision,
		entries,
		bytes: totalBytes,
		layout: {
			recordOffset,
			matrixOffset,
			featureOffset,
			recordStride,
			featureStride: FEATURE_BYTES
		}
	};
}

// ============================================================================
// 3. Matryoshka Representation Learning (MRL 128/256/512/768)
// ============================================================================

export const MODEL_ID = 'google/embeddinggemma-2' as const;
export const MRL_DIMS = Object.freeze([128, 256, 512, 768] as const);
export type MrlDimV1 = (typeof MRL_DIMS)[number];

/**
 * MRL is an ordered prefix, not a random projection or a 256-bit signature.
 * Separate model revisions / prompt strategies must not be mixed.
 */
export function normalizeMrl(fullVector: Float32Array | readonly number[], dim: MrlDimV1 = 256): Float32Array {
	if (!MRL_DIMS.includes(dim)) throw new RangeError('unsupported MRL dimension');
	if (!fullVector || fullVector.length !== 768) {
		throw new TypeError('expect exactly 768 coordinates from EmbeddingGemma 2');
	}
	let sumSq = 0;
	for (let i = 0; i < dim; i++) {
		const v = fullVector[i];
		if (!Number.isFinite(v)) throw new TypeError('nonfinite embedding coordinate');
		sumSq += v * v;
	}
	if (!(sumSq > 0)) throw new RangeError('zero vector cannot be normalized');
	const scale = 1 / Math.sqrt(sumSq);
	return Float32Array.from({ length: dim }, (_, i) => fullVector[i] * scale);
}

export function cosineNormalized(a: Float32Array, b: Float32Array): number {
	if (!a || !b || a.length !== b.length || !MRL_DIMS.includes(a.length as MrlDimV1)) {
		throw new TypeError('incompatible MRL vectors');
	}
	let dot = 0;
	for (let i = 0; i < a.length; i++) {
		if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw new TypeError('nonfinite');
		dot += a[i] * b[i];
	}
	return dot;
}

// ============================================================================
// 4. Case-Authorized Catalog Query & Pack Service
// ============================================================================

export interface CatalogAuthContextV1 {
	principalId: string | number;
	caseId: string;
}

export interface CatalogQueryInputV1 {
	sceneId: string;
	taxonomyCode?: number;
	requiredFeatures?: Iterable<number>;
	embedding?: {
		modelId: string;
		modelRevision: string;
		promptProfile: string;
		vector768: Float32Array | readonly number[];
		dims?: MrlDimV1;
	} | null;
	limit?: number;
}

export function createSceneCatalogService(adapters: {
	listSceneCandidates: (ctx: CatalogAuthContextV1, sceneId: string) => Promise<ScenePackEntryInputV1[]>;
	mayReadAsset: (ctx: CatalogAuthContextV1, candidate: ScenePackEntryInputV1) => Promise<boolean>;
}) {
	if (typeof adapters?.listSceneCandidates !== 'function' || typeof adapters?.mayReadAsset !== 'function') {
		throw new TypeError('scene candidate and asset authorizer adapters are required');
	}

	async function authorizedEntries(context: CatalogAuthContextV1, sceneId: string): Promise<ScenePackEntryInputV1[]> {
		if (!context || !context.principalId || !context.caseId || !sceneId) {
			throw new Error('authenticated case scope required');
		}
		const candidates = await adapters.listSceneCandidates(context, sceneId);
		if (!Array.isArray(candidates)) throw new TypeError('invalid catalog source');
		const result: ScenePackEntryInputV1[] = [];
		for (const candidate of candidates) {
			// Deliberately reauthorize on every request, even if the asset is cached.
			if (await adapters.mayReadAsset(context, candidate)) {
				result.push(candidate);
			}
		}
		return result;
	}

	async function query(context: CatalogAuthContextV1, input: CatalogQueryInputV1) {
		const { sceneId, taxonomyCode, requiredFeatures = [], embedding = null, limit = 25 } = input;
		if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
			throw new RangeError('limit must be 1..100');
		}
		if (taxonomyCode !== undefined && (!Number.isInteger(taxonomyCode) || taxonomyCode < 0 || taxonomyCode > 255)) {
			throw new RangeError('taxonomyCode must be uint8');
		}
		const entries = (await authorizedEntries(context, sceneId)).filter(
			(e) => (taxonomyCode === undefined || e.taxonomyCode === taxonomyCode) && hasAllFeatures(e.features, requiredFeatures)
		);
		let scores: { entry: ScenePackEntryInputV1; score: number | null }[] = entries.map((entry) => ({
			entry,
			score: null
		}));

		if (embedding) {
			const { modelId, modelRevision, vector768, dims = 256, promptProfile } = embedding;
			if (modelId !== MODEL_ID || !modelRevision || !promptProfile) {
				throw new Error('explicit model and prompt profile required');
			}
			const q = normalizeMrl(vector768, dims);
			scores = scores
				.filter(
					({ entry }) =>
						entry.embedding &&
						entry.embedding.modelId === modelId &&
						entry.embedding.modelRevision === modelRevision &&
						entry.embedding.promptProfile === promptProfile
				)
				.map(({ entry }) => ({
					entry,
					score: cosineNormalized(q, normalizeMrl(entry.embedding!.vector768, dims))
				}));
			scores.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.entry.id.localeCompare(b.entry.id));
		}

		return scores.slice(0, limit).map(({ entry, score }) => ({
			id: entry.id,
			handle: entry.handle ?? 0,
			taxonomyCode: entry.taxonomyCode,
			assetSha256: entry.assetSha256,
			lod: entry.lod ?? 0,
			score
		}));
	}

	async function buildAuthorizedPack(context: CatalogAuthContextV1, options: { sceneId: string; revision?: number }) {
		const entries = await authorizedEntries(context, options.sceneId);
		const binary = encodeScenePack(entries, { revision: options.revision });
		return {
			binary,
			sha256: createHash('sha256').update(binary).digest('hex'),
			contentType: 'application/vnd.parent-atlas.scene-pack-v1' as const,
			count: entries.length
		};
	}

	return { query, buildAuthorizedPack };
}
