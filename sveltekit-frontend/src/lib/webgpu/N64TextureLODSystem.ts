/**
 * Bounded WebGPU texture residency for revision-keyed LOD assets.
 * The N64 4 KiB TMEM value is a design reference, not browser GPU memory.
 */

export type N64TextureFormatV1 = 'r8uint' | 'r8unorm' | 'rgba8unorm';

export interface LODLevelV1 {
	level: number;
	width: number;
	height: number;
	data: ArrayBuffer;
	format?: N64TextureFormatV1;
	/** Kept for old manifest compatibility; compressed payloads are not admitted. */
	compressed?: boolean;
}

interface TextureAssetV1 {
	id: string;
	basePath: string;
	lodLevels: LODLevelV1[];
	currentLOD: number;
	priority: number;
	lastAccessed: number;
	gpuTexture?: GPUTexture;
	gpuBytes: number;
}

const TEXTURE_CACHE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_ACTIVE_TEXTURES = 32;
const MAX_TEXTURE_DIMENSION = 4096;

function bytesPerPixel(format: N64TextureFormatV1): number {
	return format === 'rgba8unorm' ? 4 : 1;
}

function expectedByteLength(level: LODLevelV1): number {
	const format = level.format ?? 'r8unorm';
	return level.width * level.height * bytesPerPixel(format);
}

function validateLevels(levels: LODLevelV1[]): LODLevelV1[] {
	if (!Array.isArray(levels) || levels.length === 0) throw new RangeError('At least one texture LOD is required.');
	const sorted = [...levels].sort((a, b) => a.level - b.level);
	const seenLevels = new Set<number>();
	for (const level of sorted) {
		const format = level.format ?? 'r8unorm';
		if (!Number.isSafeInteger(level.level) || level.level < 0 || seenLevels.has(level.level)) throw new RangeError('LOD levels must be unique non-negative integers.');
		if (!Number.isSafeInteger(level.width) || !Number.isSafeInteger(level.height) || level.width < 1 || level.height < 1 || level.width > MAX_TEXTURE_DIMENSION || level.height > MAX_TEXTURE_DIMENSION) {
			throw new RangeError('Texture dimensions are outside the supported bound.');
		}
		if (!['r8uint', 'r8unorm', 'rgba8unorm'].includes(format)) throw new RangeError('Unsupported texture format.');
		if (level.compressed) throw new RangeError('Compressed LOD payloads need a declared decoder and are not supported.');
		if (level.data.byteLength !== expectedByteLength(level)) throw new RangeError(`LOD ${level.level} has an invalid byte length.`);
		seenLevels.add(level.level);
	}
	return sorted;
}

/** Uploads real WebGPU textures and enforces an LRU budget over uncompressed texel payload bytes. */
export class N64TextureLODSystem {
	private device: GPUDevice | null = null;
	private textureCache = new Map<string, TextureAssetV1>();
	private activeTextures = new Map<string, GPUTexture>();
	private currentMemoryUsage = 0;
	private isInitialized = false;

	async initialize(deviceOverride?: GPUDevice): Promise<boolean> {
		try {
			if (!deviceOverride && this.device && this.isInitialized) return true;
			if (deviceOverride) {
				this.device = deviceOverride;
			} else {
				if (typeof navigator === 'undefined' || !navigator.gpu) return false;
				const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
				if (!adapter) return false;
				this.device = await adapter.requestDevice();
			}
			this.isInitialized = true;
			const activeDevice = this.device;
			void activeDevice.lost.then(() => {
				if (this.device !== activeDevice) return;
				this.device = null;
				this.activeTextures.clear();
				this.currentMemoryUsage = 0;
				for (const asset of this.textureCache.values()) {
					asset.gpuTexture = undefined;
					asset.gpuBytes = 0;
					asset.currentLOD = -1;
				}
				this.isInitialized = false;
			});
			return true;
		} catch {
			this.device = null;
			this.isInitialized = false;
			return false;
		}
	}

	registerTexture(id: string, basePath: string, lodLevels: LODLevelV1[]): void {
		if (!id.trim() || !basePath.trim()) throw new TypeError('Texture ID and revision-qualified cache key are required.');
		const levels = validateLevels(lodLevels);
		this.removeResidentTexture(id);
		this.textureCache.set(id, {
			id,
			basePath,
			lodLevels: levels,
			currentLOD: -1,
			priority: 0,
			lastAccessed: Date.now(),
			gpuBytes: 0,
		});
	}

