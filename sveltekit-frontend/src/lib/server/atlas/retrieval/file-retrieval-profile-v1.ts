import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ChunkRetrievalProfileV2Schema,
  verifyChunkRetrievalProfileV2Checksum,
  type ChunkRetrievalProfileV2,
} from './chunk-retrieval-profile-v2.js';

/**
 * FILE-PROFILE-01 -- pure aggregation over already-admitted
 * ChunkRetrievalProfileV2 rows.
 *
 * FileProfileV1 does not mint a second file identity. The file identity is the
 * existing packet/source identity shared by all member chunks. The aggregate is
 * deterministic, read-only, and rejects mixed revisions or duplicate chunk
 * membership rather than silently merging them.
 */
export const FILE_RETRIEVAL_PROFILE_V1 = 'atlas.file-retrieval-profile.v1' as const;

const contentRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const repositoryRelativePathSchema = z.string().min(1).refine((value) => {
  const normalized = value.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !normalized.split('/').includes('..');
}, 'repositoryRelativePath must be relative and traversal-free');

const countEntrySchema = z.object({
  key: z.string().min(1),
  count: z.number().int().positive(),
}).strict();

const fileProfileCoreShape = {
  schemaVersion: z.literal(FILE_RETRIEVAL_PROFILE_V1),
  packetKey: z.string().min(1),
  repositoryId: z.string().min(1),
  repositoryRelativePath: repositoryRelativePathSchema,
  sourceIdentityKey: z.string().min(1),
  sourceRef: z.string().min(1),
  workspaceRevision: contentRevisionSchema,
  sourceRevision: contentRevisionSchema,

  chunkCount: z.number().int().positive(),
  canonicalChunkIds: z.array(z.string().min(1)).min(1),
  chunkRowIds: z.array(z.string().uuid()).min(1),
  chunkProfileChecksums: z.array(checksumSchema).min(1),
  chunkMembershipChecksum: checksumSchema,

  languages: z.array(z.string().min(1)),
  symbolKinds: z.array(z.string().min(1)),
  symbolNames: z.array(z.string().min(1)),
  keywords: z.array(z.string().min(1)),
  semanticTags: z.array(z.string().min(1)),
  conceptIds: z.array(z.string().min(1)),
  entityIds: z.array(z.string().min(1)),
  ontologyTupleIds: z.array(z.string().min(1)),
  primaryDomainCounts: z.array(countEntrySchema),
  kmeansClusters: z.array(z.number().int().nonnegative()),
  somCells: z.array(z.number().int().min(0).max(399)),
  communityIds: z.array(z.number().int().nonnegative()),
  pageRankMean: z.number().finite().nonnegative().optional(),
  pageRankMax: z.number().finite().nonnegative().optional(),

  featureRevisions: z.array(z.string().min(1)).min(1),
  classifierRevisions: z.array(z.string().min(1)),
  topologyRevisions: z.array(z.string().min(1)),
  graphRevisions: z.array(z.string().min(1)),
  ontologyRevisions: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)).min(1),
} as const;

const fileProfileCoreSchema = z.object(fileProfileCoreShape).strict();
type FileProfileCore = z.infer<typeof fileProfileCoreSchema>;

function validateCore(value: FileProfileCore, ctx: z.RefinementCtx): void {
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
    value.canonicalChunkIds.length !== value.chunkCount
    || value.chunkRowIds.length !== value.chunkCount
    || value.chunkProfileChecksums.length !== value.chunkCount
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chunkCount'],
      message: 'chunkCount must equal canonicalChunkIds/chunkRowIds/chunkProfileChecksums cardinality',
    });
  }
}

export const FileRetrievalProfileDraftV1Schema = fileProfileCoreSchema.superRefine(validateCore);
export type FileRetrievalProfileDraftV1 = z.infer<typeof FileRetrievalProfileDraftV1Schema>;

