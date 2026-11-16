import {
	INDEXED_PALETTE16_V1,
	INDEXED_PALETTE_TEXTURE_REVISION_V1,
	type IndexedTexture4BppV1
} from './indexed-palette-texture-v1.js';

export const INDEXED_PALETTE_SHADER_REVISION_V1 = 'atlas-indexed-palette-shader-v1' as const;

export interface IndexedPaletteShaderTexturesV1 {
	readonly packedIndexTexture: any;
	readonly paletteTexture: any;
	readonly packedTextureWidth: number;
	readonly packedTextureHeight: number;
	readonly gpuTexelBytes: number;
	dispose(): void;
}

export interface IndexedPaletteShaderMaterialV1 {
	readonly material: any;
	readonly textures: IndexedPaletteShaderTexturesV1;
}

/**
 * Uploads the existing low-nibble-first 4bpp stream as an R8 texture plus a
 * 16-entry RGBA palette. The byte stream is laid into a bounded 2D texture;
 * the shader reconstructs the original row-major pixel ordinal before nibble
 * selection, so odd image widths retain the codec's cross-row nibble order.
 */
export function createIndexedPaletteShaderTexturesV1(
	three: any,
	indexed: IndexedTexture4BppV1,
	maxTextureSize = 4096
): IndexedPaletteShaderTexturesV1 {
	if (indexed.format !== INDEXED_PALETTE_TEXTURE_REVISION_V1
		|| indexed.paletteRevision !== INDEXED_PALETTE_TEXTURE_REVISION_V1
		|| !Number.isSafeInteger(indexed.width) || indexed.width <= 0
		|| !Number.isSafeInteger(indexed.height) || indexed.height <= 0
		|| indexed.pixelCount !== indexed.width * indexed.height
		|| indexed.packedIndices.byteLength !== Math.ceil(indexed.pixelCount / 2)) {
		throw new RangeError('INDEXED_PALETTE_SHADER_INPUT_INVALID');
	}
	if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1) {
		throw new RangeError('INDEXED_PALETTE_SHADER_MAX_TEXTURE_SIZE_INVALID');
	}
	if (!three?.DataTexture || three.RedFormat === undefined || three.RGBAFormat === undefined) {
		throw new Error('INDEXED_PALETTE_SHADER_THREE_DATA_TEXTURE_UNAVAILABLE');
	}

	const byteCount = indexed.packedIndices.byteLength;
	const packedTextureWidth = Math.max(1, Math.min(maxTextureSize, Math.ceil(Math.sqrt(byteCount))));
	const packedTextureHeight = Math.max(1, Math.ceil(byteCount / packedTextureWidth));
	if (packedTextureHeight > maxTextureSize) {
		throw new RangeError('INDEXED_PALETTE_SHADER_TEXTURE_EXCEEDS_DEVICE_LIMIT');
	}

	const packedBytes = new Uint8Array(packedTextureWidth * packedTextureHeight);
	packedBytes.set(indexed.packedIndices);
	const packedIndexTexture = new three.DataTexture(
		packedBytes,
		packedTextureWidth,
		packedTextureHeight,
		three.RedFormat,
		three.UnsignedByteType
	);
	packedIndexTexture.name = `${INDEXED_PALETTE_SHADER_REVISION_V1} · packed 4bpp indices`;
	packedIndexTexture.colorSpace = three.NoColorSpace;
	packedIndexTexture.flipY = false;
	packedIndexTexture.unpackAlignment = 1;
	packedIndexTexture.magFilter = three.NearestFilter;
	packedIndexTexture.minFilter = three.NearestFilter;
	packedIndexTexture.wrapS = three.ClampToEdgeWrapping;
	packedIndexTexture.wrapT = three.ClampToEdgeWrapping;
	packedIndexTexture.generateMipmaps = false;
	packedIndexTexture.needsUpdate = true;

	const paletteBytes = new Uint8Array(INDEXED_PALETTE16_V1.length * 4);
	for (const entry of INDEXED_PALETTE16_V1) {
		paletteBytes.set(entry.rgba, entry.index * 4);
	}
	const paletteTexture = new three.DataTexture(
		paletteBytes,
		INDEXED_PALETTE16_V1.length,
		1,
		three.RGBAFormat,
		three.UnsignedByteType
	);
	paletteTexture.name = `${INDEXED_PALETTE_SHADER_REVISION_V1} · ${INDEXED_PALETTE_TEXTURE_REVISION_V1}`;
	paletteTexture.colorSpace = three.SRGBColorSpace;
	paletteTexture.magFilter = three.NearestFilter;
	paletteTexture.minFilter = three.NearestFilter;
	paletteTexture.wrapS = three.ClampToEdgeWrapping;
	paletteTexture.wrapT = three.ClampToEdgeWrapping;
	paletteTexture.generateMipmaps = false;
	paletteTexture.needsUpdate = true;

	let disposed = false;
	return {
		packedIndexTexture,
		paletteTexture,
		packedTextureWidth,
		packedTextureHeight,
		gpuTexelBytes: packedBytes.byteLength + paletteBytes.byteLength,
		dispose() {
			if (disposed) return;
			disposed = true;
			packedIndexTexture.dispose();
			paletteTexture.dispose();
		}
	};
}

