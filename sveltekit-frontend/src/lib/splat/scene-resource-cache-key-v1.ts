import { z } from 'zod';

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/i);

const sceneResourceCacheIdentityV1Schema = z.object({
	authorizationScopeId: z.string().trim().min(1).max(128),
	caseId: uuid,
	sceneId: uuid,
	sceneRevision: z.number().int().positive(),
	sourceBinding: z.object({ evidenceId: uuid, sourceRevision }).strict().nullable(),
	assetSha256: sha256,
	assetFormat: z.enum(['GLB', 'SOG', 'KTX2']),
	resourceKind: z.enum(['geometry', 'material', 'texture', 'splat']),
	lodTier: z.enum(['retro', 'balanced', 'detailed']),
	codecRevision: z.string().trim().min(1).max(128),
	materialRevision: z.string().trim().min(1).max(128),
	rendererBackend: z.enum(['webgl2', 'webgpu'])
}).strict();

export type SceneResourceCacheIdentityV1 = z.infer<typeof sceneResourceCacheIdentityV1Schema>;

/**
 * Builds a deterministic, authorization-scoped cache key for disposable browser
 * render resources. This key partitions a cache; it does not authorize access.
 * Callers must fetch through the authorized case route before using a resource.
 */
export function sceneResourceCacheKeyV1(input: SceneResourceCacheIdentityV1): string {
	const identity = sceneResourceCacheIdentityV1Schema.parse(input);
	return `atlas-scene-resource:v1:${JSON.stringify([
		identity.authorizationScopeId,
		identity.caseId.toLowerCase(),
		identity.sceneId.toLowerCase(),
		identity.sceneRevision,
		identity.sourceBinding
			? [identity.sourceBinding.evidenceId.toLowerCase(), identity.sourceBinding.sourceRevision.toLowerCase()]
			: null,
		identity.assetSha256.toLowerCase(),
		identity.assetFormat,
		identity.resourceKind,
		identity.lodTier,
		identity.codecRevision,
		identity.materialRevision,
		identity.rendererBackend
	])}`;
}
