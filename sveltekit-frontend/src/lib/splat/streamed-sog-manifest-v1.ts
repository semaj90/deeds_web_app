import { z } from 'zod';

const finite = z.number().finite();
const vector3 = z.tuple([finite, finite, finite]);
const lodReferenceSchema = z.object({
	file: z.number().int().nonnegative(),
	offset: z.number().int().nonnegative(),
	count: z.number().int().positive()
}).strict();
const manifestSchema = z.object({
	version: z.literal(1),
	asset: z.object({ generator: z.string().min(1).max(200) }).passthrough().optional(),
	count: z.number().int().positive(),
	counts: z.array(z.number().int().positive()).min(1).max(16),
	lodLevels: z.number().int().positive().max(16),
	lodErrors: z.boolean().optional(),
	environment: z.string().min(1).max(500).optional(),
	filenames: z.array(z.string().min(1).max(500)).min(1).max(100_000),
	tree: z.unknown()
}).strict();
const nodeSchema = z.object({
	bound: z.object({ min: vector3, max: vector3 }).strict(),
	children: z.array(z.unknown()).length(2).optional(),
	lods: z.record(z.string(), lodReferenceSchema).optional()
}).strict();
const safeRelativeFile = z.string().min(1).max(500).regex(/^[A-Za-z0-9._/-]+$/);
const sogChunkMetaSchema = z.object({
	version: z.literal(2),
	asset: z.object({ generator: z.string().min(1).max(200) }).passthrough().optional(),
	count: z.number().int().positive(),
	model: z.enum(['antialiased', '2dgs']).optional(),
	means: z.object({ mins: vector3, maxs: vector3, files: z.tuple([safeRelativeFile, safeRelativeFile]) }).strict(),
	scales: z.object({ codebook: z.array(finite).length(256), files: z.tuple([safeRelativeFile]) }).strict(),
	quats: z.object({ files: z.tuple([safeRelativeFile]) }).strict(),
	sh0: z.object({ codebook: z.array(finite).length(256), files: z.tuple([safeRelativeFile]) }).strict(),
	shN: z.object({ count: z.number().int().positive(), bands: z.number().int().positive(), codebook: z.array(finite).length(256), files: z.tuple([safeRelativeFile, safeRelativeFile]) }).strict().optional()
}).passthrough();

export const STREAMED_SOG_MANIFEST_MAX_BYTES = 1024 * 1024;
export const STREAMED_SOG_CHUNK_MAX_BYTES = 64 * 1024 * 1024;
export const STREAMED_SOG_PACKAGE_MAX_BYTES = 512 * 1024 * 1024;
const MAX_TREE_NODES = 100_000;
const MAX_TREE_DEPTH = 64;

export interface StreamedSogManifestV1 {
	version: 1;
	asset?: Record<string, unknown>;
	count: number;
	counts: number[];
	lodLevels: number;
	lodErrors?: boolean;
	environment?: string;
	filenames: string[];
	/** The validated upstream object is retained for the renderer's tree traversal. */
	tree: unknown;
}

export interface StreamedSogPackageFileV1 {
	path: string;
	bytes: number;
	sha256: string;
}

export interface StreamedSogPackageReceiptV1 {
	filesVerified: number;
	totalBytes: number;
	chunkCount: number;
	gaussianCount: number;
	lodCounts: number[];
}

function isSafeChunkMetaPath(path: string): boolean {
	if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.startsWith('/') || !path.endsWith('/meta.json')) return false;
	const parts = path.split('/');
	return parts.length >= 2 && parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

/**
 * Validate untrusted Streamed SOG lod-meta.json before using its chunk paths.
 * This verifies format structure and tree/count consistency, not chunk bytes,
 * source lineage, visual quality, or renderer compatibility.
 */
