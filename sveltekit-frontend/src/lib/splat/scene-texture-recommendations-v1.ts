export const SCENE_TEXTURE_RECOMMENDATIONS_REVISION_V1 = 'atlas.scene-texture-recommendations.v1' as const;

export interface SceneTextureRecommendationInputV1 {
	assetName: string;
	assetFormat: string | null;
	assetBytes: number;
	meshCount: number;
	vertexCount: number;
	triangleCount: number;
	uvChannelCount: number;
	textureCount: number;
	textureWidth: number | null;
	textureHeight: number | null;
	indexedPreviewEnabled: boolean;
	packedTextureBytes: number;
	backend: 'webgpu' | 'webgl2' | 'unknown' | null;
	caseLinked: boolean;
}

export interface SceneTextureRecommendationV1 {
	id: string;
	title: string;
	detail: string;
	evidence: string;
	state: 'review' | 'available' | 'pending';
}

/** Deterministic UI guidance from inspected local scene facts; not AI findings. */
export function buildSceneTextureRecommendationsV1(
	input: SceneTextureRecommendationInputV1,
	limit = 4
): SceneTextureRecommendationV1[] {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4) {
		throw new RangeError('SCENE_TEXTURE_RECOMMENDATION_LIMIT_MUST_BE_1_TO_4');
	}
	const recommendations: SceneTextureRecommendationV1[] = [];
	const imageRelief = input.assetFormat?.startsWith('IMAGE_') ?? false;
	const uvMissing = input.uvChannelCount === 0;

	if (imageRelief) {
		recommendations.push({
			id: 'review-image-relief-hypothesis',
			title: 'Review image-derived geometry',
			detail: 'This 2.5D relief is a visual hypothesis derived from one image; it does not establish hidden depth or scene facts.',
			evidence: `${input.assetName} · ${input.vertexCount.toLocaleString()} vertices · ${input.triangleCount.toLocaleString()} triangles`,
			state: 'review'
		});
	}

	if (uvMissing || input.textureCount === 0) {
		recommendations.push({
			id: 'inspect-uv-material-binding',
			title: 'Check UV and material binding',
			detail: uvMissing
				? 'No UV channel was detected, so a palette texture cannot be mapped reliably to this mesh.'
				: 'No source texture is attached. For OBJ, the current importer does not load companion MTL or image files.',
			evidence: `${input.uvChannelCount} UV channels · ${input.textureCount} textures`,
			state: 'review'
		});
	} else if (input.textureWidth && input.textureHeight) {
		const tilesX = Math.ceil(input.textureWidth / 8);
		const tilesY = Math.ceil(input.textureHeight / 8);
		recommendations.push({
			id: 'inspect-texture-tile-metadata',
			title: 'Prepare 8×8 tile metadata',
			detail: 'Tile summaries and vertex-to-UV bindings are not persisted yet. Keep palette indices separate from evidence labels and semantic centroids.',
			evidence: `${input.textureWidth}×${input.textureHeight} texture · ${tilesX}×${tilesY} = ${tilesX * tilesY} tiles`,
			state: 'pending'
		});
	}

	if (input.indexedPreviewEnabled) {
		recommendations.push({
			id: 'review-indexed-palette-preview',
			title: 'Review indexed-palette preview',
			detail: input.backend === 'webgl2'
				? 'WebGL2 samples the packed 4bpp stream; this is still a local preview and is not stored as an artifact.'
				: 'This backend displays the expanded RGBA fallback; the packed bytes are not being streamed to the GPU shader.',
			evidence: `${input.packedTextureBytes.toLocaleString()} packed bytes · ${input.backend ?? 'backend pending'}`,
			state: 'available'
		});
	} else if (input.textureCount > 0) {
		recommendations.push({
			id: 'preview-indexed-palette',
			title: 'Preview 16-color palette mapping',
			detail: 'The local 4bpp preview can compare palette appearance. It does not alter the original texture or create a storage URL.',
			evidence: `${input.textureCount} attached textures · palette revision atlas-indexed-palette16-v1`,
			state: 'available'
		});
	}
	if (input.textureCount > 0 && (!input.textureWidth || !input.textureHeight)) {
		recommendations.push({
			id: 'measure-texture-tiles',
			title: 'Measure texture tile dimensions',
			detail: 'The texture is attached, but this viewer has not captured its dimensions for a bounded 8×8 tile manifest.',
			evidence: `${input.textureCount} attached texture(s) · dimensions unavailable`,
			state: 'pending'
		});
	}

	if (!input.caseLinked) {
		recommendations.push({
			id: 'keep-asset-local-until-admitted',
			title: 'Keep this asset local until case admission',
			detail: 'No case-scoped artifact URL is assigned in this preflight view. Use the existing authorized scene-asset route when saving a reviewed GLB.',
			evidence: `${input.assetBytes.toLocaleString()} source bytes · no artifact write from this view`,
			state: 'pending'
		});
	} else if (input.triangleCount > 100_000) {
		recommendations.push({
			id: 'review-mesh-budget',
			title: 'Review mesh size before saving',
			detail: 'The mesh exceeds the local preview triangle budget; consider a reviewed lower-detail proxy before case admission.',
			evidence: `${input.triangleCount.toLocaleString()} triangles · local limit 100,000`,
			state: 'review'
		});
	}
	if (recommendations.length === 0) {
		recommendations.push({
			id: 'review-source-bound-enrichment',
			title: 'Keep enrichment source-bound',
			detail: 'Any future visual-AI note should cite the admitted source revision and reviewed frame or surface inputs.',
			evidence: `${input.meshCount} meshes · ${input.uvChannelCount} UV channels · ${input.textureCount} textures`,
			state: 'pending'
		});
	}

	return recommendations.slice(0, limit);
}
