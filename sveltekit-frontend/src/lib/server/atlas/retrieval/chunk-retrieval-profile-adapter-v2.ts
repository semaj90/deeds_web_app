import { z } from 'zod';
import {
  CHUNK_RETRIEVAL_PROFILE_V2,
  createChunkRetrievalProfileV2,
  type ChunkRetrievalProfileV2,
} from './chunk-retrieval-profile-v2.js';
import {
  ChunkRetrievalLexicalStructuralInputV1Schema,
  ChunkRetrievalSemanticInputV1Schema,
  ChunkRetrievalDomainTopicInputV1Schema,
  ChunkRetrievalTopologyInputV1Schema,
  ChunkRetrievalOntologyInputV1Schema,
  ChunkRetrievalProfilePresenceV1Schema,
  type ChunkRetrievalProfilePresenceV1,
} from './chunk-retrieval-profile-adapter-v1.js';

/**
 * V2 hydration adapter for the lineage-correct profile identity grain.
 * Pure function: no DB/service/network writes or calls.
 */
export const CHUNK_RETRIEVAL_PROFILE_ADAPTER_V2 = 'atlas.chunk-retrieval-profile-adapter.v2' as const;
const contentRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);

export const ChunkRetrievalIdentityInputV2Schema = z.object({
  canonicalChunkId: z.string().min(1),
  chunkRowId: z.string().uuid(),
  packetKey: z.string().min(1),
  repositoryId: z.string().min(1),
  repositoryRelativePath: z.string().min(1),
  sourceRef: z.string().min(1),
  workspaceRevision: contentRevisionSchema,
  sourceRevision: contentRevisionSchema,
}).strict();
export type ChunkRetrievalIdentityInputV2 = z.infer<typeof ChunkRetrievalIdentityInputV2Schema>;

