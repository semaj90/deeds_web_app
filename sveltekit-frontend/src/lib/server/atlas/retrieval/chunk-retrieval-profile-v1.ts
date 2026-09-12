import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Shared revision-qualified retrieval vocabulary for one canonical code chunk.
 *
 * This contract owns no persistence and carries no raw vector values. It binds
 * existing lexical/structural/semantic/domain/topology/ontology evidence to the
 * canonical packet/chunk/source identity used by Parent Atlas.
 */

export const CHUNK_RETRIEVAL_PROFILE_V1 = 'atlas.chunk-retrieval-profile.v1' as const;

const contentRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/i);

const repositoryRelativePathSchema = z.string().min(1).refine((value) => {
  const normalized = value.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !normalized.split('/').includes('..');
}, 'repositoryRelativePath must be relative and traversal-free');

export const ChunkRetrievalLexicalStructuralV1Schema = z.object({
  language: z.string().min(1),
  symbolKind: z.string().min(1).optional(),
  symbolName: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  identifiers: z.array(z.string().min(1)).optional(),
  nouns: z.array(z.string().min(1)).optional(),
  astNodeType: z.string().min(1).optional(),
  astPath: z.array(z.string().min(1)).optional(),
  calls: z.array(z.string().min(1)).optional(),
  imports: z.array(z.string().min(1)).optional(),
  exports: z.array(z.string().min(1)).optional(),
}).strict();
export type ChunkRetrievalLexicalStructuralV1 = z.infer<typeof ChunkRetrievalLexicalStructuralV1Schema>;

export const ChunkRetrievalSemanticV1Schema = z.object({
  summary: z.string().min(1).optional(),
  semanticTags: z.array(z.string().min(1)).optional(),
  embeddingRepresentation: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  modelRevision: z.string().min(1).optional(),
}).strict();
export type ChunkRetrievalSemanticV1 = z.infer<typeof ChunkRetrievalSemanticV1Schema>;

export const ChunkRetrievalDomainTopicV1Schema = z.object({
  primaryDomain: z.string().min(1).optional(),
  domainConfidence: z.number().finite().min(0).max(1).optional(),
  topicIds: z.array(z.string().min(1)).optional(),
}).strict();
export type ChunkRetrievalDomainTopicV1 = z.infer<typeof ChunkRetrievalDomainTopicV1Schema>;

export const ChunkRetrievalTopologyV1Schema = z.object({
  kmeansCluster: z.number().int().nonnegative().optional(),
  clusterMargin: z.number().finite().nonnegative().optional(),
  somX: z.number().int().min(0).max(19).optional(),
  somY: z.number().int().min(0).max(19).optional(),
  somCell: z.number().int().min(0).max(399).optional(),
  communityId: z.number().int().nonnegative().optional(),
  pageRank: z.number().finite().nonnegative().optional(),
  bridgeScore: z.number().finite().nonnegative().optional(),
  manifold4: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ]).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.somX !== undefined && value.somY !== undefined && value.somCell !== undefined) {
    const expected = value.somY * 20 + value.somX;
    if (value.somCell !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['somCell'],
        message: `somCell must equal somY * 20 + somX (${expected})`,
      });
    }
  }
});
export type ChunkRetrievalTopologyV1 = z.infer<typeof ChunkRetrievalTopologyV1Schema>;

export const ChunkRetrievalOntologyV1Schema = z.object({
  conceptIds: z.array(z.string().min(1)).optional(),
  entityIds: z.array(z.string().min(1)).optional(),
  ontologyTupleIds: z.array(z.string().min(1)).optional(),
}).strict();
export type ChunkRetrievalOntologyV1 = z.infer<typeof ChunkRetrievalOntologyV1Schema>;

export const ChunkRetrievalRevisionsV1Schema = z.object({
  featureRevision: z.string().min(1),
  classifierRevision: z.string().min(1).optional(),
  topologyRevision: z.string().min(1).optional(),
  graphRevision: z.string().min(1).optional(),
  ontologyRevision: z.string().min(1).optional(),
}).strict();
export type ChunkRetrievalRevisionsV1 = z.infer<typeof ChunkRetrievalRevisionsV1Schema>;

const chunkRetrievalProfileCoreShape = {
  schemaVersion: z.literal(CHUNK_RETRIEVAL_PROFILE_V1),
  canonicalChunkId: z.string().uuid(),
  packetKey: z.string().min(1),
  repositoryId: z.string().min(1),
  repositoryRelativePath: repositoryRelativePathSchema,
  sourceIdentityKey: z.string().min(1),
  sourceRef: z.string().min(1),
  workspaceRevision: contentRevisionSchema,
  sourceRevision: contentRevisionSchema,
  lexicalStructural: ChunkRetrievalLexicalStructuralV1Schema.optional(),
  semantic: ChunkRetrievalSemanticV1Schema.optional(),
  domainTopic: ChunkRetrievalDomainTopicV1Schema.optional(),
  topology: ChunkRetrievalTopologyV1Schema.optional(),
  ontology: ChunkRetrievalOntologyV1Schema.optional(),
  revisions: ChunkRetrievalRevisionsV1Schema,
  evidenceRefs: z.array(z.string().min(1)).min(1),
} as const;

