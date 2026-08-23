import { createHash } from 'node:crypto';
import { z } from 'zod';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const SpectralRtxFixtureRowV1Schema = z.object({
  ordinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  semantic768: z.array(z.number().finite()).length(768),
  pagerank: z.number().finite().nonnegative(),
}).strict();

export const SpectralRtxAlignmentFixtureV1Schema = z.object({
  schema: z.literal('atlas.spectral-rtx-alignment-fixture.v1'),
  fixtureId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  ordinalMapChecksum: checksum,
  inputChecksum: checksum,
  outputChecksum: checksum,
  backend: z.literal('MOCK_CPU_REFERENCE'),
  cudaArchitecture: z.literal('sm_86'),
  rtxGemm: z.object({
    operation: z.literal('FEATURE_PROJECTION'),
    rows: z.number().int().nonnegative(),
    inputDimension: z.literal(768),
    outputDimension: z.literal(4),
    parity: z.literal('FIXTURE_ONLY'),
  }).strict(),
  spectral: z.object({
    operator: z.literal('NORMALIZED_LAPLACIAN'),
    dimension: z.literal(4),
    clusterCount: z.number().int().min(1).max(32),
    assignments: z.array(z.object({ ordinal: z.number().int().nonnegative(), cluster: z.number().int().nonnegative() }).strict()),
  }).strict(),
  canonicalWritesAllowed: z.literal(false),
  identityAuthority: z.literal(false),
  promotionEligible: z.literal(false),
}).strict();

export type SpectralRtxAlignmentFixtureV1 = z.infer<typeof SpectralRtxAlignmentFixtureV1Schema>;
export type SpectralRtxFixtureRowV1 = z.infer<typeof SpectralRtxFixtureRowV1Schema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/**
 * Deterministic CPU-only double for the future RTX spectral path. It is a
 * fixture generator, not a clustering implementation and cannot be promoted.
 */
export function buildSpectralRtxAlignmentFixtureV1(input: {
  fixtureId: string;
  workspaceRevision: string;
  sourceRevision: string;
  representationRevision: string;
  graphRevision: string;
  ordinalMapChecksum: string;
  rows: readonly SpectralRtxFixtureRowV1[];
  clusterCount?: number;
}): SpectralRtxAlignmentFixtureV1 {
  const rows = input.rows.map((row) => SpectralRtxFixtureRowV1Schema.parse(row)).sort((a, b) => a.ordinal - b.ordinal);
  if (new Set(rows.map((row) => row.ordinal)).size !== rows.length) throw new Error('SPECTRAL_RTX_DUPLICATE_ORDINAL');
  if (new Set(rows.map((row) => row.canonicalId)).size !== rows.length) throw new Error('SPECTRAL_RTX_DUPLICATE_CANONICAL_ID');
  const clusterCount = input.clusterCount ?? 2;
  if (!Number.isInteger(clusterCount) || clusterCount < 1 || clusterCount > 32) throw new Error('SPECTRAL_RTX_INVALID_CLUSTER_COUNT');
  const inputChecksum = sha256({ rows, ordinalMapChecksum: input.ordinalMapChecksum });
  const assignments = rows.map((row) => ({ ordinal: row.ordinal, cluster: Math.abs(Math.floor(row.pagerank * 1_000_000)) % clusterCount }));
  const output = { assignments, clusterCount, dimension: 4 };
  return SpectralRtxAlignmentFixtureV1Schema.parse({
    schema: 'atlas.spectral-rtx-alignment-fixture.v1',
    fixtureId: input.fixtureId,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    representationRevision: input.representationRevision,
    graphRevision: input.graphRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    inputChecksum,
    outputChecksum: sha256(output),
    backend: 'MOCK_CPU_REFERENCE',
    cudaArchitecture: 'sm_86',
    rtxGemm: { operation: 'FEATURE_PROJECTION', rows: rows.length, inputDimension: 768, outputDimension: 4, parity: 'FIXTURE_ONLY' },
    spectral: { operator: 'NORMALIZED_LAPLACIAN', dimension: 4, clusterCount, assignments },
    canonicalWritesAllowed: false,
    identityAuthority: false,
    promotionEligible: false,
  });
}

export function assertSpectralRtxFixtureAligned(input: {
  fixture: SpectralRtxAlignmentFixtureV1;
  workspaceRevision: string;
  sourceRevision: string;
  representationRevision: string;
  graphRevision: string;
  ordinalMapChecksum: string;
}): void {
  const fixture = SpectralRtxAlignmentFixtureV1Schema.parse(input.fixture);
  for (const [key, expected] of Object.entries({ workspaceRevision: input.workspaceRevision, sourceRevision: input.sourceRevision, representationRevision: input.representationRevision, graphRevision: input.graphRevision, ordinalMapChecksum: input.ordinalMapChecksum })) {
    if (fixture[key as keyof typeof fixture] !== expected) throw new Error(`SPECTRAL_RTX_${key.toUpperCase()}_MISMATCH`);
  }
  if (fixture.promotionEligible || fixture.canonicalWritesAllowed || fixture.identityAuthority) throw new Error('SPECTRAL_RTX_FIXTURE_AUTHORITY_VIOLATION');
}


