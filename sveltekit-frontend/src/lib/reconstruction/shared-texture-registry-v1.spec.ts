import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
	SharedTextureRegistryV1,
	MEMORY_BUDGET_PROFILES_V1,
	buildSharedTextureCacheKeyV1
} from './shared-texture-registry-v1.js';

describe('SharedTextureRegistryV1 & Byte-Budgeted Admission (MEM-01 / MEM-02 / MEM-07)', () => {
	it('shares ONE GPU texture across a 4-bedroom house (100 walls) and an urban scene without duplication or premature disposal', () => {
		const registry = new SharedTextureRegistryV1(MEMORY_BUDGET_PROFILES_V1.retro.maxGpuTextureBytes);
		const plasterKey = buildSharedTextureCacheKeyV1({
			securityScope: 'public-template',
			codec: 'palette-r8',
			formatVersion: 1,
			lod: 0,
			pageId: 7,
			sha256: 'a'.repeat(64)
		});

		const factory = vi.fn(() => {
			const tex = new THREE.DataTexture(new Uint8Array(64 * 64), 64, 64);
			tex.dispose = vi.fn();
			return tex;
		});

		// 1. Open 4-bedroom house (100 plaster walls acquire the same texture)
		const houseRefs: THREE.Texture[] = [];
		for (let i = 0; i < 100; i++) {
			houseRefs.push(registry.acquire(plasterKey, factory, 16_384, 1));
		}
		expect(factory).toHaveBeenCalledTimes(1); // Only 1 GPU texture created!
		expect(registry.getRefCount(plasterKey)).toBe(100);
		expect(registry.stats().estimatedGpuBytes).toBe(16_384);

		// 2. Open urban scene simultaneously referencing the same plaster texture
		const urbanTex = registry.acquire(plasterKey, factory, 16_384, 2);
		expect(urbanTex).toBe(houseRefs[0]);
		expect(factory).toHaveBeenCalledTimes(1);
		expect(registry.getRefCount(plasterKey)).toBe(101);

		// 3. Incremental cell admission charges 0 for already-resident shared texture
		const admission = registry.estimateCellAdmissionBytes({
			geometryBytes: 4096,
			stagingBytes: 2048,
			requiredTextures: [{ key: plasterKey, estimatedGpuBytes: 16_384 }]
		});
		expect(admission.newTextureBytes).toBe(0);
		expect(admission.totalRequiredBytes).toBe(6144);
		expect(admission.fitsBudget).toBe(true);

		// 4. Unload the 4-bedroom house (release all 100 house refs) -> urban scene still keeps texture resident!
		for (let i = 0; i < 100; i++) {
			registry.release(plasterKey);
		}
		expect(registry.getRefCount(plasterKey)).toBe(1);
		expect(registry.evictToBudget(0)).toBe(0); // Cannot evict while urban scene holds 1 ref
		expect(registry.has(plasterKey)).toBe(true);

		// 5. Release final urban ref -> eligible for LRU eviction
		registry.release(plasterKey);
		expect(registry.evictToBudget(0)).toBe(16_384);
		expect(registry.has(plasterKey)).toBe(false);
		expect(urbanTex.dispose).toHaveBeenCalledTimes(1);
	});

	it('deduplicates concurrent acquireAsync calls into a single flight and tracks pins', async () => {
		const registry = new SharedTextureRegistryV1(1024 * 1024);
		const loader = vi.fn(async () => {
			const tex = new THREE.DataTexture(new Uint8Array(16), 2, 2);
			tex.dispose = vi.fn();
			return tex;
		});

		const [t1, t2] = await Promise.all([
			registry.acquireAsync('case:c1:rgba8:v1:lod0:p1:' + 'b'.repeat(64), loader, 4096, 10, 'case:c1'),
			registry.acquireAsync('case:c1:rgba8:v1:lod0:p1:' + 'b'.repeat(64), loader, 4096, 10, 'case:c1')
		]);

		expect(loader).toHaveBeenCalledTimes(1);
		expect(t1).toBe(t2);
		expect(registry.getRefCount('case:c1:rgba8:v1:lod0:p1:' + 'b'.repeat(64))).toBe(2);

		// Case scope invalidation clears private assets immediately
		expect(registry.invalidateCaseScope('c1')).toBe(1);
		expect(t1.dispose).toHaveBeenCalledTimes(1);
	});
});
