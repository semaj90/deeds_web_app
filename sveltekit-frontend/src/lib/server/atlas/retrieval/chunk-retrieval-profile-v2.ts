import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ChunkRetrievalLexicalStructuralV1Schema,
  ChunkRetrievalSemanticV1Schema,
  ChunkRetrievalDomainTopicV1Schema,
  ChunkRetrievalTopologyV1Schema,
  ChunkRetrievalOntologyV1Schema,
  ChunkRetrievalRevisionsV1Schema,
} from './chunk-retrieval-profile-v1.js';

/**
 * V2 corrects the canonical chunk identity grain established by
 * atlas_packet_chunk_lineage:
 *
 * - canonicalChunkId = codebase_chunk_index.chunk_id (TEXT, canonical identity)
 * - chunkRowId       = codebase_chunk_index.id       (UUID, physical row identity)
 *
 * V1 incorrectly constrained canonicalChunkId to UUID and is retained only as
 * historical evidence. New hydration/readback code must use V2.
 */
export const CHUNK_RETRIEVAL_PROFILE_V2 = 'atlas.chunk-retrieval-profile.v2' as const;

const contentRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const repositoryRelativePathSchema = z.string().min(1).refine((value) => {
  const normalized = value.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !normalized.split('/').includes('..');
}, 'repositoryRelativePath must be relative and traversal-free');

const profileCoreShape = {
  schemaVersion: z.literal(CHUNK_RETRIEVAL_PROFILE_V2),
  canonicalChunkId: z.string().min(1),
  chunkRowId: z.string().uuid(),
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

const profileCoreSchema = z.object(profileCoreShape).strict();

type ProfileCore = z.infer<typeof profileCoreSchema>;

function validateCore(value: ProfileCore, ctx: z.RefinementCtx): void {
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

export const ChunkRetrievalProfileDraftV2Schema = profileCoreSchema.superRefine(validateCore);
export type ChunkRetrievalProfileDraftV2 = z.infer<typeof ChunkRetrievalProfileDraftV2Schema>;

export const ChunkRetrievalProfileV2Schema = profileCoreSchema
  .extend({ checksum: checksumSchema })
  .strict()
  .superRefine((value, ctx) => validateCore(value, ctx));
export type ChunkRetrievalProfileV2 = z.infer<typeof ChunkRetrievalProfileV2Schema>;

function normalizeStringSet(values: string[] | undefined): string[] | undefined {
  if (values === undefined) return undefined;
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizeDraft(input: ChunkRetrievalProfileDraftV2): ChunkRetrievalProfileDraftV2 {
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
    ...(input.semantic ? {
      semantic: { ...input.semantic, semanticTags: normalizeStringSet(input.semantic.semanticTags) },
    } : {}),
    ...(input.domainTopic ? {
      domainTopic: { ...input.domainTopic, topicIds: normalizeStringSet(input.domainTopic.topicIds) },
    } : {}),
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

export function computeChunkRetrievalProfileV2Checksum(input: ChunkRetrievalProfileDraftV2): string {
  const parsed = ChunkRetrievalProfileDraftV2Schema.parse(input);
  const normalized = normalizeDraft(parsed);
  return createHash('sha256').update(JSON.stringify(canonicalize(normalized))).digest('hex');
}

export function createChunkRetrievalProfileV2(input: ChunkRetrievalProfileDraftV2): ChunkRetrievalProfileV2 {
  const parsed = ChunkRetrievalProfileDraftV2Schema.parse(input);
  const normalized = normalizeDraft(parsed);
  const checksum = createHash('sha256').update(JSON.stringify(canonicalize(normalized))).digest('hex');
  return ChunkRetrievalProfileV2Schema.parse({ ...normalized, checksum });
}

export function verifyChunkRetrievalProfileV2Checksum(profile: ChunkRetrievalProfileV2): boolean {
  const parsed = ChunkRetrievalProfileV2Schema.parse(profile);
  const { checksum, ...draft } = parsed;
  return checksum === computeChunkRetrievalProfileV2Checksum(draft);
}