export const ChunkRetrievalProfileHydrationInputV2Schema = z.object({
  schemaVersion: z.literal(CHUNK_RETRIEVAL_PROFILE_ADAPTER_V2),
  identity: ChunkRetrievalIdentityInputV2Schema,
  featureRevision: z.string().min(1),
  lexicalStructural: ChunkRetrievalLexicalStructuralInputV1Schema.optional(),
  semantic: ChunkRetrievalSemanticInputV1Schema.optional(),
  domainTopic: ChunkRetrievalDomainTopicInputV1Schema.optional(),
  topology: ChunkRetrievalTopologyInputV1Schema.optional(),
  ontology: ChunkRetrievalOntologyInputV1Schema.optional(),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type ChunkRetrievalProfileHydrationInputV2 = z.infer<typeof ChunkRetrievalProfileHydrationInputV2Schema>;

export const ChunkRetrievalProfileHydrationResultV2Schema = z.object({
  schemaVersion: z.literal('atlas.chunk-retrieval-profile-hydration-result.v2'),
  profile: z.unknown(),
  presence: ChunkRetrievalProfilePresenceV1Schema,
  missingGroups: z.array(z.enum(['lexicalStructural', 'semantic', 'domainTopic', 'topology', 'ontology'])),
  writesPerformed: z.literal(false),
  canonicalAuthorityChanged: z.literal(false),
}).strict();
export type ChunkRetrievalProfileHydrationResultV2 = Omit<
  z.infer<typeof ChunkRetrievalProfileHydrationResultV2Schema>,
  'profile'
> & { profile: ChunkRetrievalProfileV2 };

function defined<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

function cleanArray(values: string[] | null | undefined): string[] | undefined {
  return values === null || values === undefined ? undefined : values;
}

export function hydrateChunkRetrievalProfileV2(
  raw: ChunkRetrievalProfileHydrationInputV2,
): ChunkRetrievalProfileHydrationResultV2 {
  const input = ChunkRetrievalProfileHydrationInputV2Schema.parse(raw);
  const { identity } = input;
  const normalizedPath = identity.repositoryRelativePath.replaceAll('\\', '/');

  const lexicalStructural = input.lexicalStructural ? {
    language: input.lexicalStructural.language,
    symbolKind: defined(input.lexicalStructural.symbolKind),
    symbolName: defined(input.lexicalStructural.symbolName),
    keywords: cleanArray(input.lexicalStructural.keywords),
    identifiers: cleanArray(input.lexicalStructural.identifiers),
    nouns: cleanArray(input.lexicalStructural.nouns),
    astNodeType: defined(input.lexicalStructural.astNodeType),
    astPath: cleanArray(input.lexicalStructural.astPath),
    calls: cleanArray(input.lexicalStructural.calls),
    imports: cleanArray(input.lexicalStructural.imports),
    exports: cleanArray(input.lexicalStructural.exports),
  } : undefined;

  const semantic = input.semantic ? {
    summary: defined(input.semantic.summary),
    semanticTags: cleanArray(input.semantic.semanticTags),
    embeddingRepresentation: 'semantic_768' as const,
    representationRevision: input.semantic.representationRevision,
    modelRevision: defined(input.semantic.modelRevision),
  } : undefined;

  const domainTopic = input.domainTopic ? {
    primaryDomain: defined(input.domainTopic.primaryDomain),
    domainConfidence: defined(input.domainTopic.domainConfidence),
    topicIds: cleanArray(input.domainTopic.topicIds),
  } : undefined;

  const topology = input.topology ? {
    kmeansCluster: defined(input.topology.kmeansCluster),
    clusterMargin: defined(input.topology.clusterMargin),
    somX: defined(input.topology.somX),
    somY: defined(input.topology.somY),
    somCell: defined(input.topology.somCell),
    communityId: defined(input.topology.communityId),
    pageRank: defined(input.topology.pageRank),
    bridgeScore: defined(input.topology.bridgeScore),
    manifold4: defined(input.topology.manifold4),
  } : undefined;

  const ontology = input.ontology ? {
    conceptIds: cleanArray(input.ontology.conceptIds),
    entityIds: cleanArray(input.ontology.entityIds),
    ontologyTupleIds: cleanArray(input.ontology.ontologyTupleIds),
  } : undefined;

  const profile = createChunkRetrievalProfileV2({
    schemaVersion: CHUNK_RETRIEVAL_PROFILE_V2,
    canonicalChunkId: identity.canonicalChunkId,
    chunkRowId: identity.chunkRowId,
    packetKey: identity.packetKey,
    repositoryId: identity.repositoryId,
    repositoryRelativePath: normalizedPath,
    sourceIdentityKey: `${identity.repositoryId}:${normalizedPath}`,
    sourceRef: identity.sourceRef,
    workspaceRevision: identity.workspaceRevision,
    sourceRevision: identity.sourceRevision,
    lexicalStructural,
    semantic,
    domainTopic,
    topology,
    ontology,
    revisions: {
      featureRevision: input.featureRevision,
      classifierRevision: input.domainTopic?.classifierRevision,
      topologyRevision: input.topology?.topologyRevision,
      graphRevision: defined(input.topology?.graphRevision),
      ontologyRevision: input.ontology?.ontologyRevision,
    },
    evidenceRefs: input.evidenceRefs,
  });

  const presence: ChunkRetrievalProfilePresenceV1 = {
    lexicalStructural: input.lexicalStructural !== undefined,
    semantic: input.semantic !== undefined,
    domainTopic: input.domainTopic !== undefined,
    topology: input.topology !== undefined,
    ontology: input.ontology !== undefined,
  };
  const missingGroups = (Object.entries(presence) as Array<[keyof ChunkRetrievalProfilePresenceV1, boolean]>)
    .filter(([, present]) => !present)
    .map(([group]) => group);

  return {
    schemaVersion: 'atlas.chunk-retrieval-profile-hydration-result.v2',
    profile,
    presence,
    missingGroups,
    writesPerformed: false,
    canonicalAuthorityChanged: false,
  };
}
