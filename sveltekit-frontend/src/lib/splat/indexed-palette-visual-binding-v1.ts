import { z } from 'zod';
import {
	applyIndexedPaletteToObjectV1,
	type IndexedPaletteObjectApplicationV1,
} from './indexed-palette-object-v1.js';
import type { IndexedPaletteBackendV1 } from './indexed-palette-renderer-paths-v1.js';
import { INDEXED_PALETTE_TEXTURE_REVISION_V1, type IndexedTexture4BppV1 } from './indexed-palette-texture-v1.js';
import { scenePaletteArtifactSchemaV1, fetchScenePalettePreviewV1 } from './indexed-palette-artifact-v1.js';
import { mode7UvAffineV1Schema, parseMode7UvAffineV1 } from './mode7-uv-affine-v1.js';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sameOriginApiPath = z.string().min(1).max(512).refine((value) => {
	if (!value.startsWith('/api/') || value.startsWith('//') || value.includes('\\') || value.includes('\0')) return false;
	return value.split('/').every((segment) => segment !== '..' && segment !== '.');
}, 'PALETTE_ASSET_URL_MUST_BE_SAME_ORIGIN_API_PATH');

/**
 * Read-only sidecar joining a stable scene object to an immutable palette asset.
 * Candidate-ordinal bitsets are intentionally not embedded here: they filter
 * retrieval candidates and are not per-pixel alpha masks.
 */
export const indexedPaletteVisualBindingV1Schema = z.object({
	schema: z.literal('atlas.indexed-palette-visual-binding.v1'),
	caseId: z.string().min(1).max(128),
	sceneId: z.string().min(1).max(128),
	sceneRevision: z.number().int().positive().safe(),
	objectId: z.string().min(1).max(128),
	sourceRevision: digest,
	paletteAssetId: z.string().min(1).max(128),
	paletteUrl: sameOriginApiPath,
	paletteArtifact: scenePaletteArtifactSchemaV1,
	coordinateSpace: z.literal('NORMALIZED_UV'),
	uvAffine: mode7UvAffineV1Schema,
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
}).strict();

export type IndexedPaletteVisualBindingV1 = z.infer<typeof indexedPaletteVisualBindingV1Schema>;

export interface IndexedPaletteVisualScopeV1 {
	caseId: string;
	sceneId: string;
	sceneRevision: number;
	objectId: string;
	sourceRevision: string;
}

export interface LoadedIndexedPaletteVisualBindingV1 {
	binding: IndexedPaletteVisualBindingV1;
	texture: IndexedTexture4BppV1;
}

/**
 * Validates scope before fetching; the API endpoint must still authorize every
 * request. The response bytes are size- and SHA-256-verified by the existing
 * palette artifact loader before returning the indexed texture.
 */
export async function fetchIndexedPaletteVisualBindingV1(
	input: unknown,
	expected: IndexedPaletteVisualScopeV1,
	signal: AbortSignal,
): Promise<LoadedIndexedPaletteVisualBindingV1> {
	const binding = indexedPaletteVisualBindingV1Schema.parse(input);
	for (const key of ['caseId', 'sceneId', 'sceneRevision', 'objectId', 'sourceRevision'] as const) {
		if (binding[key] !== expected[key]) throw new Error(`PALETTE_VISUAL_BINDING_SCOPE_MISMATCH:${key}`);
	}
	const texture = await fetchScenePalettePreviewV1({
		url: binding.paletteUrl,
		sourceRevision: binding.sourceRevision,
		artifact: binding.paletteArtifact,
	}, signal);
	return { binding, texture };
}

/** Applies the existing renderer adapter with the binding's UV transform. */
export function applyBoundIndexedPaletteToObjectV1(
	three: any,
	root: any,
	rgbaTexture: any,
	backend: IndexedPaletteBackendV1,
	loaded: LoadedIndexedPaletteVisualBindingV1,
	maxTextureSize = 4096,
): IndexedPaletteObjectApplicationV1 {
	const binding = indexedPaletteVisualBindingV1Schema.parse(loaded.binding);
	if (loaded.texture.format !== INDEXED_PALETTE_TEXTURE_REVISION_V1
		|| loaded.texture.paletteRevision !== INDEXED_PALETTE_TEXTURE_REVISION_V1
		|| loaded.texture.width !== binding.paletteArtifact.width
		|| loaded.texture.height !== binding.paletteArtifact.height
		|| loaded.texture.packedIndices.byteLength !== binding.paletteArtifact.byteLength) {
		throw new Error('PALETTE_VISUAL_BINDING_TEXTURE_MISMATCH');
	}
	return applyIndexedPaletteToObjectV1(
		three, root, loaded.texture, rgbaTexture, backend, maxTextureSize,
		parseMode7UvAffineV1(binding.uvAffine),
	);
}