export function validateStreamedSogManifestV1(input: unknown): StreamedSogManifestV1 {
	const manifest = manifestSchema.parse(input);
	if (manifest.counts.length !== manifest.lodLevels) throw new Error('SOG_LOD_LEVEL_COUNT_MISMATCH');
	if (manifest.counts.reduce((sum, count) => sum + count, 0) !== manifest.count) throw new Error('SOG_TOTAL_COUNT_MISMATCH');
	if (new Set(manifest.filenames).size !== manifest.filenames.length) throw new Error('SOG_DUPLICATE_CHUNK_PATH');
	if (manifest.filenames.some((filename) => !isSafeChunkMetaPath(filename))) throw new Error('SOG_UNSAFE_CHUNK_PATH');
	if (manifest.environment && !isSafeChunkMetaPath(manifest.environment)) throw new Error('SOG_UNSAFE_ENVIRONMENT_PATH');

	const levelCounts = new Array(manifest.lodLevels).fill(0) as number[];
	const fileRanges = new Map<number, Array<{ start: number; end: number }>>();
	const stack: Array<{ node: unknown; depth: number }> = [{ node: manifest.tree, depth: 0 }];
	let visited = 0;
	while (stack.length) {
		const { node: untrustedNode, depth } = stack.pop()!;
		if (++visited > MAX_TREE_NODES) throw new Error('SOG_TREE_NODE_LIMIT_EXCEEDED');
		if (depth > MAX_TREE_DEPTH) throw new Error('SOG_TREE_DEPTH_LIMIT_EXCEEDED');
		const node = nodeSchema.parse(untrustedNode);
		for (let axis = 0; axis < 3; axis++) {
			if (node.bound.min[axis] > node.bound.max[axis]) throw new Error('SOG_INVALID_NODE_BOUNDS');
		}
		if (node.children) {
			if (node.lods) throw new Error('SOG_INTERNAL_NODE_HAS_LODS');
			stack.push({ node: node.children[1], depth: depth + 1 }, { node: node.children[0], depth: depth + 1 });
			continue;
		}
		if (!node.lods || Object.keys(node.lods).length === 0) throw new Error('SOG_LEAF_HAS_NO_LOD_REFERENCES');
		for (const [levelKey, reference] of Object.entries(node.lods)) {
			const level = Number(levelKey);
			if (!Number.isInteger(level) || String(level) !== levelKey || level < 0 || level >= manifest.lodLevels) {
				throw new Error('SOG_INVALID_LOD_LEVEL_KEY');
			}
			if (reference.file >= manifest.filenames.length) throw new Error('SOG_CHUNK_FILE_INDEX_OUT_OF_RANGE');
			levelCounts[level] += reference.count;
			const ranges = fileRanges.get(reference.file) ?? [];
			ranges.push({ start: reference.offset, end: reference.offset + reference.count });
			fileRanges.set(reference.file, ranges);
		}
	}
	if (levelCounts.some((count, level) => count !== manifest.counts[level])) throw new Error('SOG_TREE_COUNTS_MISMATCH');
	for (const ranges of fileRanges.values()) {
		ranges.sort((a, b) => a.start - b.start);
		let expectedOffset = 0;
		for (const range of ranges) {
			if (range.start !== expectedOffset) throw new Error('SOG_CHUNK_RANGES_OVERLAP_OR_GAP');
			expectedOffset = range.end;
		}
	}
	return {
		version: manifest.version,
		...(manifest.asset ? { asset: manifest.asset } : {}),
		count: manifest.count,
		counts: [...manifest.counts],
		lodLevels: manifest.lodLevels,
		...(manifest.lodErrors !== undefined ? { lodErrors: manifest.lodErrors } : {}),
		...(manifest.environment ? { environment: manifest.environment } : {}),
		filenames: [...manifest.filenames],
		tree: manifest.tree
	};
}

export function parseStreamedSogManifestJsonV1(json: string): StreamedSogManifestV1 {
	if (new TextEncoder().encode(json).byteLength > STREAMED_SOG_MANIFEST_MAX_BYTES) throw new Error('SOG_MANIFEST_BYTE_LIMIT_EXCEEDED');
	let value: unknown;
	try { value = JSON.parse(json); }
	catch { throw new Error('SOG_MANIFEST_INVALID_JSON'); }
	return validateStreamedSogManifestV1(value);
}

function safeSogMetaPath(path: string): boolean {
	return isSafeChunkMetaPath(path) && path.endsWith('/meta.json');
}