export const FileRetrievalProfileV1Schema = fileProfileCoreSchema
  .extend({ checksum: checksumSchema })
  .strict()
  .superRefine((value, ctx) => validateCore(value, ctx));
export type FileRetrievalProfileV1 = z.infer<typeof FileRetrievalProfileV1Schema>;

function sortedUniqueStrings(values: Iterable<string | undefined>): string[] {
  return [...new Set([...values].filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
}

function sortedUniqueNumbers(values: Iterable<number | undefined>): number[] {
  return [...new Set([...values].filter((value): value is number => value !== undefined && Number.isFinite(value)))].sort((a, b) => a - b);
}

function flattenStrings(values: Array<string[] | undefined>): string[] {
  return sortedUniqueStrings(values.flatMap((value) => value ?? []));
}

function countStrings(values: Iterable<string | undefined>): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, count }));
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

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function assertSameFileIdentity(chunks: ChunkRetrievalProfileV2[]): void {
  const first = chunks[0];
  if (!first) throw new Error('FILE_PROFILE_EMPTY_CHUNK_SET');
  const fields: Array<keyof Pick<ChunkRetrievalProfileV2,
    'packetKey' | 'repositoryId' | 'repositoryRelativePath' | 'sourceIdentityKey' | 'sourceRef' | 'workspaceRevision' | 'sourceRevision'
  >> = [
    'packetKey',
    'repositoryId',
    'repositoryRelativePath',
    'sourceIdentityKey',
    'sourceRef',
    'workspaceRevision',
    'sourceRevision',
  ];
  for (const chunk of chunks.slice(1)) {
    for (const field of fields) {
      if (chunk[field] !== first[field]) {
        throw new Error(`FILE_PROFILE_MIXED_${String(field).toUpperCase()}`);
      }
    }
  }
}

export function computeFileChunkMembershipChecksum(chunks: ChunkRetrievalProfileV2[]): string {
  if (chunks.length === 0) throw new Error('FILE_PROFILE_EMPTY_CHUNK_SET');
  const parsed = chunks.map((chunk) => ChunkRetrievalProfileV2Schema.parse(chunk));
  assertSameFileIdentity(parsed);
  const canonicalIds = new Set<string>();
  const rowIds = new Set<string>();
  for (const chunk of parsed) {
    if (!verifyChunkRetrievalProfileV2Checksum(chunk)) throw new Error('FILE_PROFILE_INVALID_CHUNK_PROFILE_CHECKSUM');
    if (canonicalIds.has(chunk.canonicalChunkId)) throw new Error('FILE_PROFILE_DUPLICATE_CANONICAL_CHUNK_ID');
    if (rowIds.has(chunk.chunkRowId)) throw new Error('FILE_PROFILE_DUPLICATE_CHUNK_ROW_ID');
    canonicalIds.add(chunk.canonicalChunkId);
    rowIds.add(chunk.chunkRowId);
  }
  const membership = parsed
    .map((chunk) => ({
      canonicalChunkId: chunk.canonicalChunkId,
      chunkRowId: chunk.chunkRowId,
      chunkProfileChecksum: chunk.checksum,
    }))
    .sort((a, b) => a.canonicalChunkId.localeCompare(b.canonicalChunkId) || a.chunkRowId.localeCompare(b.chunkRowId));
  return sha256Canonical(membership);
}

export function computeFileRetrievalProfileChecksum(input: FileRetrievalProfileDraftV1): string {
  return sha256Canonical(FileRetrievalProfileDraftV1Schema.parse(input));
}

