/**
 * N64-Style 4KB Texture LOD Swapping System
 * Implements aggressive texture streaming with 4KB pages like Nintendo 64
 */

import { decideTextureLodSwap } from '../client/atlas/visualization/texture-lod-residency-v1.js';
import { createRgba8TextureLayout, stageRgba8Rows } from '../client/atlas/visualization/texture-layout-v1.js';

interface LODLevel {
    level: number;
    width: number;
    height: number;
    data: ArrayBuffer;
    compressed: boolean;
    sizeKB: number;
}

interface TextureAsset {
    id: string;
    basePath: string;
    lodLevels: LODLevel[];
    currentLOD: number;
    priority: number;
    lastAccessed: number;
    gpuTexture?: GPUTexture;
}

export class N64TextureLODSystem {
    private device: GPUDevice | null = null;
    private textureCache = new Map<string, TextureAsset>();
    private activeTextures = new Map<string, GPUTexture>();
    private lodSwapQueue: Array<{ id: string; targetLOD: number }> = [];

    // N64-style constraints
    private readonly TEXTURE_CACHE_SIZE = 4 * 1024 * 1024; // 4MB total
    private readonly PAGE_SIZE = 4 * 1024; // 4KB pages
    private readonly MAX_ACTIVE_TEXTURES = 32; // N64 texture limit
    private readonly TMEM_SIZE = 4 * 1024; // 4KB Texture Memory

    private currentMemoryUsage = 0;
    private swapBuffer: ArrayBuffer;
    private isInitialized = false;

    constructor() {
        this.swapBuffer = new ArrayBuffer(this.PAGE_SIZE);
    }

    async initialize(): Promise<boolean> {
        try {
            if (!navigator.gpu) {
                console.warn('WebGPU not available');
                return false;
            }

            const adapter = await (navigator.gpu as GPU).requestAdapter({
                powerPreference: 'high-performance'
            });

            if (!adapter) return false;

            this.device = await adapter.requestDevice({
                requiredLimits: {
                    maxBufferSize: this.TEXTURE_CACHE_SIZE,
                    maxTextureDimension2D: 4096,
                    maxTextureArrayLayers: 256
                }
            });

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize N64 LOD system:', error);
            return false;
        }
    }

    /**
     * Register a texture asset with LOD levels
     */
    registerTexture(id: string, basePath: string, lodLevels: LODLevel[]): void {
        this.textureCache.set(id, {
            id,
            basePath,
            lodLevels,
            currentLOD: lodLevels.length - 1, // Start at lowest LOD
            priority: 0,
            lastAccessed: Date.now()
        });
    }

    /**
     * Request a texture at a specific LOD level
     */
    async requestTexture(id: string, targetLOD: number): Promise<GPUTexture | null> {
        const asset = this.textureCache.get(id);
        if (!asset) return null;

        const currentLevel = asset.lodLevels[asset.currentLOD];
        const currentBytes = currentLevel?.data.byteLength ?? 0;
        const targetLevel = asset.lodLevels[targetLOD];
        const decision = decideTextureLodSwap({
            currentLod: asset.currentLOD,
            targetLod: targetLOD,
            availableLodCount: asset.lodLevels.length,
            requiredBytes: targetLevel?.data.byteLength ?? 0,
            usedBytes: Math.max(0, this.currentMemoryUsage - currentBytes),
            budgetBytes: this.TEXTURE_CACHE_SIZE,
        });
        if (decision.accepted === false && decision.reason !== 'ALREADY_RESIDENT') return null;

        asset.lastAccessed = Date.now();
        asset.priority++;

        if (asset.currentLOD === targetLOD && asset.gpuTexture) {
            return asset.gpuTexture;
        }

        // Queue LOD swap
        if (targetLOD !== asset.currentLOD) {
            this.lodSwapQueue.push({ id, targetLOD });
            await this.processSwapQueue();
        }

        return asset.gpuTexture ?? null;
    }

