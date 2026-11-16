import { afterEach, describe, expect, it, vi } from 'vitest';
import { N64TextureLODSystem } from './N64TextureLODSystem.js';

function makeDevice() {
	const created: Array<{ descriptor: unknown; texture: { destroy: ReturnType<typeof vi.fn> } }> = [];
	const writes: unknown[][] = [];
	const device = {
		lost: new Promise(() => undefined),
		createTexture: vi.fn((descriptor: unknown) => {
			const texture = { destroy: vi.fn() };
			created.push({ descriptor, texture });
			return texture;
		}),
		queue: { writeTexture: vi.fn((...args: unknown[]) => writes.push(args)) },
	} as unknown as GPUDevice;
	return { device, created, writes };
}

describe('N64TextureLODSystem', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('uploads selected LOD bytes, reuses a resident request, and releases replaced resources', async () => {
		vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 4, COPY_DST: 2 });
		const { device, created, writes } = makeDevice();
		const system = new N64TextureLODSystem();
		expect(await system.initialize(device)).toBe(true);
		system.registerTexture('evidence:rev-1:frame-0', 'sha256:rev-1', [
			{ level: 0, width: 2, height: 2, format: 'r8uint', data: Uint8Array.of(1, 2, 3, 4).buffer },
			{ level: 1, width: 4, height: 4, format: 'r8uint', data: new Uint8Array(16).buffer },
		]);

		const high = await system.requestTexture('evidence:rev-1:frame-0', 1);
		expect(high).not.toBeNull();
		expect(await system.requestTexture('evidence:rev-1:frame-0', 1)).toBe(high);
		expect(created).toHaveLength(1);
		expect(writes).toHaveLength(1);
		expect(system.getStats()).toMatchObject({ memoryUsed: 16, activeTextures: 1 });

		const low = await system.requestTexture('evidence:rev-1:frame-0', 0);
		expect(low).not.toBe(high);
		expect(created[0]?.texture.destroy).toHaveBeenCalledOnce();
		expect(system.getStats()).toMatchObject({ memoryUsed: 4, activeTextures: 1 });
		system.unregisterTexture('evidence:rev-1:frame-0');
		expect(created[1]?.texture.destroy).toHaveBeenCalledOnce();
		expect(system.getStats()).toMatchObject({ memoryUsed: 0, activeTextures: 0, cacheSize: 0 });
		system.destroy();
	});

	it('evicts least-recently-used GPU textures against the exact byte budget', async () => {
		vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 4, COPY_DST: 2 });
		const { device, created } = makeDevice();
		const system = new N64TextureLODSystem();
		await system.initialize(device);
		const level = { level: 0, width: 2048, height: 2048, format: 'r8uint' as const, data: new Uint8Array(4 * 1024 * 1024).buffer };
		system.registerTexture('revision-a', 'revision-a', [level]);
		system.registerTexture('revision-b', 'revision-b', [level]);
		await system.requestTexture('revision-a', 0);
		await system.requestTexture('revision-b', 0);
		expect(created[0]?.texture.destroy).toHaveBeenCalledOnce();
		expect(system.getStats()).toMatchObject({ memoryUsed: 4 * 1024 * 1024, activeTextures: 1, cacheSize: 2 });
		system.destroy();
	});

	it('rejects malformed and undeclared compressed payloads', () => {
		const system = new N64TextureLODSystem();
		expect(() => system.registerTexture('bad', 'revision', [{ level: 0, width: 2, height: 2, data: new ArrayBuffer(3) }])).toThrow(/byte length/);
		expect(() => system.registerTexture('compressed', 'revision', [{ level: 0, width: 1, height: 1, data: new ArrayBuffer(1), compressed: true }])).toThrow(/decoder/);
	});
});