	hasTexture(id: string): boolean {
		return this.textureCache.has(id);
	}

	getDevice(): GPUDevice | null {
		return this.device;
	}

	async requestTexture(id: string, targetLOD: number): Promise<GPUTexture | null> {
		if (!this.device || !this.isInitialized) return null;
		const asset = this.textureCache.get(id);
		if (!asset || !Number.isSafeInteger(targetLOD) || targetLOD < 0 || targetLOD >= asset.lodLevels.length) return null;
		asset.lastAccessed = Date.now();
		asset.priority += 1;
		if (asset.currentLOD === targetLOD && asset.gpuTexture) return asset.gpuTexture;

		const level = asset.lodLevels[targetLOD]!;
		const format = level.format ?? 'r8unorm';
		const byteLength = expectedByteLength(level);
		if (byteLength > TEXTURE_CACHE_SIZE_BYTES) return null;
		this.removeResidentTexture(id);
		while (this.currentMemoryUsage + byteLength > TEXTURE_CACHE_SIZE_BYTES || this.activeTextures.size >= MAX_ACTIVE_TEXTURES) {
			if (!this.evictLeastRecentlyUsed(id)) return null;
		}

		try {
			const texture = this.device.createTexture({
				label: `${asset.id}:lod-${level.level}`,
				size: { width: level.width, height: level.height, depthOrArrayLayers: 1 },
				format,
				usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
			});
			const bytes = new Uint8Array(level.data);
			this.device.queue.writeTexture(
				{ texture },
				bytes,
				{ bytesPerRow: level.width * bytesPerPixel(format), rowsPerImage: level.height },
				{ width: level.width, height: level.height, depthOrArrayLayers: 1 },
			);
			asset.gpuTexture = texture;
			asset.currentLOD = targetLOD;
			asset.gpuBytes = byteLength;
			asset.lastAccessed = Date.now();
			this.activeTextures.set(id, texture);
			this.currentMemoryUsage += byteLength;
			return texture;
		} catch {
			asset.gpuTexture = undefined;
			asset.currentLOD = -1;
			asset.gpuBytes = 0;
			return null;
		}
	}

	/** Drop one revision-keyed asset and release its GPU allocation. */
	unregisterTexture(id: string): void {
		this.removeResidentTexture(id);
		this.textureCache.delete(id);
	}

	private removeResidentTexture(id: string): void {
		const asset = this.textureCache.get(id);
		if (!asset?.gpuTexture) return;
		asset.gpuTexture.destroy();
		this.activeTextures.delete(id);
		this.currentMemoryUsage = Math.max(0, this.currentMemoryUsage - asset.gpuBytes);
		asset.gpuTexture = undefined;
		asset.gpuBytes = 0;
		asset.currentLOD = -1;
	}

	private evictLeastRecentlyUsed(excludeId: string): boolean {
		let oldest: TextureAssetV1 | undefined;
		for (const asset of this.textureCache.values()) {
			if (asset.id !== excludeId && asset.gpuTexture && (!oldest || asset.lastAccessed < oldest.lastAccessed)) oldest = asset;
		}
		if (!oldest) return false;
		this.removeResidentTexture(oldest.id);
		return true;
	}

	getStats(): { memoryUsed: number; memoryTotal: number; activeTextures: number; maxTextures: number; cacheSize: number; initialized: boolean } {
		return {
			memoryUsed: this.currentMemoryUsage,
			memoryTotal: TEXTURE_CACHE_SIZE_BYTES,
			activeTextures: this.activeTextures.size,
			maxTextures: MAX_ACTIVE_TEXTURES,
			cacheSize: this.textureCache.size,
			initialized: this.isInitialized,
		};
	}

	destroy(): void {
		for (const texture of this.activeTextures.values()) texture.destroy();
		this.activeTextures.clear();
		this.textureCache.clear();
		this.currentMemoryUsage = 0;
		this.device = null;
		this.isInitialized = false;
	}
}

export const n64TextureLOD = new N64TextureLODSystem();
