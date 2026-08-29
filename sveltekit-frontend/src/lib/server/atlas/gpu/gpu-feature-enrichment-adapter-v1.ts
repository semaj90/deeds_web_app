import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AceCardV2Schema, type AceCardV2 } from '../context/ace-card-selection-v2.js';

const checksum = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const ordinalMapChecksum = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/i);

const GraphFeatureRowV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  graphFeaturePresent: z.boolean(),
  pagerankMax: z.number().finite().nullable(),
  pagerankMean: z.number().finite().nullable(),
  pagerankSum: z.number().finite().nullable(),
  graphNodeCount: z.number().int().nonnegative().nullable(),
  presence: z.object({ pagerank: z.number().int().min(0).max(1), graphNodeCount: z.number().int().min(0).max(1) }).strict(),
}).strict();

export const GpuFeatureEnrichmentResponseV1Schema = z.object({
  status: z.literal('GPU_TILE_GRAPH_FEATURE_ENRICHMENT_PROVEN_BOUNDED'),
  artifactChecksum: checksum,
  graphRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  candidateCount: z.number().int().nonnegative(),
  graphFeaturePresentCount: z.number().int().nonnegative(),
  graphFeatureAbsentCount: z.number().int().nonnegative(),
  rows: z.array(GraphFeatureRowV1Schema),
  rankingPromotion: z.literal(false),
  logicalLaneVote: z.literal('NONE'),
  canonicalAuthority: z.literal(false),
  writes: z.object({ postgres: z.literal(false), qdrant: z.literal(false), valkey: z.literal(false) }).strict(),
}).strict();

const GpuFeatureEnrichmentBundleBodyV1Schema = z.object({
  schema: z.literal('atlas.gpu-feature-enrichment-bundle.v1'),
  artifactChecksum: checksum,
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum,
  graphRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  candidateCount: z.number().int().nonnegative(),
  graphFeaturePresentCount: z.number().int().nonnegative(),
  graphFeatureAbsentCount: z.number().int().nonnegative(),
  rows: z.array(GraphFeatureRowV1Schema),
  rankingPromotion: z.literal(false),
  logicalLaneVote: z.literal('NONE'),
  canonicalAuthority: z.literal(false),
}).strict();

export const GpuFeatureEnrichmentBundleV1Schema = GpuFeatureEnrichmentBundleBodyV1Schema.extend({ bundleChecksum: checksum });
export type GpuFeatureEnrichmentBundleV1 = z.infer<typeof GpuFeatureEnrichmentBundleV1Schema>;

export interface GpuFeatureCandidateIdentityV1 {
  candidateOrdinal: number;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

export function adaptGpuFeatureEnrichmentV1(input: {
  response: unknown;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  expectedCandidateOrdinals: readonly number[];
}): GpuFeatureEnrichmentBundleV1 {
  const response = GpuFeatureEnrichmentResponseV1Schema.parse(input.response);
  const expected = [...input.expectedCandidateOrdinals].sort((a, b) => a - b);
  const actual = response.rows.map((row) => row.candidateOrdinal).sort((a, b) => a - b);
  if (response.candidateCount !== expected.length) throw new Error('GPU_FEATURE_CANDIDATE_COUNT_MISMATCH');
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('GPU_FEATURE_CANDIDATE_ORDINAL_MISMATCH');
  if (new Set(response.rows.map((row) => row.candidateOrdinal)).size !== response.rows.length) throw new Error('GPU_FEATURE_DUPLICATE_CANDIDATE_ORDINAL');
  if (response.graphFeaturePresentCount + response.graphFeatureAbsentCount !== response.candidateCount) throw new Error('GPU_FEATURE_PRESENCE_COUNT_MISMATCH');
  const body = GpuFeatureEnrichmentBundleBodyV1Schema.parse({
    schema: 'atlas.gpu-feature-enrichment-bundle.v1',
    artifactChecksum: response.artifactChecksum,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    graphRevision: response.graphRevision,
    featureRevision: response.featureRevision,
    candidateCount: response.candidateCount,
    graphFeaturePresentCount: response.graphFeaturePresentCount,
    graphFeatureAbsentCount: response.graphFeatureAbsentCount,
    rows: response.rows.slice().sort((a, b) => a.candidateOrdinal - b.candidateOrdinal),
    rankingPromotion: false,
    logicalLaneVote: 'NONE',
    canonicalAuthority: false,
  });
  return GpuFeatureEnrichmentBundleV1Schema.parse({ ...body, bundleChecksum: digest(body) });
}

/** Converts only observed graph features into ACE cards; absent features are not evidence. */
export function gpuFeatureBundleToAceCardsV1(input: {
  bundle: GpuFeatureEnrichmentBundleV1;
  workspaceRevision: string;
  candidates: readonly GpuFeatureCandidateIdentityV1[];
}): AceCardV2[] {
  const identityByOrdinal = new Map(input.candidates.map((candidate) => [candidate.candidateOrdinal, candidate]));
  return input.bundle.rows.filter((row) => row.graphFeaturePresent).map((row) => {
    const candidate = identityByOrdinal.get(row.candidateOrdinal);
    if (!candidate) throw new Error(`GPU_FEATURE_ACE_CANDIDATE_MISSING:${row.candidateOrdinal}`);
    if (candidate.workspaceRevision !== input.workspaceRevision) throw new Error(`GPU_FEATURE_ACE_WORKSPACE_REVISION_INVALID:${row.candidateOrdinal}`);
    const evidenceRef = `graph:${input.bundle.graphRevision}:${row.candidateOrdinal}`;
    const semantic = `PageRank max ${row.pagerankMax} mean ${row.pagerankMean} sum ${row.pagerankSum}; graph nodes ${row.graphNodeCount}`;
    const body = {
      schema: 'atlas.ace-card.v2' as const,
      cardId: `gpu-graph:${input.bundle.bundleChecksum}:${row.candidateOrdinal}`,
      cardChecksum: digest({ bundleChecksum: input.bundle.bundleChecksum, candidateOrdinal: row.candidateOrdinal, graphRevision: input.bundle.graphRevision, featureRevision: input.bundle.featureRevision }),
      cardKind: 'GRAPH' as const,
      candidateOrdinal: row.candidateOrdinal,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      candidateSnapshotRevision: input.bundle.candidateSnapshotRevision,
      ordinalMapChecksum: input.bundle.ordinalMapChecksum,
      sourceRef: candidate.sourceRef,
      evidenceRefs: [evidenceRef],
      title: `Graph features for ${candidate.sourceRef}`,
      lod0Identity: `${candidate.packetKey}#candidate-${row.candidateOrdinal}`,
      lod1Structural: null,
      lod2Extractive: null,
      lod3Semantic: semantic,
      lexicalTerms: ['graph', 'pagerank', 'topology'],
      concepts: ['GraphFeature'],
      domains: ['topology'],
      tokenEstimate: semantic.split(/\s+/).length,
      canonicalAuthority: false as const,
    };
    return AceCardV2Schema.parse(body);
  }).sort((a, b) => (a.candidateOrdinal ?? Number.MAX_SAFE_INTEGER) - (b.candidateOrdinal ?? Number.MAX_SAFE_INTEGER));
}
