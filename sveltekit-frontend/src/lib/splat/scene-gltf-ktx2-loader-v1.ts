import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { WebGLRenderer } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

export type SceneTextureRendererV1 = WebGLRenderer | WebGPURenderer;

/**
 * Parse a GLB with the installed Three.js Basis transcoder available for
 * KHR_texture_basisu textures. The returned GPU textures remain owned by the
 * parsed scene; only the temporary transcoder workers are disposed here.
 */
export async function parseSceneGltfWithKtx2V1(
	data: ArrayBuffer,
	renderer: SceneTextureRendererV1,
	resourcePath = ''
): Promise<GLTF> {
	const ktx2Loader = new KTX2Loader().setWorkerLimit(2).detectSupport(renderer);
	const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2Loader);

	try {
		return await gltfLoader.parseAsync(data, resourcePath);
	} finally {
		ktx2Loader.dispose();
	}
}