/**
 * Creates a cloned lit Three.js material whose map fragment samples packed
 * palette indices. Use only with the WebGL2 backend; WebGPU keeps the expanded
 * RGBA compatibility preview until a matching TSL node-material path exists.
 */
export function createIndexedPaletteShaderMaterialV1(
	three: any,
	sourceMaterial: any,
	indexed: IndexedTexture4BppV1,
	maxTextureSize = 4096,
	sharedTextures?: IndexedPaletteShaderTexturesV1
): IndexedPaletteShaderMaterialV1 {
	if (!sourceMaterial?.map) throw new Error('INDEXED_PALETTE_SHADER_REQUIRES_UV_MAPPED_SOURCE_MATERIAL');
	const textures = sharedTextures ?? createIndexedPaletteShaderTexturesV1(three, indexed, maxTextureSize);
	const material = sourceMaterial.clone();
	const priorCompile = material.onBeforeCompile;
	const priorCacheKey = material.customProgramCacheKey?.bind(material) ?? (() => '');

	material.onBeforeCompile = (shader: any, renderer: any) => {
		priorCompile?.call(material, shader, renderer);
		if (!shader.fragmentShader.includes('#include <map_fragment>')) {
			throw new Error('INDEXED_PALETTE_SHADER_MAP_CHUNK_NOT_FOUND');
		}
		shader.uniforms.uAtlasPackedIndices = { value: textures.packedIndexTexture };
		shader.uniforms.uAtlasPalette = { value: textures.paletteTexture };
		shader.uniforms.uAtlasSourceSize = { value: new three.Vector2(indexed.width, indexed.height) };
		shader.uniforms.uAtlasPackedSize = { value: new three.Vector2(textures.packedTextureWidth, textures.packedTextureHeight) };
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <common>',
			`#include <common>\n` +
			'uniform sampler2D uAtlasPackedIndices;\n' +
			'uniform sampler2D uAtlasPalette;\n' +
			'uniform vec2 uAtlasSourceSize;\n' +
			'uniform vec2 uAtlasPackedSize;'
		);
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <map_fragment>',
			`#ifdef USE_MAP
	vec2 atlasPixel = vec2(
		floor(clamp(vMapUv.x, 0.0, 0.999999) * uAtlasSourceSize.x),
		floor(clamp(1.0 - vMapUv.y, 0.0, 0.999999) * uAtlasSourceSize.y)
	);
	float atlasPixelOrdinal = atlasPixel.y * uAtlasSourceSize.x + atlasPixel.x;
	float atlasByteOrdinal = floor(atlasPixelOrdinal * 0.5);
	vec2 atlasByteCoordinate = vec2(
		mod(atlasByteOrdinal, uAtlasPackedSize.x),
		floor(atlasByteOrdinal / uAtlasPackedSize.x)
	);
	vec2 atlasByteUv = vec2(
		(atlasByteCoordinate.x + 0.5) / uAtlasPackedSize.x,
		(atlasByteCoordinate.y + 0.5) / uAtlasPackedSize.y
	);
	float atlasPackedByte = floor(texture2D(uAtlasPackedIndices, atlasByteUv).r * 255.0 + 0.5);
	float atlasPaletteIndex = mod(atlasPixelOrdinal, 2.0) < 1.0
		? mod(atlasPackedByte, 16.0)
		: floor(atlasPackedByte / 16.0);
	vec4 sampledDiffuseColor = texture2D(uAtlasPalette, vec2((atlasPaletteIndex + 0.5) / 16.0, 0.5));
	diffuseColor *= sampledDiffuseColor;
#endif`
		);
	};
	material.customProgramCacheKey = () => `${priorCacheKey()}|${INDEXED_PALETTE_SHADER_REVISION_V1}|${indexed.format}|${indexed.paletteRevision}`;
	material.name = `${sourceMaterial.name || 'Material'} · ${INDEXED_PALETTE_SHADER_REVISION_V1}`;
	material.userData = {
		...material.userData,
		atlasIndexedPaletteShaderRevision: INDEXED_PALETTE_SHADER_REVISION_V1,
		atlasIndexedPaletteFormat: indexed.format,
		atlasIndexedPaletteRevision: indexed.paletteRevision
	};
	material.needsUpdate = true;
	return { material, textures };
}

