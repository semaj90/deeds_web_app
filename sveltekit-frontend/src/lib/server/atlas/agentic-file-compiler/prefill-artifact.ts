import { sha256Stable } from './contracts.js';
export interface PrefillIdentityInput { contextManifestChecksum: string; promptPlanChecksum: string; modelRevision: string; adapterRevision?: string | null; tokenizerRevision: string; promptTemplateRevision: string; toolSchemaRevision: string; evidenceRevisions: string[]; }
export function buildCompiledArtifactCacheKey(input: PrefillIdentityInput): string {
  return sha256Stable({ ...input, adapterRevision: input.adapterRevision ?? null, evidenceRevisions: [...new Set(input.evidenceRevisions)].sort() });
}
export interface PrefillArtifactV1 extends PrefillIdentityInput { schema: 'atlas.prefill-artifact.v1'; artifactId: string; tokenCount: number; cacheKey: string; storage: 'NONE' | 'RAM' | 'NVME' | 'GPU'; runtimeArtifactRef?: string | null; producerRevision: string; }
export function buildPrefillArtifact(input: Omit<PrefillArtifactV1, 'schema' | 'cacheKey'>): PrefillArtifactV1 {
  return { schema: 'atlas.prefill-artifact.v1', ...input, evidenceRevisions: [...new Set(input.evidenceRevisions)].sort(), tokenCount: Math.max(0, input.tokenCount), cacheKey: buildCompiledArtifactCacheKey(input) };
}
