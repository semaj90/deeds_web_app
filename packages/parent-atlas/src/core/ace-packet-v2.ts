import { z } from 'zod';
import { aceHypergraphPayloadSchema } from './ace-hypergraph-payload.js';

const revisionSchema = z.string().min(1);

/**
 * Minimal projection of the existing CanonicalAcePacketEnvelope identity surface.
 * The frontend envelope remains the canonical owner; this projection exists only
 * so Parent Atlas can verify identity compatibility before attaching hypergraph evidence.
 */
export const aceCanonicalEnvelopeProjectionSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  canonical_source_ref: z.string().min(1),
  feature_id: z.string().min(1).nullable().optional(),
  source_revision: revisionSchema.nullable().optional(),
}).strict();

export const acePacketV2Schema = z.object({
  schema: z.literal('atlas.ace-packet.v2').default('atlas.ace-packet.v2'),
  packet_revision: revisionSchema,
  envelope: aceCanonicalEnvelopeProjectionSchema,
  hypergraph: aceHypergraphPayloadSchema,
  producer_revision: revisionSchema,
}).strict().superRefine((value, ctx) => {
  if (value.envelope.packet_key !== value.hypergraph.packet_key) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'envelope.packet_key must match hypergraph.packet_key',
      path: ['hypergraph', 'packet_key'],
    });
  }
  if (value.envelope.source_ref !== value.hypergraph.source_ref) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'envelope.source_ref must match hypergraph.source_ref',
      path: ['hypergraph', 'source_ref'],
    });
  }
  const envelopeFeature = value.envelope.feature_id ?? null;
  const hypergraphFeature = value.hypergraph.feature_id ?? null;
  if (envelopeFeature !== hypergraphFeature) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'envelope.feature_id must match hypergraph.feature_id',
      path: ['hypergraph', 'feature_id'],
    });
  }
  if (
    value.envelope.source_revision &&
    value.hypergraph.lineage.source_snapshot_revision === value.envelope.source_revision
  ) {
    // Equality is permitted but not required: source snapshot revision and source
    // file revision are different revision domains. This branch documents that we
    // deliberately do not conflate them.
  }
});

export type AceCanonicalEnvelopeProjectionV1 = z.infer<typeof aceCanonicalEnvelopeProjectionSchema>;
export type AcePacketV2 = z.infer<typeof acePacketV2Schema>;

export function buildAcePacketV2(input: z.input<typeof acePacketV2Schema>): AcePacketV2 {
  return acePacketV2Schema.parse({
    schema: 'atlas.ace-packet.v2',
    ...input,
  });
}
