import { z } from 'zod';
import { canonicalPacketHash, sortedUnique } from './canonical-packet-hash.js';
import { ArtifactRefSchema, RevisionFenceSchema, buildPrefillReceipt, type ArtifactRefV1, type PrefillReceiptV1 } from './smart-packet-fabric.js';

export const ATLAS_COMPILED_CONTEXT_MANIFEST_SCHEMA = 'atlas.compiled-context-manifest.v1' as const;

export const CompiledContextManifestSchema = z.object({
	schema: z.literal(ATLAS_COMPILED_CONTEXT_MANIFEST_SCHEMA),
	contextManifestId: z.string().min(1),
	requestId: z.string().min(1),
	revisions: RevisionFenceSchema,
	queryDigest: z.string().min(1),
	laneOrder: z.array(z.enum(['lexical', 'semantic', 'ast', 'graph', 'hypergraph'])).min(1),
	candidateOrdinals: z.array(z.number().int().nonnegative()).default([]),
	selectedCanonicalIds: z.array(z.string().min(1)).default([]),
	promotedArtifacts: z.array(ArtifactRefSchema).default([]),
	budgets: z.object({
		maxTokens: z.number().int().nonnegative(),
		maxCandidates: z.number().int().nonnegative(),
		maxGraphHops: z.number().int().nonnegative(),
		maxHyperedges: z.number().int().nonnegative(),
		maxToolCalls: z.number().int().nonnegative(),
		maxVramBytes: z.number().int().nonnegative().optional(),
	}).strict(),
	instructionRefs: z.array(z.string().min(1)).default([]),
	producerRevision: z.string().min(1),
	checksum: z.string().min(1),
}).strict();
export type CompiledContextManifestV1 = z.infer<typeof CompiledContextManifestSchema>;

function artifactSortKey(value: ArtifactRefV1): string {
	return `${value.kind}\u0000${value.artifactId}\u0000${value.checksum}`;
}

export function buildCompiledContextManifest(
	input: Omit<CompiledContextManifestV1, 'schema' | 'checksum'>,
): CompiledContextManifestV1 {
	const promotedArtifacts = input.promotedArtifacts
		.map((artifact) => ArtifactRefSchema.parse(artifact))
		.sort((a, b) => artifactSortKey(a).localeCompare(artifactSortKey(b)));
	const value = {
		schema: ATLAS_COMPILED_CONTEXT_MANIFEST_SCHEMA,
		...input,
		candidateOrdinals: [...new Set(input.candidateOrdinals)].sort((a, b) => a - b),
		selectedCanonicalIds: sortedUnique(input.selectedCanonicalIds),
		instructionRefs: sortedUnique(input.instructionRefs),
		promotedArtifacts,
	};
	return CompiledContextManifestSchema.parse({ ...value, checksum: canonicalPacketHash(value) });
}

export interface CompilePrefillReceiptInput {
	prefillReceiptId: string;
	manifest: CompiledContextManifestV1;
	promptPlanChecksum: string;
	modelRevision: string;
	adapterRevision?: string | null;
	promptTemplateRevision: string;
	tokenizerRevision: string;
	toolSchemaRevision: string;
	producerRevision: string;
}

export function compilePrefillReceipt(input: CompilePrefillReceiptInput): PrefillReceiptV1 {
	const manifest = CompiledContextManifestSchema.parse(input.manifest);
	const evidenceRevisions = sortedUnique(manifest.promotedArtifacts.flatMap((artifact) => [
		artifact.revisions.workspaceRevision,
		artifact.revisions.sourceRevision,
		artifact.revisions.graphRevision,
		artifact.revisions.representationRevision,
		artifact.revisions.featureRevision,
	].filter((value): value is string => Boolean(value))));
	const tensorArtifactRefs = manifest.promotedArtifacts.filter((artifact) => artifact.kind === 'tensor-tile').map((artifact) => artifact.artifactId);
	return buildPrefillReceipt({
		prefillReceiptId: input.prefillReceiptId,
		contextManifestChecksum: manifest.checksum,
		promptPlanChecksum: input.promptPlanChecksum,
		modelRevision: input.modelRevision,
		adapterRevision: input.adapterRevision ?? null,
		promptTemplateRevision: input.promptTemplateRevision,
		tokenizerRevision: input.tokenizerRevision,
		toolSchemaRevision: input.toolSchemaRevision,
		evidenceRevisions,
		tensorArtifactRefs,
		instructionRefs: manifest.instructionRefs,
		producerRevision: input.producerRevision,
	});
}
