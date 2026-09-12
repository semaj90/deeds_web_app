import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CHUNK_RETRIEVAL_PROFILE_SCHEMA = 'atlas.chunk-retrieval-profile.v1' as const;
export const FILE_RETRIEVAL_PROFILE_SCHEMA = 'atlas.file-retrieval-profile.v1' as const;
export const DIRECTORY_RETRIEVAL_PROFILE_SCHEMA = 'atlas.directory-retrieval-profile.v1' as const;

const nonEmpty = z.string().min(1);
const nullableFinite = z.number().finite().nullable().default(null);
const probability = z.number().finite().min(0).max(1);
const revision = nonEmpty;
const uniqueStrings = z.array(nonEmpty).default([]).transform((values) => [...new Set(values)].sort());

export const RetrievalTopologyFeaturesV1Schema = z.object({
  kmeansCluster: z.number().int().nonnegative().nullable().default(null),
  clusterMargin: nullableFinite,
  somX: z.number().int().min(0).max(19).nullable().default(null),
  somY: z.number().int().min(0).max(19).nullable().default(null),
  somCell: z.number().int().min(0).max(399).nullable().default(null),
  communityId: z.number().int().nonnegative().nullable().default(null),
  pageRank: z.number().finite().nonnegative().nullable().default(null),
  bridgeScore: z.number().finite().nonnegative().nullable().default(null),
  manifold4: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).nullable().default(null),
  topologyRevision: revision.nullable().default(null),
}).superRefine((value, ctx) => {
  const hasX = value.somX !== null;
  const hasY = value.somY !== null;
  if (hasX !== hasY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['somX'], message: 'SOM_X_Y_MUST_BE_PAIRED' });
  }
  if (hasX && hasY) {
    const expected = value.somY! * 20 + value.somX!;
    if (value.somCell !== null && value.somCell !== expected) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['somCell'], message: 'SOM_CELL_MUST_EQUAL_Y_TIMES_20_PLUS_X' });
    }
  }
});

export type RetrievalTopologyFeaturesV1 = z.infer<typeof RetrievalTopologyFeaturesV1Schema>;

export const DomainPredictionV1Schema = z.object({
  primaryDomain: nonEmpty,
  confidence: probability,
  topicIds: uniqueStrings,
  classifierRevision: revision,
  modelSha256: nonEmpty.nullable().default(null),
  trainingCorpusRevision: revision.nullable().default(null),
});

