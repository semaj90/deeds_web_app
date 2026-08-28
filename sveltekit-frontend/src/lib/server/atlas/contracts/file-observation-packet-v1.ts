import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FILE_OBSERVATION_PACKET_SCHEMA_V1 = 'atlas.file-observation-packet.v1' as const;

const id = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const span = z.object({
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
}).strict().refine((value) => value.endByte >= value.startByte, 'endByte must be >= startByte');

export const observationEvidenceRefV1Schema = z.object({
  ref: id,
  kind: z.enum(['CST', 'AST', 'AST_GREP', 'LSP', 'LEXICAL', 'LANGEXTRACT', 'ONTOLOGY', 'SEMANTIC', 'GRAPH']),
  span: span.nullable().optional(),
  sourceRevision: id,
  producerRevision: id,
}).strict();

export const fileObservationPacketV1Schema = z.object({
  schema: z.literal(FILE_OBSERVATION_PACKET_SCHEMA_V1),
  packetKey: id,
  sourceRef: id,
  sourceRevision: id,
  workspaceRevision: id,
  language: id,
  byteLength: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
  parserRevision: id,
  grammarRevision: id,
  cstDigest: digest,
  treeNodeIds: z.array(id).max(100_000),
  symbols: z.array(id).max(100_000),
  imports: z.array(id).max(100_000),
  exports: z.array(id).max(100_000),
  calls: z.array(id).max(100_000),
  identifiers: z.array(id).max(100_000),
  exactTerms: z.array(id).max(100_000),
  apiNames: z.array(id).max(100_000),
  frameworkNames: z.array(id).max(100_000),
  configKeys: z.array(id).max(100_000),
  envVars: z.array(id).max(100_000),
  routes: z.array(id).max(100_000),
  sqlTables: z.array(id).max(100_000),
  errorCodes: z.array(id).max(100_000),
  testNames: z.array(id).max(100_000),
  astObservations: z.array(id).max(100_000),
  ontologyClasses: z.array(id).max(1_000),
  domainClasses: z.array(id).max(1_000),
  metadata: z.record(z.string(), z.unknown()),
  evidenceRefs: z.array(observationEvidenceRefV1Schema).max(100_000),
  contentDigest: digest,
  producerRevision: id,
  canonicalAuthority: z.literal(false),
}).strict();

export type FileObservationPacketV1 = z.infer<typeof fileObservationPacketV1Schema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export function fileObservationPacketChecksumV1(packet: FileObservationPacketV1): string {
  const parsed = fileObservationPacketV1Schema.parse(packet);
  return createHash('sha256').update(JSON.stringify(canonicalize(parsed))).digest('hex');
}
