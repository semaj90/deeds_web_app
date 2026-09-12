import { z } from 'zod';
import {
  CHUNK_RETRIEVAL_PROFILE_V1,
  createChunkRetrievalProfileV1,
  type ChunkRetrievalProfileV1,
} from './chunk-retrieval-profile-v1.js';

/**
 * Pure/read-only adapter that normalizes already-read canonical and derived
 * records into ChunkRetrievalProfileV1. It performs no database or service I/O.
 *
 * Missing feature groups remain missing. The adapter never fabricates a
 * representation/model/classifier/topology/graph/ontology revision.
 */

export const CHUNK_RETRIEVAL_PROFILE_ADAPTER_V1 = 'atlas.chunk-retrieval-profile-adapter.v1' as const;

const contentRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);

export const ChunkRetrievalIdentityInputV1Schema = z.object({
  canonicalChunkId: z.string().uuid(),
  packetKey: z.string().min(1),
  repositoryId: z.string().min(1),
  repositoryRelativePath: z.string().min(1),
  sourceRef: z.string().min(1),
  workspaceRevision: contentRevisionSchema,
  sourceRevision: contentRevisionSchema,
}).strict();
export type ChunkRetrievalIdentityInputV1 = z.infer<typeof ChunkRetrievalIdentityInputV1Schema>;

export const ChunkRetrievalLexicalStructuralInputV1Schema = z.object({
  language: z.string().min(1),
  symbolKind: z.string().min(1).nullable().optional(),
  symbolName: z.string().min(1).nullable().optional(),
  keywords: z.array(z.string().min(1)).nullable().optional(),
  identifiers: z.array(z.string().min(1)).nullable().optional(),
  nouns: z.array(z.string().min(1)).nullable().optional(),
  astNodeType: z.string().min(1).nullable().optional(),
  astPath: z.array(z.string().min(1)).nullable().optional(),
  calls: z.array(z.string().min(1)).nullable().optional(),
  imports: z.array(z.string().min(1)).nullable().optional(),
  exports: z.array(z.string().min(1)).nullable().optional(),
}).strict();

export const ChunkRetrievalSemanticInputV1Schema = z.object({
  summary: z.string().min(1).nullable().optional(),
  semanticTags: z.array(z.string().min(1)).nullable().optional(),
  representationRevision: z.string().min(1),
  modelRevision: z.string().min(1).nullable().optional(),
}).strict();

export const ChunkRetrievalDomainTopicInputV1Schema = z.object({
  primaryDomain: z.string().min(1).nullable().optional(),
  domainConfidence: z.number().finite().min(0).max(1).nullable().optional(),
  topicIds: z.array(z.string().min(1)).nullable().optional(),
  classifierRevision: z.string().min(1),
}).strict();

export const ChunkRetrievalTopologyInputV1Schema = z.object({
  kmeansCluster: z.number().int().nonnegative().nullable().optional(),
  clusterMargin: z.number().finite().nonnegative().nullable().optional(),
  somX: z.number().int().min(0).max(19).nullable().optional(),
  somY: z.number().int().min(0).max(19).nullable().optional(),
  somCell: z.number().int().min(0).max(399).nullable().optional(),
  communityId: z.number().int().nonnegative().nullable().optional(),
  pageRank: z.number().finite().nonnegative().nullable().optional(),
  bridgeScore: z.number().finite().nonnegative().nullable().optional(),
  manifold4: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ]).nullable().optional(),
  topologyRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable().optional(),
}).strict();

export const ChunkRetrievalOntologyInputV1Schema = z.object({
  conceptIds: z.array(z.string().min(1)).nullable().optional(),
  entityIds: z.array(z.string().min(1)).nullable().optional(),
  ontologyTupleIds: z.array(z.string().min(1)).nullable().optional(),
  ontologyRevision: z.string().min(1),
}).strict();

export const ChunkRetrievalProfileHydrationInputV1Schema = z.object({
  schemaVersion: z.literal(CHUNK_RETRIEVAL_PROFILE_ADAPTER_V1),
  identity: ChunkRetrievalIdentityInputV1Schema,
  featureRevision: z.string().min(1),
  lexicalStructural: ChunkRetrievalLexicalStructuralInputV1Schema.optional(),
  semantic: ChunkRetrievalSemanticInputV1Schema.optional(),
  domainTopic: ChunkRetrievalDomainTopicInputV1Schema.optional(),
  topology: ChunkRetrievalTopologyInputV1Schema.optional(),
  ontology: ChunkRetrievalOntologyInputV1Schema.optional(),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type ChunkRetrievalProfileHydrationInputV1 = z.infer<typeof ChunkRetrievalProfileHydrationInputV1Schema>;

export const ChunkRetrievalProfilePresenceV1Schema = z.object({
  lexicalStructural: z.boolean(),
  semantic: z.boolean(),
  domainTopic: z.boolean(),
  topology: z.boolean(),
  ontology: z.boolean(),
}).strict();
export type ChunkRetrievalProfilePresenceV1 = z.infer<typeof ChunkRetrievalProfilePresenceV1Schema>;

export const ChunkRetrievalProfileHydrationResultV1Schema = z.object({
  schemaVersion: z.literal('atlas.chunk-retrieval-profile-hydration-result.v1'),
  profile: z.unknown(),
  presence: ChunkRetrievalProfilePresenceV1Schema,
  missingGroups: z.array(z.enum(['lexicalStructural', 'semantic', 'domainTopic', 'topology', 'ontology'])),
  writesPerformed: z.literal(false),
  canonicalAuthorityChanged: z.literal(false),
}).strict();
export type ChunkRetrievalProfileHydrationResultV1 = Omit<
  z.infer<typeof ChunkRetrievalProfileHydrationResultV1Schema>,
  'profile'
> & { profile: ChunkRetrievalProfileV1 };

function defined<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

function cleanArray(values: string[] | null | undefined): string[] | undefined {
  return values === null || values === undefined ? undefined : values;
}

export function hydrateChunkRetrievalProfileV1(
  raw: ChunkRetrievalProfileHydrationInputV1,
): ChunkRetrievalProfileHydrationResultV1 {
  const input = ChunkRetrievalProfileHydrationInputV1Schema.parse(raw);
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

  const profile = createChunkRetrievalProfileV1({
    schemaVersion: CHUNK_RETRIEVAL_PROFILE_V1,
    canonicalChunkId: identity.canonicalChunkId,
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
    schemaVersion: 'atlas.chunk-retrieval-profile-hydration-result.v1',
    profile,
    presence,
    missingGroups,
    writesPerformed: false,
    canonicalAuthorityChanged: false,
  };
}