export const ChunkRetrievalProfileV1Schema = z.object({
  schema: z.literal(CHUNK_RETRIEVAL_PROFILE_SCHEMA),

  // Canonical/revision-qualified identity. None may be synthesized by this profile.
  canonicalChunkId: nonEmpty,
  packetKey: nonEmpty,
  repositoryId: nonEmpty,
  repositoryRelativePath: nonEmpty,
  sourceRef: nonEmpty,
  workspaceRevision: revision,
  sourceRevision: revision,

  // Lexical / structural evidence.
  language: nonEmpty,
  symbolKind: nonEmpty.nullable().default(null),
  symbolName: nonEmpty.nullable().default(null),
  keywords: uniqueStrings,
  identifiers: uniqueStrings,
  nouns: uniqueStrings,
  astNodeType: nonEmpty.nullable().default(null),
  astPath: z.array(nonEmpty).default([]),
  calls: uniqueStrings,
  imports: uniqueStrings,
  exports: uniqueStrings,

  // One logical semantic representation; executor selection is downstream.
  summary: z.string().default(''),
  semanticTags: uniqueStrings,
  embeddingRepresentation: z.literal('semantic_768'),
  semanticRevision: revision,

  // Classifier/topic evidence.
  domain: DomainPredictionV1Schema.nullable().default(null),

  // Compact topology/routing features, never semantic or identity authority.
  topology: RetrievalTopologyFeaturesV1Schema.default({}),

  // Ontology/knowledge evidence refs; tuple contents stay canonical elsewhere.
  conceptIds: uniqueStrings,
  entityIds: uniqueStrings,
  ontologyTupleIds: uniqueStrings,

  featureRevision: revision,
  evidenceRefs: uniqueStrings,
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type ChunkRetrievalProfileV1 = z.infer<typeof ChunkRetrievalProfileV1Schema>;

const DomainAggregateV1Schema = z.object({
  domain: nonEmpty,
  probability: probability,
});

const ClusterHistogramEntryV1Schema = z.object({
  id: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
});

const baseAggregate = {
  workspaceRevision: revision,
  sourceRevisionSetChecksum: nonEmpty,
  chunkCount: z.number().int().nonnegative(),
  summary: z.string().default(''),
  keywords: uniqueStrings,
  dominantDomains: z.array(DomainAggregateV1Schema).default([]),
  conceptIds: uniqueStrings,
  communityIds: z.array(z.number().int().nonnegative()).default([]).transform((values) => [...new Set(values)].sort((a, b) => a - b)),
  pageRankMean: z.number().finite().nonnegative().nullable().default(null),
  pageRankMax: z.number().finite().nonnegative().nullable().default(null),
  kmeansHistogram: z.array(ClusterHistogramEntryV1Schema).default([]),
  somCellHistogram: z.array(ClusterHistogramEntryV1Schema).default([]),
  featureRevision: revision,
  evidenceRefs: uniqueStrings,
  canonicalAuthority: z.literal(false).default(false),
};

export const FileRetrievalProfileV1Schema = z.object({
  schema: z.literal(FILE_RETRIEVAL_PROFILE_SCHEMA),
  profileKey: nonEmpty,
  repositoryId: nonEmpty,
  repositoryRelativePath: nonEmpty,
  sourceRef: nonEmpty,
  sourceRevision: revision,
  ...baseAggregate,
}).strict();

export type FileRetrievalProfileV1 = z.infer<typeof FileRetrievalProfileV1Schema>;

export const DirectoryRetrievalProfileV1Schema = z.object({
  schema: z.literal(DIRECTORY_RETRIEVAL_PROFILE_SCHEMA),
  profileKey: nonEmpty,
  repositoryId: nonEmpty,
  path: z.string(),
  fileCount: z.number().int().nonnegative(),
  inboundImports: z.number().int().nonnegative().default(0),
  outboundImports: z.number().int().nonnegative().default(0),
  ...baseAggregate,
}).strict();

export type DirectoryRetrievalProfileV1 = z.infer<typeof DirectoryRetrievalProfileV1Schema>;

function checksumStrings(values: string[]): string {
  const normalized = [...new Set(values)].sort();
  return `sha256:${createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`;
}

export function deriveProfileKeyV1(parts: readonly string[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;
}

function histogram(values: Array<number | null>): Array<{ id: number; count: number }> {
  const counts = new Map<number, number>();
  for (const value of values) {
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([id, count]) => ({ id, count }));
}

function pageRankStats(chunks: ChunkRetrievalProfileV1[]) {
  const values = chunks.map((chunk) => chunk.topology.pageRank).filter((value): value is number => value !== null);
  if (values.length === 0) return { mean: null, max: null };
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    max: Math.max(...values),
  };
}

function aggregateDomains(chunks: ChunkRetrievalProfileV1[]) {
  const totals = new Map<string, { weighted: number; count: number }>();
  for (const chunk of chunks) {
    if (!chunk.domain) continue;
    const current = totals.get(chunk.domain.primaryDomain) ?? { weighted: 0, count: 0 };
    current.weighted += chunk.domain.confidence;
    current.count += 1;
    totals.set(chunk.domain.primaryDomain, current);
  }
  return [...totals.entries()]
    .map(([domain, value]) => ({ domain, probability: value.weighted / value.count }))
    .sort((a, b) => b.probability - a.probability || a.domain.localeCompare(b.domain));
}

function commonAggregate(chunks: ChunkRetrievalProfileV1[], featureRevision: string) {
  if (chunks.length === 0) throw new Error('RETRIEVAL_PROFILE_AGGREGATE_REQUIRES_CHUNKS');
  const workspaceRevisions = [...new Set(chunks.map((chunk) => chunk.workspaceRevision))];
  if (workspaceRevisions.length !== 1) throw new Error('RETRIEVAL_PROFILE_WORKSPACE_REVISION_MIXED');
  const pageRank = pageRankStats(chunks);
  return {
    workspaceRevision: workspaceRevisions[0]!,
    sourceRevisionSetChecksum: checksumStrings(chunks.map((chunk) => chunk.sourceRevision)),
    chunkCount: chunks.length,
    summary: '',
    keywords: [...new Set(chunks.flatMap((chunk) => chunk.keywords))].sort(),
    dominantDomains: aggregateDomains(chunks),
    conceptIds: [...new Set(chunks.flatMap((chunk) => chunk.conceptIds))].sort(),
    communityIds: [...new Set(chunks.map((chunk) => chunk.topology.communityId).filter((value): value is number => value !== null))].sort((a, b) => a - b),
    pageRankMean: pageRank.mean,
    pageRankMax: pageRank.max,
    kmeansHistogram: histogram(chunks.map((chunk) => chunk.topology.kmeansCluster)),
    somCellHistogram: histogram(chunks.map((chunk) => chunk.topology.somCell)),
    featureRevision,
    evidenceRefs: [...new Set(chunks.flatMap((chunk) => chunk.evidenceRefs))].sort(),
    canonicalAuthority: false as const,
  };
}

export function deriveFileRetrievalProfileV1(
  input: {
    chunks: ChunkRetrievalProfileV1[];
    featureRevision: string;
    summary?: string;
  },
): FileRetrievalProfileV1 {
  const chunks = input.chunks.map((chunk) => ChunkRetrievalProfileV1Schema.parse(chunk));
  if (chunks.length === 0) throw new Error('FILE_PROFILE_REQUIRES_CHUNKS');
  const first = chunks[0]!;
  for (const chunk of chunks) {
    if (chunk.repositoryId !== first.repositoryId || chunk.sourceRef !== first.sourceRef || chunk.sourceRevision !== first.sourceRevision) {
      throw new Error('FILE_PROFILE_IDENTITY_MIXED');
    }
  }
  return FileRetrievalProfileV1Schema.parse({
    schema: FILE_RETRIEVAL_PROFILE_SCHEMA,
    profileKey: deriveProfileKeyV1(['file', first.repositoryId, first.sourceRef, first.workspaceRevision, first.sourceRevision, input.featureRevision]),
    repositoryId: first.repositoryId,
    repositoryRelativePath: first.repositoryRelativePath,
    sourceRef: first.sourceRef,
    sourceRevision: first.sourceRevision,
    ...commonAggregate(chunks, input.featureRevision),
    summary: input.summary ?? '',
  });
}

export function deriveDirectoryRetrievalProfileV1(
  input: {
    repositoryId: string;
    path: string;
    files: FileRetrievalProfileV1[];
    chunks: ChunkRetrievalProfileV1[];
    featureRevision: string;
    summary?: string;
    inboundImports?: number;
    outboundImports?: number;
  },
): DirectoryRetrievalProfileV1 {
  const files = input.files.map((file) => FileRetrievalProfileV1Schema.parse(file));
  const chunks = input.chunks.map((chunk) => ChunkRetrievalProfileV1Schema.parse(chunk));
  if (files.length === 0 || chunks.length === 0) throw new Error('DIRECTORY_PROFILE_REQUIRES_FILES_AND_CHUNKS');
  if (files.some((file) => file.repositoryId !== input.repositoryId) || chunks.some((chunk) => chunk.repositoryId !== input.repositoryId)) {
    throw new Error('DIRECTORY_PROFILE_REPOSITORY_MIXED');
  }
  const workspaces = [...new Set([...files.map((file) => file.workspaceRevision), ...chunks.map((chunk) => chunk.workspaceRevision)])];
  if (workspaces.length !== 1) throw new Error('DIRECTORY_PROFILE_WORKSPACE_REVISION_MIXED');
  return DirectoryRetrievalProfileV1Schema.parse({
    schema: DIRECTORY_RETRIEVAL_PROFILE_SCHEMA,
    profileKey: deriveProfileKeyV1(['directory', input.repositoryId, input.path, workspaces[0]!, input.featureRevision]),
    repositoryId: input.repositoryId,
    path: input.path,
    fileCount: files.length,
    inboundImports: input.inboundImports ?? 0,
    outboundImports: input.outboundImports ?? 0,
    ...commonAggregate(chunks, input.featureRevision),
    summary: input.summary ?? '',
  });
}

export const RETRIEVAL_PROFILE_V1_INVARIANTS = Object.freeze({
  canonicalIdentityOwner: 'POSTGRES_PACKET_CHUNK_LINEAGE',
  semanticRepresentation: 'semantic_768',
  fileAndDirectoryProfiles: 'DERIVED_NON_CANONICAL',
  topologyRole: 'FEATURE_ONLY',
  ontologyRole: 'REFERENCE_ONLY',
  executorCountDoesNotCreateVotes: true,
  directoryPriorRecommendedMaxShare: 0.10,
  somGrid: '20x20',
});
