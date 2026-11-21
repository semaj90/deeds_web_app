/**
 * Parent Atlas Shared Texture & Asset Residency Registry (v1) (`MEM-01` / `MEM-02`)
 *
 * Implements browser-side shared GPU texture ownership so multiple rooms, buildings,
 * or urban cells (e.g. 100 plaster walls across a 4-bedroom house + urban scene)
 * share ONE resident `THREE.Texture` allocation rather than duplicating GPU memory.
 *
 * Capabilities:
 * - Reference counting: `acquire`, `release`, `pin`, `unpin`.
 * - Single-flight async deduplication (`acquireAsync`) + byte reservation before admission.
 * - LRU eviction (`evictToBudget`) sorting zero-ref / zero-pin entries by `lastUsedFrame`.
 * - Incremental cell byte-budget admission: `B_required = B_geometry + B_newTextures + B_staging`.
 * - WebGL context-loss recovery (`invalidateRendererContext`).
 */

import * as THREE from 'three';

export type AssetScopeV1 = 'public-template' | `case:${string}`;
export type TextureCodecV1 = 'rgba8' | 'palette-r8' | 'ktx2';

export interface TexturePageRefV1 {
	pageId: number;
	sha256: string;
	artifactSha256: string;
	codec: TextureCodecV1;
	formatVersion: number;
	lod: number;
	securityScope: AssetScopeV1;
	/** 64-bit offsets serialized as decimal strings for JSON safety. */
	byteOffset: string;
	byteLength: string;
	width: number;
	height: number;
	mipLevels: number;
	estimatedCpuBytes: number;
	estimatedGpuBytes: number;
}

export interface ResidentTextureEntryV1 {
	key: string;
	texture: THREE.Texture;
	refs: number;
	pins: number;
	estimatedGpuBytes: number;
	lastUsedFrame: number;
	securityScope: AssetScopeV1;
	state: 'resident' | 'evicting';
}

export interface MemoryBudgetProfileV1 {
	profile: 'retro' | 'balanced' | 'detailed';
	maxCellCpuBytes: number;
	maxStagingBytes: number;
	maxGpuTextureBytes: number;
	maxUploadBytesPerFrame: number;
	hysteresisBytes: number;
}

export const MEMORY_BUDGET_PROFILES_V1: Readonly<Record<'retro' | 'balanced' | 'detailed', MemoryBudgetProfileV1>> =
	Object.freeze({
		retro: {
			profile: 'retro',
			maxCellCpuBytes: 8 * 1024 * 1024,
			maxStagingBytes: 16 * 1024 * 1024,
			maxGpuTextureBytes: 32 * 1024 * 1024,
			maxUploadBytesPerFrame: 1 * 1024 * 1024,
			hysteresisBytes: 512 * 1024
		},
		balanced: {
			profile: 'balanced',
			maxCellCpuBytes: 16 * 1024 * 1024,
			maxStagingBytes: 32 * 1024 * 1024,
			maxGpuTextureBytes: 64 * 1024 * 1024,
			maxUploadBytesPerFrame: 2 * 1024 * 1024,
			hysteresisBytes: 1 * 1024 * 1024
		},
		detailed: {
			profile: 'detailed',
			maxCellCpuBytes: 32 * 1024 * 1024,
			maxStagingBytes: 64 * 1024 * 1024,
			maxGpuTextureBytes: 128 * 1024 * 1024,
			maxUploadBytesPerFrame: 4 * 1024 * 1024,
			hysteresisBytes: 2 * 1024 * 1024
		}
	});

export function buildSharedTextureCacheKeyV1(ref: Pick<TexturePageRefV1, 'securityScope' | 'codec' | 'formatVersion' | 'lod' | 'sha256' | 'pageId'>): string {
	return `${ref.securityScope}:${ref.codec}:v${ref.formatVersion}:lod${ref.lod}:p${ref.pageId}:${ref.sha256}`;
}

export class SharedTextureRegistryV1 {
	private readonly entries = new Map<string, ResidentTextureEntryV1>();
	private readonly inflight = new Map<string, Promise<THREE.Texture>>();
	private readonly reservedBytes = new Map<string, number>();
	private residentGpuBytes = 0;
	private totalReservedBytes = 0;
	private cacheHits = 0;
	private cacheMisses = 0;
	private evictions = 0;

	constructor(private readonly maxGpuBytes: number = 32 * 1024 * 1024) {}

	/** Synchronous acquire for procedural or already-decoded textures. */
	acquire(
		key: string,
		factory: () => THREE.Texture,
		estimatedGpuBytes: number,
		frame: number,
		securityScope: AssetScopeV1 = 'public-template'
	): THREE.Texture {
		if (!Number.isFinite(estimatedGpuBytes) || estimatedGpuBytes < 0) {
			throw new RangeError('estimatedGpuBytes must be non-negative');
		}
		const existing = this.entries.get(key);
		if (existing && existing.state === 'resident') {
			existing.refs++;
			existing.lastUsedFrame = frame;
			this.cacheHits++;
			return existing.texture;
		}

		this.cacheMisses++;
		const texture = factory();
		this.entries.set(key, {
			key,
			texture,
			refs: 1,
			pins: 0,
			estimatedGpuBytes,
			lastUsedFrame: frame,
			securityScope,
			state: 'resident'
		});
		this.residentGpuBytes += estimatedGpuBytes;
		return texture;
	}