export function aggregateFileRetrievalProfileV1(chunks: ChunkRetrievalProfileV2[]): FileRetrievalProfileV1 {
  if (chunks.length === 0) throw new Error('FILE_PROFILE_EMPTY_CHUNK_SET');
  const parsed = chunks.map((chunk) => ChunkRetrievalProfileV2Schema.parse(chunk));
  assertSameFileIdentity(parsed);
  const chunkMembershipChecksum = computeFileChunkMembershipChecksum(parsed);
  const ordered = [...parsed].sort(
    (a, b) => a.canonicalChunkId.localeCompare(b.canonicalChunkId) || a.chunkRowId.localeCompare(b.chunkRowId),
  );
  const first = ordered[0]!;

  const pageRanks = ordered
    .map((chunk) => chunk.topology?.pageRank)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));

  const draft: FileRetrievalProfileDraftV1 = {
    schemaVersion: FILE_RETRIEVAL_PROFILE_V1,
    packetKey: first.packetKey,
    repositoryId: first.repositoryId,
    repositoryRelativePath: first.repositoryRelativePath.replaceAll('\\', '/'),
    sourceIdentityKey: first.sourceIdentityKey,
    sourceRef: first.sourceRef,
    workspaceRevision: first.workspaceRevision,
    sourceRevision: first.sourceRevision,
    chunkCount: ordered.length,
    canonicalChunkIds: ordered.map((chunk) => chunk.canonicalChunkId),
    chunkRowIds: ordered.map((chunk) => chunk.chunkRowId),
    chunkProfileChecksums: ordered.map((chunk) => chunk.checksum),
    chunkMembershipChecksum,
    languages: sortedUniqueStrings(ordered.map((chunk) => chunk.lexicalStructural?.language)),
    symbolKinds: sortedUniqueStrings(ordered.map((chunk) => chunk.lexicalStructural?.symbolKind)),
    symbolNames: sortedUniqueStrings(ordered.map((chunk) => chunk.lexicalStructural?.symbolName)),
    keywords: flattenStrings(ordered.map((chunk) => chunk.lexicalStructural?.keywords)),
    semanticTags: flattenStrings(ordered.map((chunk) => chunk.semantic?.semanticTags)),
    conceptIds: flattenStrings(ordered.map((chunk) => chunk.ontology?.conceptIds)),
    entityIds: flattenStrings(ordered.map((chunk) => chunk.ontology?.entityIds)),
    ontologyTupleIds: flattenStrings(ordered.map((chunk) => chunk.ontology?.ontologyTupleIds)),
    primaryDomainCounts: countStrings(ordered.map((chunk) => chunk.domainTopic?.primaryDomain)),
    kmeansClusters: sortedUniqueNumbers(ordered.map((chunk) => chunk.topology?.kmeansCluster)),
    somCells: sortedUniqueNumbers(ordered.map((chunk) => chunk.topology?.somCell)),
    communityIds: sortedUniqueNumbers(ordered.map((chunk) => chunk.topology?.communityId)),
    ...(pageRanks.length > 0 ? {
      pageRankMean: pageRanks.reduce((sum, value) => sum + value, 0) / pageRanks.length,
      pageRankMax: Math.max(...pageRanks),
    } : {}),
    featureRevisions: sortedUniqueStrings(ordered.map((chunk) => chunk.revisions.featureRevision)),
    classifierRevisions: sortedUniqueStrings(ordered.map((chunk) => chunk.revisions.classifierRevision)),
    topologyRevisions: sortedUniqueStrings(ordered.map((chunk) => chunk.revisions.topologyRevision)),
    graphRevisions: sortedUniqueStrings(ordered.map((chunk) => chunk.revisions.graphRevision)),
    ontologyRevisions: sortedUniqueStrings(ordered.map((chunk) => chunk.revisions.ontologyRevision)),
    evidenceRefs: flattenStrings(ordered.map((chunk) => chunk.evidenceRefs)),
  };

  const normalized = FileRetrievalProfileDraftV1Schema.parse(draft);
  const checksum = computeFileRetrievalProfileChecksum(normalized);
  return FileRetrievalProfileV1Schema.parse({ ...normalized, checksum });
}

export function verifyFileRetrievalProfileV1Checksum(profile: FileRetrievalProfileV1): boolean {
  const parsed = FileRetrievalProfileV1Schema.parse(profile);
  const { checksum, ...draft } = parsed;
  return checksum === computeFileRetrievalProfileChecksum(draft);
}
