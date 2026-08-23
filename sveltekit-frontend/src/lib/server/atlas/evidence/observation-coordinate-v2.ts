import { createHash } from 'node:crypto';
import { z } from 'zod';

export const OBSERVATION_COORDINATE_SCHEMA_V2 = 'atlas.observation-coordinate.v2' as const;

export const observationProviderV2Schema = z.enum([
  'NODE_TREE_SITTER',
  'TREESITTER_CHUNKER',
  'AST_GREP',
  'TS_MORPH',
  'LANGEXTRACT',
  'STANZA',
]);
export type ObservationProviderV2 = z.infer<typeof observationProviderV2Schema>;

export const observationUnitV2Schema = z.enum([
  'SYMBOL',
  'CHUNK',
  'PATTERN_MATCH',
  'SEMANTIC_ENRICHMENT',
  'GROUNDED_EXTRACTION',
  'LINGUISTIC_OBSERVATION',
]);
export type ObservationUnitV2 = z.infer<typeof observationUnitV2Schema>;

const revision = z.string().min(1);
const byteOffset = z.number().int().nonnegative();

export const observationCoordinateV2Schema = z.object({
  schema: z.literal(OBSERVATION_COORDINATE_SCHEMA_V2),
  provider: observationProviderV2Schema,
  observationUnit: observationUnitV2Schema,
  sourceRef: z.string().min(1),
  workspaceRevision: revision,
  sourceRevision: revision,
  providerRevision: revision,
  producerRevision: revision,
  startByte: byteOffset,
  endByte: byteOffset,
  evidenceKey: z.string().min(1),
  lineageQualified: z.literal(true),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((row, ctx) => {
  if (row.endByte < row.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'OBSERVATION_COORDINATE_END_BEFORE_START' });
  }
});
export type ObservationCoordinateV2 = z.infer<typeof observationCoordinateV2Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`).join(',')}}`;
}

export function makeObservationEvidenceKeyV2(input: Omit<
  z.input<typeof observationCoordinateV2Schema>,
  'schema' | 'evidenceKey' | 'lineageQualified' | 'canonicalAuthority'
>): string {
  const parsed = z.object({
    provider: observationProviderV2Schema,
    observationUnit: observationUnitV2Schema,
    sourceRef: z.string().min(1),
    workspaceRevision: revision,
    sourceRevision: revision,
    providerRevision: revision,
    producerRevision: revision,
    startByte: byteOffset,
    endByte: byteOffset,
  }).strict().parse(input);
  if (parsed.endByte < parsed.startByte) throw new Error('OBSERVATION_COORDINATE_END_BEFORE_START');
  return `obs2:${createHash('sha256').update(canonicalJson(parsed), 'utf8').digest('hex')}`;
}

export function materializeObservationCoordinateV2(input: Omit<
  z.input<typeof observationCoordinateV2Schema>,
  'schema' | 'evidenceKey' | 'lineageQualified' | 'canonicalAuthority'
>): ObservationCoordinateV2 {
  return observationCoordinateV2Schema.parse({
    ...input,
    schema: OBSERVATION_COORDINATE_SCHEMA_V2,
    evidenceKey: makeObservationEvidenceKeyV2(input),
    lineageQualified: true,
    canonicalAuthority: false,
  });
}