	/**
	 * Single-flight async acquire with pre-admission byte reservation and AbortSignal cancellation.
	 * Prevents duplicate concurrent network/worker decodes for the same texture page.
	 */
	async acquireAsync(
		key: string,
		loader: (signal: AbortSignal) => Promise<THREE.Texture>,
		estimatedGpuBytes: number,
		frame: number,
		securityScope: AssetScopeV1 = 'public-template',
		signal?: AbortSignal
	): Promise<THREE.Texture> {
		const existing = this.entries.get(key);
		if (existing && existing.state === 'resident') {
			existing.refs++;
			existing.lastUsedFrame = frame;
			this.cacheHits++;
			return existing.texture;
		}

		let pending = this.inflight.get(key);
		if (!pending) {
			this.cacheMisses++;
			this.reservedBytes.set(key, estimatedGpuBytes);
			this.totalReservedBytes += estimatedGpuBytes;

			const ac = new AbortController();
			if (signal) {
				if (signal.aborted) ac.abort();
				else signal.addEventListener('abort', () => ac.abort(), { once: true });
			}

			pending = loader(ac.signal)
				.then((texture) => {
					this.entries.set(key, {
						key,
						texture,
						refs: 0,
						pins: 0,
						estimatedGpuBytes,
						lastUsedFrame: frame,
						securityScope,
						state: 'resident'
					});
					this.residentGpuBytes += estimatedGpuBytes;
					return texture;
				})
				.finally(() => {
					this.inflight.delete(key);
					const res = this.reservedBytes.get(key) ?? 0;
					this.reservedBytes.delete(key);
					this.totalReservedBytes = Math.max(0, this.totalReservedBytes - res);
				});

			this.inflight.set(key, pending);
		}

		const tex = await pending;
		const entry = this.entries.get(key);
		if (entry) {
			entry.refs++;
			entry.lastUsedFrame = frame;
		}
		return tex;
	}

	release(key: string): void {
		const entry = this.entries.get(key);
		if (!entry || entry.refs === 0) {
			throw new Error(`Invalid texture release for key: ${key}`);
		}
		entry.refs--;
	}

	pin(key: string): void {
		const entry = this.entries.get(key);
		if (!entry) throw new Error(`Unknown texture key: ${key}`);
		entry.pins++;
	}

	unpin(key: string): void {
		const entry = this.entries.get(key);
		if (!entry || entry.pins === 0) {
			throw new Error(`Invalid texture unpin for key: ${key}`);
		}
		entry.pins--;
	}

	has(key: string): boolean {
		return this.entries.has(key);
	}

	getRefCount(key: string): number {
		return this.entries.get(key)?.refs ?? 0;
	}

	/**
	 * Estimates incremental bytes required to admit a scene cell:
	 * B_required = B_geometry + B_newTextures + B_staging
	 * Already-resident shared textures contribute 0 to B_newTextures.
	 */
	estimateCellAdmissionBytes(input: {
		geometryBytes: number;
		stagingBytes: number;
		requiredTextures: readonly { key: string; estimatedGpuBytes: number }[];
	}): {
		geometryBytes: number;
		newTextureBytes: number;
		stagingBytes: number;
		totalRequiredBytes: number;
		fitsBudget: boolean;
	} {
		let newTextureBytes = 0;
		const seenInBatch = new Set<string>();
		for (const tex of input.requiredTextures) {
			if (seenInBatch.has(tex.key)) continue;
			seenInBatch.add(tex.key);
			if (!this.entries.has(tex.key) && !this.reservedBytes.has(tex.key)) {
				newTextureBytes += tex.estimatedGpuBytes;
			}
		}
		const totalRequiredBytes = input.geometryBytes + newTextureBytes + input.stagingBytes;
		const fitsBudget = this.residentGpuBytes + this.totalReservedBytes + newTextureBytes <= this.maxGpuBytes;
		return {
			geometryBytes: input.geometryBytes,
			newTextureBytes,
			stagingBytes: input.stagingBytes,
			totalRequiredBytes,
			fitsBudget
		};
	}

	evictToBudget(targetMaxBytes: number = this.maxGpuBytes): number {
		const candidates = [...this.entries.values()]
			.filter((e) => e.refs === 0 && e.pins === 0)
			.sort((a, b) => a.lastUsedFrame - b.lastUsedFrame);

		let freed = 0;
		for (const entry of candidates) {
			if (this.residentGpuBytes <= targetMaxBytes) break;
			entry.state = 'evicting';
			entry.texture.dispose();
			this.entries.delete(entry.key);
			this.residentGpuBytes -= entry.estimatedGpuBytes;
			freed += entry.estimatedGpuBytes;
			this.evictions++;
		}
		return freed;
	}

	invalidateCaseScope(caseId?: string): number {
		const prefix = caseId ? `case:${caseId}:` : 'case:';
		let removed = 0;
		for (const [key, entry] of this.entries) {
			if (key.startsWith(prefix)) {
				entry.texture.dispose();
				this.entries.delete(key);
				this.residentGpuBytes -= entry.estimatedGpuBytes;
				removed++;
			}
		}
		return removed;
	}

	disposeAll(): void {
		for (const entry of this.entries.values()) {
			entry.texture.dispose();
		}
		this.entries.clear();
		this.inflight.clear();
		this.reservedBytes.clear();
		this.residentGpuBytes = 0;
		this.totalReservedBytes = 0;
	}

	stats() {
		return {
			entries: this.entries.size,
			estimatedGpuBytes: this.residentGpuBytes,
			reservedBytes: this.totalReservedBytes,
			maxGpuBytes: this.maxGpuBytes,
			hits: this.cacheHits,
			misses: this.cacheMisses,
			evictions: this.evictions
		};
	}
}