    /**
     * Process pending LOD swap requests
     */
    private async processSwapQueue(): Promise<void> {
        if (!this.device || this.lodSwapQueue.length === 0) return;

        while (this.lodSwapQueue.length > 0) {
            const request = this.lodSwapQueue.shift();
            if (!request) continue;
            const { id, targetLOD } = request;

            const asset = this.textureCache.get(id);
            if (!asset) continue;

            // The queue is state-safe, but currentLOD changes only after actual
            // GPU materialization succeeds. This scaffold intentionally leaves
            // the resident state unchanged until that owner exists.

            // Evict if at texture limit
            if (this.activeTextures.size >= this.MAX_ACTIVE_TEXTURES) {
                this.evictLeastUsed();
            }

            await this.materializeLod(asset, targetLOD);
        }
    }

    private async materializeLod(asset: TextureAsset, targetLOD: number): Promise<void> {
        if (!this.device) return;
        const lodLevel = asset.lodLevels[targetLOD];
        if (!lodLevel || lodLevel.compressed) return;

        const currentLevel = asset.lodLevels[asset.currentLOD];
        const currentBytes = currentLevel?.data.byteLength ?? 0;
        const decision = decideTextureLodSwap({
            currentLod: asset.currentLOD,
            targetLod: targetLOD,
            availableLodCount: asset.lodLevels.length,
            requiredBytes: lodLevel.data.byteLength,
            usedBytes: Math.max(0, this.currentMemoryUsage - currentBytes),
            budgetBytes: this.TEXTURE_CACHE_SIZE,
        });
        if (decision.accepted === false) return;

        const layout = createRgba8TextureLayout({ width: lodLevel.width, height: lodLevel.height, lod: targetLOD });
        const staged = stageRgba8Rows(layout, new Uint8Array(lodLevel.data));
        const texture = this.device.createTexture({
            size: { width: lodLevel.width, height: lodLevel.height },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.device.queue.writeTexture(
            { texture },
            staged,
            { bytesPerRow: layout.bytesPerRow, rowsPerImage: layout.height },
            { width: lodLevel.width, height: lodLevel.height },
        );

        if (asset.gpuTexture) {
            asset.gpuTexture.destroy();
            this.activeTextures.delete(asset.id);
            this.currentMemoryUsage = Math.max(0, this.currentMemoryUsage - currentBytes);
        }
        asset.gpuTexture = texture;
        asset.currentLOD = targetLOD;
        this.activeTextures.set(asset.id, texture);
        this.currentMemoryUsage += lodLevel.data.byteLength;
    }

    /**
     * Evict the least recently used texture
     */
    private evictLeastUsed(): void {
        let oldest: TextureAsset | null = null;
        let oldestTime = Infinity;

        for (const asset of this.textureCache.values()) {
            if (asset.gpuTexture && asset.lastAccessed < oldestTime) {
                oldest = asset;
                oldestTime = asset.lastAccessed;
            }
        }

        if (oldest) {
            if (oldest.gpuTexture) {
                oldest.gpuTexture.destroy();
                this.activeTextures.delete(oldest.id);
                const lodLevel = oldest.lodLevels[oldest.currentLOD];
                if (lodLevel) {
                    // Admission and upload use the actual RGBA byte payload;
                    // do not mix it with a potentially stale display estimate.
                    this.currentMemoryUsage = Math.max(
                        0,
                        this.currentMemoryUsage - lodLevel.data.byteLength,
                    );
                }
            }
            oldest.gpuTexture = undefined;
        }
    }

    /**
     * Get current memory usage statistics
     */
    getStats(): {
        memoryUsed: number;
        memoryTotal: number;
        activeTextures: number;
        maxTextures: number;
        cacheSize: number;
        initialized: boolean;
    } {
        return {
            memoryUsed: this.currentMemoryUsage,
            memoryTotal: this.TEXTURE_CACHE_SIZE,
            activeTextures: this.activeTextures.size,
            maxTextures: this.MAX_ACTIVE_TEXTURES,
            cacheSize: this.textureCache.size,
            initialized: this.isInitialized
        };
    }

    /**
     * Destroy all textures and release GPU resources
     */
    destroy(): void {
        for (const texture of this.activeTextures.values()) {
            texture.destroy();
        }
        this.activeTextures.clear();
        this.textureCache.clear();
        this.currentMemoryUsage = 0;
        this.isInitialized = false;
    }
}

// Export singleton instance
export const n64TextureLOD = new N64TextureLODSystem();
