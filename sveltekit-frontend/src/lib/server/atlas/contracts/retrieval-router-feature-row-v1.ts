import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ObservationFeatureProjectionV1Schema,
  type ObservationFeatureProjectionV1,
} from './observation-feature-projection-v1.js';

const bit = z.union([z.literal(0), z.literal(1)]);
const mask32 = z.array(bit).length(32);

export const SemanticFeatureV1Schema = z.object({
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  dimension: z.literal(768),
  cosine: z.number().min(-1).max(1).nullable(),
}).strict();

export const LatentRoutingFeatureV1Schema = z.object({
  representationId: z.literal('latent_64'),
  autoencoderRevision: z.string().min(1),
  dimension: z.literal(64),
  vector: z.array(z.number().finite()).length(64).nullable(),
}).strict();

export const RetrievalRouterFeatureRowV1Schema = z.object({
  schema: z.literal('atlas.retrieval-router-feature-row.v1'),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  treeNodeId: z.string().min(1).nullable(),
  sourceVersionReceiptId: z.string().min(1).nullable(),
  reconciliationReceiptId: z.string().min(1).nullable(),
  workspaceRevision: z.number().int().nonnegative().nullable(),
  featureRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable(),

  semantic: SemanticFeatureV1Schema,
  latent: LatentRoutingFeatureV1Schema.nullable(),

  structure: z.object({
    hasFunction: z.boolean(),
    hasCall: z.boolean(),
    hasDatabaseAccess: z.boolean(),
    hasNetworkCall: z.boolean(),
    hasTest: z.boolean(),
    hasErrorHandler: z.boolean(),
    astPatternMask: mask32,
  }).strict(),

  ontology: z.object({
    mask: mask32,
    classes: z.array(z.string().min(1)).max(64),
  }).strict(),

  lexical: z.object({
    nounDensity: z.number().min(0).max(1).nullable(),
    verbDensity: z.number().min(0).max(1).nullable(),
    identifierOverlap: z.number().min(0).max(1).nullable(),
    bm25Score: z.number().nullable(),
    bm42ChallengerScore: z.number().nullable(),
  }).strict(),

  graph: z.object({
    pageRank: z.number().nonnegative().nullable(),
    personalizedPageRank: z.number().nonnegative().nullable(),
    degree: z.number().int().nonnegative().nullable(),
    communityId: z.string().min(1).nullable(),
    hopDistance: z.number().int().nonnegative().nullable(),
  }).strict(),

  cluster: z.object({
    kmeansClusterId: z.number().int().nonnegative().nullable(),
    kmeansProbability: z.number().min(0).max(1).nullable(),
    somRow: z.number().int().nonnegative().nullable(),
    somCol: z.number().int().nonnegative().nullable(),
    somDistance: z.number().nonnegative().nullable(),
  }).strict(),

  temporal: z.object({
    recency: z.number().min(0).max(1).nullable(),
    changeFrequency: z.number().nonnegative().nullable(),
    mutationStatus: z.enum(['FRESH', 'UNKNOWN', 'STALE', 'MISSING']),
  }).strict(),

  evidence: z.object({
    groundingExact: z.boolean(),
    validatorPassed: z.boolean(),
    authorityWeight: z.number().min(0).max(1).nullable(),
    evidenceRefs: z.array(z.string().min(1)).max(128),
  }).strict(),

  flattenedTags: z.array(z.string().min(1)).max(192),
  rowDigest: z.string().length(64),
}).strict();

export type RetrievalRouterFeatureRowV1 = z.infer<typeof RetrievalRouterFeatureRowV1Schema>;

