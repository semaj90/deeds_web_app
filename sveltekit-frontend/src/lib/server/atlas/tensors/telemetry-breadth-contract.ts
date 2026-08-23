import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ATLAS_CANONICAL_SEMANTIC_REPRESENTATION as SEMANTIC_REPRESENTATION_ID } from '../retrieval/qdrant-semantic-projection.js';

export const TELEMETRY_BREADTH_SCHEMA_VERSION = 'atlas.telemetry-breadth.v1' as const;

export const TelemetryBreadthHllKeysSchema = z
  .object({
    workflowHllKey: z.string().min(1),
    symbolHllKey: z.string().min(1),
    sessionHllKey: z.string().min(1),
    userHllKey: z.string().min(1),
    neighborhoodHllKey: z.string().min(1),
    processHllKey: z.string().min(1),
  })
  .strict();

export const TelemetryBreadthEstimatesSchema = z
  .object({
    workflowBreadth: z.number().int().nonnegative(),
    symbolBreadth: z.number().int().nonnegative(),
    sessionBreadth: z.number().int().nonnegative(),
    userBreadth: z.number().int().nonnegative(),
    neighborhoodBreadth: z.number().int().nonnegative(),
    processBreadth: z.number().int().nonnegative(),
  })
  .strict();

export const TelemetryBreadthProvenanceSchema = z
  .object({
    sourceRevision: z.string().min(1),
    representationId: z.literal(SEMANTIC_REPRESENTATION_ID),
    representationRevision: z.string().min(1),
    producerId: z.string().min(1),
    producerRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    telemetryRevision: z.string().min(1),
    inputDigest: z.string().min(1),
    outputDigest: z.string().min(1),
    generatedAt: z.string().datetime(),
    lastVerifiedAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export const TelemetryBreadthV1Schema = z
  .object({
    schemaVersion: z.literal(TELEMETRY_BREADTH_SCHEMA_VERSION),
    breadthId: z.string().min(1),
    packetKey: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    representationId: z.literal(SEMANTIC_REPRESENTATION_ID),
    representationRevision: z.string().min(1),
    producerId: z.string().min(1),
    producerRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    telemetryRevision: z.string().min(1),
    windowStartedAt: z.string().datetime(),
    countedAt: z.string().datetime(),
    generatedAt: z.string().datetime(),
    lastVerifiedAt: z.string().datetime().nullable().optional(),
    hllKeys: TelemetryBreadthHllKeysSchema,
    estimates: TelemetryBreadthEstimatesSchema,
    provenance: TelemetryBreadthProvenanceSchema,
  })
  .strict();

export type TelemetryBreadthV1 = z.infer<typeof TelemetryBreadthV1Schema>;
export type TelemetryBreadthHllKeys = z.infer<typeof TelemetryBreadthHllKeysSchema>;
export type TelemetryBreadthEstimates = z.infer<typeof TelemetryBreadthEstimatesSchema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (Array.isArray(item)) return item;
    if (item && typeof item === 'object') {
      return Object.keys(item as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (item as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return item;
  });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildTelemetryBreadthV1(input: {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  representationRevision: string;
  producerId: string;
  producerRevision: string;
  featureRevision: string;
  telemetryRevision: string;
  windowStartedAt: string;
  countedAt: string;
  generatedAt?: string;
  lastVerifiedAt?: string | null;
  hllKeys: TelemetryBreadthHllKeys;
  estimates: TelemetryBreadthEstimates;
  inputDigest: string;
  outputDigest: string;
}): TelemetryBreadthV1 {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  return TelemetryBreadthV1Schema.parse({
    schemaVersion: TELEMETRY_BREADTH_SCHEMA_VERSION,
    breadthId: `telemetry-breadth:${sha256Hex(
      stableJson({
        packetKey: input.packetKey,
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        representationRevision: input.representationRevision,
        producerId: input.producerId,
        producerRevision: input.producerRevision,
        featureRevision: input.featureRevision,
        telemetryRevision: input.telemetryRevision,
        windowStartedAt: input.windowStartedAt,
        countedAt: input.countedAt,
        hllKeys: input.hllKeys,
        estimates: input.estimates,
        inputDigest: input.inputDigest,
        outputDigest: input.outputDigest,
      }),
    ).slice(0, 24)}`,
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    representationId: SEMANTIC_REPRESENTATION_ID,
    representationRevision: input.representationRevision,
    producerId: input.producerId,
    producerRevision: input.producerRevision,
    featureRevision: input.featureRevision,
    telemetryRevision: input.telemetryRevision,
    windowStartedAt: input.windowStartedAt,
    countedAt: input.countedAt,
    generatedAt,
    lastVerifiedAt: input.lastVerifiedAt ?? null,
    hllKeys: input.hllKeys,
    estimates: input.estimates,
    provenance: {
      sourceRevision: input.sourceRevision,
      representationId: SEMANTIC_REPRESENTATION_ID,
      representationRevision: input.representationRevision,
      producerId: input.producerId,
      producerRevision: input.producerRevision,
      featureRevision: input.featureRevision,
      telemetryRevision: input.telemetryRevision,
      inputDigest: input.inputDigest,
      outputDigest: input.outputDigest,
      generatedAt,
      lastVerifiedAt: input.lastVerifiedAt ?? null,
    },
  });
}