const chunkRetrievalProfileCoreSchema = z.object(chunkRetrievalProfileCoreShape).strict();
type ChunkRetrievalProfileCoreV1 = z.infer<typeof chunkRetrievalProfileCoreSchema>;

function validateProfileCore(value: ChunkRetrievalProfileCoreV1, ctx: z.RefinementCtx): void {
  const normalizedPath = value.repositoryRelativePath.replaceAll('\\', '/');
  const expectedSourceIdentityKey = `${value.repositoryId}:${normalizedPath}`;
  if (value.sourceIdentityKey !== expectedSourceIdentityKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceIdentityKey'],
      message: `sourceIdentityKey must equal repositoryId:repositoryRelativePath (${expectedSourceIdentityKey})`,
    });
  }

  if (
    value.lexicalStructural === undefined
    && value.semantic === undefined
    && value.domainTopic === undefined
    && value.topology === undefined
    && value.ontology === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'at least one retrieval feature group must be present',
    });
  }
}

export const ChunkRetrievalProfileDraftV1Schema = chunkRetrievalProfileCoreSchema.superRefine(validateProfileCore);
export type ChunkRetrievalProfileDraftV1 = z.infer<typeof ChunkRetrievalProfileDraftV1Schema>;

export const ChunkRetrievalProfileV1Schema = chunkRetrievalProfileCoreSchema
  .extend({ checksum: checksumSchema })
  .strict()
  .superRefine((value, ctx) => validateProfileCore(value, ctx));
export type ChunkRetrievalProfileV1 = z.infer<typeof ChunkRetrievalProfileV1Schema>;

function normalizeStringSet(values: string[] | undefined): string[] | undefined {
  if (values === undefined) return undefined;
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizeDraft(input: ChunkRetrievalProfileDraftV1): ChunkRetrievalProfileDraftV1 {
  const normalizedPath = input.repositoryRelativePath.replaceAll('\\', '/');
  return {
    ...input,
    repositoryRelativePath: normalizedPath,
    sourceIdentityKey: `${input.repositoryId}:${normalizedPath}`,
    ...(input.lexicalStructural ? {
      lexicalStructural: {
        ...input.lexicalStructural,
        keywords: normalizeStringSet(input.lexicalStructural.keywords),
        identifiers: normalizeStringSet(input.lexicalStructural.identifiers),
        nouns: normalizeStringSet(input.lexicalStructural.nouns),
        calls: normalizeStringSet(input.lexicalStructural.calls),
        imports: normalizeStringSet(input.lexicalStructural.imports),
        exports: normalizeStringSet(input.lexicalStructural.exports),
      },
    } : {}),
    ...(input.semantic ? { semantic: { ...input.semantic, semanticTags: normalizeStringSet(input.semantic.semanticTags) } } : {}),
    ...(input.domainTopic ? { domainTopic: { ...input.domainTopic, topicIds: normalizeStringSet(input.domainTopic.topicIds) } } : {}),
    ...(input.ontology ? {
      ontology: {
        ...input.ontology,
        conceptIds: normalizeStringSet(input.ontology.conceptIds),
        entityIds: normalizeStringSet(input.ontology.entityIds),
        ontologyTupleIds: normalizeStringSet(input.ontology.ontologyTupleIds),
      },
    } : {}),
    evidenceRefs: normalizeStringSet(input.evidenceRefs) ?? [],
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function computeChunkRetrievalProfileChecksum(input: ChunkRetrievalProfileDraftV1): string {
  const parsed = ChunkRetrievalProfileDraftV1Schema.parse(input);
  const normalized = normalizeDraft(parsed);
  return createHash('sha256').update(JSON.stringify(canonicalize(normalized))).digest('hex');
}

export function createChunkRetrievalProfileV1(input: ChunkRetrievalProfileDraftV1): ChunkRetrievalProfileV1 {
  const parsed = ChunkRetrievalProfileDraftV1Schema.parse(input);
  const normalized = normalizeDraft(parsed);
  const checksum = createHash('sha256').update(JSON.stringify(canonicalize(normalized))).digest('hex');
  return ChunkRetrievalProfileV1Schema.parse({ ...normalized, checksum });
}

export function verifyChunkRetrievalProfileChecksum(profile: ChunkRetrievalProfileV1): boolean {
  const parsed = ChunkRetrievalProfileV1Schema.parse(profile);
  const { checksum, ...draft } = parsed;
  return checksum === computeChunkRetrievalProfileChecksum(draft);
}