export interface IndexedPaletteTslMaterialV1 {
	readonly material: any;
	readonly textures: IndexedPaletteShaderTexturesV1;
}

/**
 * WebGPU path: the same packed R8 index texture and 16-entry palette as the GLSL path,
 * decoded with a TSL node graph on a MeshStandardNodeMaterial. Requires the
 * `three/webgpu` namespace (`three.TSL`, `three.MeshStandardNodeMaterial`).
 * The index formula mirrors GLSL line-for-line: clamp(uv) * source size, row-major
 * ordinal, byte = ordinal / 2, even ordinal = low nibble.
 */
export function createIndexedPaletteTslMaterialV1(
	three: any,
	sourceMaterial: any,
	indexed: IndexedTexture4BppV1,
	maxTextureSize = 4096,
	sharedTextures?: IndexedPaletteShaderTexturesV1
): IndexedPaletteTslMaterialV1 {
	if (!sourceMaterial?.map) throw new Error('INDEXED_PALETTE_TSL_REQUIRES_UV_MAPPED_SOURCE_MATERIAL');
	const tsl = three?.TSL;
	if (!tsl || !three.MeshStandardNodeMaterial) throw new Error('INDEXED_PALETTE_TSL_UNAVAILABLE');
	const textures = sharedTextures ?? createIndexedPaletteShaderTexturesV1(three, indexed, maxTextureSize);
	const { texture, uv, uniform, vec2, vec3, float, select, mod, floor, clamp } = tsl;

	const sourceSize = uniform(new three.Vector2(indexed.width, indexed.height));
	const packedSize = uniform(new three.Vector2(textures.packedTextureWidth, textures.packedTextureHeight));
	const packedTexture = texture(textures.packedIndexTexture);
	const paletteTexture = texture(textures.paletteTexture);

	const coord = uv();
	const pixelX = floor(clamp(coord.x, float(0), float(0.999999)).mul(sourceSize.x));
	const pixelY = floor(clamp(float(1).sub(coord.y), float(0), float(0.999999)).mul(sourceSize.y));
	const ordinal = pixelY.mul(sourceSize.x).add(pixelX);
	const byteOrdinal = floor(ordinal.mul(0.5));
	const byteU = mod(byteOrdinal, packedSize.x).add(0.5).div(packedSize.x);
	const byteV = floor(byteOrdinal.div(packedSize.x)).add(0.5).div(packedSize.y);
	const packedByte = floor(packedTexture.sample(vec2(byteU, byteV)).r.mul(255).add(0.5));
	const paletteIndex = select(
		mod(ordinal, 2).lessThan(1),
		mod(packedByte, 16),
		floor(packedByte.div(16))
	);
	const paletteColor = paletteTexture.sample(vec2(paletteIndex.add(0.5).div(16), 0.5));

	const material = new three.MeshStandardNodeMaterial();
	material.colorNode = paletteColor.rgb.mul(vec3(sourceMaterial.color.r, sourceMaterial.color.g, sourceMaterial.color.b));
	// Phong sources (the OBJ loader default) have no roughness/metalness; copying undefined renders black.
	material.roughness = Number.isFinite(sourceMaterial.roughness) ? sourceMaterial.roughness : 0.85;
	material.metalness = Number.isFinite(sourceMaterial.metalness) ? sourceMaterial.metalness : 0;
	material.side = sourceMaterial.side ?? 0;
	material.transparent = Boolean(sourceMaterial.transparent);
	material.opacity = Number.isFinite(sourceMaterial.opacity) ? sourceMaterial.opacity : 1;
	material.name = `${sourceMaterial.name || 'Material'} · ${INDEXED_PALETTE_SHADER_REVISION_V1} · TSL`;
	material.userData = {
		...(sourceMaterial.userData ?? {}),
		atlasIndexedPaletteShaderRevision: INDEXED_PALETTE_SHADER_REVISION_V1,
		atlasIndexedPaletteFormat: indexed.format,
		atlasIndexedPaletteRevision: indexed.paletteRevision,
		atlasIndexedPaletteRendererPath: 'webgpu-tsl-packed'
	};
	material.needsUpdate = true;
	return { material, textures };
}
