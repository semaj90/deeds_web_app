import type { IndexedTexture4BppV1 } from './indexed-palette-texture-v1.js';
import {
	createIndexedPaletteShaderMaterialV1,
	createIndexedPaletteShaderTexturesV1,
	createIndexedPaletteTslMaterialV1,
	type IndexedPaletteShaderTexturesV1
} from './indexed-palette-shader-v1.js';
import {
	selectIndexedPaletteRendererPathV1,
	type IndexedPaletteBackendV1,
	type IndexedPaletteRendererPathV1
} from './indexed-palette-renderer-paths-v1.js';

/**
 * Applies the packed indexed-palette material to every UV-mapped mesh under an imported
 * object (OBJ/FBX/GLB), using the renderer path for the active backend (openspec 11.44.3).
 *
 * One packed index texture and palette are created for the whole object and shared by all
 * materials (the optimization that keeps GPU texel bytes independent of mesh count).
 * The rgbaTexture is the expanded RGBA image used by the compatibility path and as the
 * source map that the shader builders clone from. Original materials are kept for restore().
 */
export interface IndexedPaletteObjectApplicationV1 {
	readonly path: IndexedPaletteRendererPathV1;
	/** Meshes that received the packed or compatibility material. */
	readonly meshCount: number;
	/** Meshes left unchanged: no UVs, or multi-material meshes. */
	readonly skippedMeshCount: number;
	readonly textures: IndexedPaletteShaderTexturesV1 | null;
	restore(): void;
	dispose(): void;
}

export function applyIndexedPaletteToObjectV1(
	three: any,
	root: any,
	indexed: IndexedTexture4BppV1,
	rgbaTexture: any,
	backend: IndexedPaletteBackendV1,
	maxTextureSize = 4096
): IndexedPaletteObjectApplicationV1 {
	if (!root || typeof root.traverse !== 'function') throw new TypeError('INDEXED_PALETTE_OBJECT_ROOT_INVALID');
	if (!rgbaTexture) throw new TypeError('INDEXED_PALETTE_OBJECT_RGBA_TEXTURE_REQUIRED');
	const tslAvailable = Boolean(three?.TSL && three?.MeshStandardNodeMaterial);
	const path = selectIndexedPaletteRendererPathV1(backend, tslAvailable);

	const meshes: any[] = [];
	let skippedMeshCount = 0;
	root.traverse((object: any) => {
		if (!object.isMesh) return;
		if (!object.geometry?.attributes?.uv || Array.isArray(object.material)) {
			skippedMeshCount += 1;
			return;
		}
		meshes.push(object);
	});

	const originals = new Map<any, any>();
	const created: any[] = [];
	const textures = path === 'rgba-compat'
		? null
		: createIndexedPaletteShaderTexturesV1(three, indexed, maxTextureSize);

	for (const mesh of meshes) {
		const original = mesh.material;
		originals.set(mesh, original);
		const source = original?.isMaterial ? original.clone() : new three.MeshStandardMaterial();
		source.map = rgbaTexture;
		source.needsUpdate = true;

		let next: any;
		if (path === 'webgl2-glsl-packed') {
			next = createIndexedPaletteShaderMaterialV1(three, source, indexed, maxTextureSize, textures!).material;
		} else if (path === 'webgpu-tsl-packed') {
			next = createIndexedPaletteTslMaterialV1(three, source, indexed, maxTextureSize, textures!).material;
		} else {
			next = source;
		}
		created.push(next);
		if (next !== source) source.dispose?.();
		mesh.material = next;
	}

	let restored = false;
	let disposed = false;
	return {
		path,
		meshCount: meshes.length,
		skippedMeshCount,
		textures,
		restore() {
			if (restored) return;
			restored = true;
			for (const [mesh, original] of originals) mesh.material = original;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			this.restore();
			for (const material of created) material.dispose?.();
			textures?.dispose();
		}
	};
}