export interface BuildRetrievalRouterFeatureRowInputV1 {
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string;
  sourceRef: string;
  treeNodeId?: string | null;
  sourceVersionReceiptId?: string | null;
  reconciliationReceiptId?: string | null;
  workspaceRevision?: number | null;
  featureRevision: string;
  graphRevision?: string | null;
  observation: ObservationFeatureProjectionV1;
  semantic: z.input<typeof SemanticFeatureV1Schema>;
  latent?: z.input<typeof LatentRoutingFeatureV1Schema> | null;
  lexical?: Partial<z.infer<typeof RetrievalRouterFeatureRowV1Schema>['lexical']>;
  graph?: Partial<z.infer<typeof RetrievalRouterFeatureRowV1Schema>['graph']>;
  cluster?: Partial<z.infer<typeof RetrievalRouterFeatureRowV1Schema>['cluster']>;
  temporal?: Partial<z.infer<typeof RetrievalRouterFeatureRowV1Schema>['temporal']>;
  evidence?: Partial<z.infer<typeof RetrievalRouterFeatureRowV1Schema>['evidence']>;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildRetrievalRouterFeatureRowV1(
  input: BuildRetrievalRouterFeatureRowInputV1,
): RetrievalRouterFeatureRowV1 {
  const observation = ObservationFeatureProjectionV1Schema.parse(input.observation);
  if (observation.packetKey !== input.packetKey || observation.sourceRef !== input.sourceRef) {
    throw new Error('ORF_IDENTITY_MISMATCH');
  }

  const rowWithoutDigest = {
    schema: 'atlas.retrieval-router-feature-row.v1' as const,
    candidateOrdinal: input.candidateOrdinal,
    canonicalId: input.canonicalId,
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    treeNodeId: input.treeNodeId ?? observation.treeNodeId,
    sourceVersionReceiptId: input.sourceVersionReceiptId ?? observation.sourceVersionReceiptId,
    reconciliationReceiptId: input.reconciliationReceiptId ?? null,
    workspaceRevision: input.workspaceRevision ?? null,
    featureRevision: input.featureRevision,
    graphRevision: input.graphRevision ?? null,
    semantic: SemanticFeatureV1Schema.parse(input.semantic),
    latent: input.latent ? LatentRoutingFeatureV1Schema.parse(input.latent) : null,
    structure: {
      hasFunction: observation.hasFunction,
      hasCall: observation.hasCall,
      hasDatabaseAccess: observation.hasDatabaseAccess,
      hasNetworkCall: observation.hasNetworkCall,
      hasTest: observation.hasTest,
      hasErrorHandler: observation.hasErrorHandler,
      astPatternMask: observation.astPatternMask,
    },
    ontology: {
      mask: observation.ontologyMask,
      classes: observation.ontologyClasses,
    },
    lexical: {
      nounDensity: input.lexical?.nounDensity ?? null,
      verbDensity: input.lexical?.verbDensity ?? null,
      identifierOverlap: input.lexical?.identifierOverlap ?? null,
      bm25Score: input.lexical?.bm25Score ?? null,
      bm42ChallengerScore: input.lexical?.bm42ChallengerScore ?? null,
    },
    graph: {
      pageRank: input.graph?.pageRank ?? null,
      personalizedPageRank: input.graph?.personalizedPageRank ?? null,
      degree: input.graph?.degree ?? null,
      communityId: input.graph?.communityId ?? null,
      hopDistance: input.graph?.hopDistance ?? null,
    },
    cluster: {
      kmeansClusterId: input.cluster?.kmeansClusterId ?? null,
      kmeansProbability: input.cluster?.kmeansProbability ?? null,
      somRow: input.cluster?.somRow ?? null,
      somCol: input.cluster?.somCol ?? null,
      somDistance: input.cluster?.somDistance ?? null,
    },
    temporal: {
      recency: input.temporal?.recency ?? null,
      changeFrequency: input.temporal?.changeFrequency ?? null,
      mutationStatus: input.temporal?.mutationStatus ?? 'UNKNOWN',
    },
    evidence: {
      groundingExact: input.evidence?.groundingExact ?? false,
      validatorPassed: input.evidence?.validatorPassed ?? false,
      authorityWeight: input.evidence?.authorityWeight ?? null,
      evidenceRefs: input.evidence?.evidenceRefs ?? observation.evidenceRefs,
    },
    flattenedTags: observation.flattenedTags,
  };

  return RetrievalRouterFeatureRowV1Schema.parse({
    ...rowWithoutDigest,
    rowDigest: digest(rowWithoutDigest),
  });
}