function joinSogAssetPath(metaPath: string, filename: string): string {
	const file = safeRelativeFile.parse(filename);
	if (file.startsWith('/') || file.includes('\\') || file.split('/').some((part) => !part || part === '.' || part === '..')) {
		throw new Error('SOG_UNSAFE_TEXTURE_PATH');
	}
	const prefix = metaPath.slice(0, metaPath.lastIndexOf('/') + 1);
	return `${prefix}${file}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const localBytes = bytes.slice().buffer as ArrayBuffer;
	const digest = await globalThis.crypto.subtle.digest('SHA-256', localBytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify all metadata and texture bytes referenced by a Streamed SOG package.
 * The caller supplies revision-bound expected hashes; reads are sequential and
 * bounded. This is package integrity admission, not renderer or visual proof.
 */
export async function verifyStreamedSogPackageV1(input: {
	files: readonly StreamedSogPackageFileV1[];
	readFile: (path: string, maximumBytes: number) => Promise<Uint8Array>;
	maximumTotalBytes?: number;
}): Promise<StreamedSogPackageReceiptV1> {
	const maximumTotalBytes = input.maximumTotalBytes ?? STREAMED_SOG_PACKAGE_MAX_BYTES;
	if (!Number.isSafeInteger(maximumTotalBytes) || maximumTotalBytes <= 0 || maximumTotalBytes > STREAMED_SOG_PACKAGE_MAX_BYTES) {
		throw new Error('SOG_INVALID_TOTAL_BYTE_LIMIT');
	}
	const records = new Map<string, StreamedSogPackageFileV1>();
	for (const record of input.files) {
		if (!safeRelativeFile.safeParse(record.path).success || record.path.startsWith('/') || record.path.includes('\\') || record.path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('SOG_UNSAFE_PACKAGE_PATH');
		if (!/^[a-f0-9]{64}$/i.test(record.sha256) || !Number.isSafeInteger(record.bytes) || record.bytes <= 0 || record.bytes > STREAMED_SOG_CHUNK_MAX_BYTES) throw new Error('SOG_INVALID_FILE_RECEIPT');
		if (records.has(record.path)) throw new Error('SOG_DUPLICATE_FILE_RECEIPT');
		records.set(record.path, record);
	}
	let totalBytes = 0;
	let filesVerified = 0;
	const verified = new Set<string>();
	const verifyFile = async (path: string, maximumBytes: number) => {
		if (verified.has(path)) return;
		const record = records.get(path);
		if (!record) throw new Error('SOG_PACKAGE_FILE_RECEIPT_MISSING');
		if (record.bytes > maximumBytes) throw new Error('SOG_PACKAGE_FILE_BYTE_LIMIT_EXCEEDED');
		const bytes = await input.readFile(path, maximumBytes);
		if (!ArrayBuffer.isView(bytes) || Object.prototype.toString.call(bytes) !== '[object Uint8Array]' || bytes.byteLength !== record.bytes || bytes.byteLength > maximumBytes) throw new Error('SOG_PACKAGE_FILE_LENGTH_MISMATCH');
		if ((await sha256Hex(bytes)).toLowerCase() !== record.sha256.toLowerCase()) throw new Error('SOG_PACKAGE_FILE_HASH_MISMATCH');
		totalBytes += bytes.byteLength;
		if (totalBytes > maximumTotalBytes) throw new Error('SOG_PACKAGE_TOTAL_BYTE_LIMIT_EXCEEDED');
		verified.add(path);
		filesVerified += 1;
		return bytes;
	};
	const lodMetaBytes = await verifyFile('lod-meta.json', STREAMED_SOG_MANIFEST_MAX_BYTES);
	const manifest = parseStreamedSogManifestJsonV1(new TextDecoder('utf-8', { fatal: true }).decode(lodMetaBytes!));
	const chunkCounts = new Map<string, number>();
	const stack = [manifest.tree];
	while (stack.length) {
		const node = nodeSchema.parse(stack.pop());
		if (node.children) stack.push(...node.children);
		else if (node.lods) {
			for (const ref of Object.values(node.lods)) {
				const metaPath = manifest.filenames[ref.file];
				if (!metaPath) throw new Error('SOG_CHUNK_FILE_INDEX_OUT_OF_RANGE');
				chunkCounts.set(metaPath, (chunkCounts.get(metaPath) ?? 0) + ref.count);
			}
		}
	}
	for (const path of manifest.filenames) {
		if (!safeSogMetaPath(path) || !chunkCounts.has(path)) throw new Error('SOG_UNREFERENCED_OR_UNSAFE_CHUNK_META');
	}
	const chunkMetaPaths = [...manifest.filenames];
	if (manifest.environment) chunkMetaPaths.push(manifest.environment);
	for (const metaPath of chunkMetaPaths) {
		const metaBytes = await verifyFile(metaPath, STREAMED_SOG_MANIFEST_MAX_BYTES);
		if (!metaBytes) continue;
		let rawMeta: unknown;
		try { rawMeta = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metaBytes)); }
		catch { throw new Error('SOG_CHUNK_META_INVALID_JSON'); }
		const meta = sogChunkMetaSchema.parse(rawMeta);
		if (meta.means.mins.some((value, axis) => value > meta.means.maxs[axis])) throw new Error('SOG_CHUNK_META_INVALID_BOUNDS');
		if (metaPath !== manifest.environment && meta.count !== chunkCounts.get(metaPath)) throw new Error('SOG_CHUNK_GAUSSIAN_COUNT_MISMATCH');
		const textureNames = [
			...meta.means.files, ...meta.scales.files, ...meta.quats.files, ...meta.sh0.files,
			...(meta.shN?.files ?? [])
		];
		if (new Set(textureNames).size !== textureNames.length) throw new Error('SOG_DUPLICATE_TEXTURE_PATH');
		for (const untrustedTextureName of textureNames) {
			const textureName = safeRelativeFile.parse(untrustedTextureName);
			const texturePath = joinSogAssetPath(metaPath, textureName);
			const texture = await verifyFile(texturePath, STREAMED_SOG_CHUNK_MAX_BYTES);
			if (!texture || texture.byteLength < 12 || String.fromCharCode(...texture.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...texture.subarray(8, 12)) !== 'WEBP') {
				throw new Error('SOG_TEXTURE_NOT_WEBP');
			}
		}
	}
	if (verified.size !== records.size) throw new Error('SOG_UNREFERENCED_PACKAGE_FILE');
	return {
		filesVerified,
		totalBytes,
		chunkCount: manifest.filenames.length,
		gaussianCount: manifest.count,
		lodCounts: [...manifest.counts]
	};
}
