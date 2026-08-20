import { z } from 'zod';
import { aceHypergraphPayloadSchema, type AceHypergraphPayloadV1 } from './ace-hypergraph-payload.js';
import { buildAcePacketV2, type AcePacketV2 } from './ace-packet-v2.js';

export const aceRuntimeEnvelopeSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  canonical_source_ref: z.string().min(1),
  feature_id: z.string().min(1).nullable().optional(),
  source_revision: z.string().min(1).nullable().optional(),
}).strict();

export type AceRuntimeEnvelopeV1 = z.infer<typeof aceRuntimeEnvelopeSchema>;

export function attachHypergraphPayloadToAceEnvelope(input: {
  envelope: AceRuntimeEnvelopeV1;
  hypergraph: AceHypergraphPayloadV1;
  packet_revision: string;
  producer_revision: string;
}): AcePacketV2 {
  const envelope = aceRuntimeEnvelopeSchema.parse(input.envelope);
  const hypergraph = aceHypergraphPayloadSchema.parse(input.hypergraph);
  return buildAcePacketV2({
    packet_revision: input.packet_revision,
    envelope,
    hypergraph,
    producer_revision: input.producer_revision,
  });
}

/**
 * Optional metadata shape for the existing HyperRAGPacketPipeline.
 * TODO(FI-16L): frontend adapter should persist this under versioned metadata
 * only after AcePacketV2 validation; it must not replace canonical_envelope.
 */
export const aceHypergraphMetadataSchema = z.object({
  schema: z.literal('atlas.ace-hypergraph-metadata.v1').default('atlas.ace-hypergraph-metadata.v1'),
  ace_packet_v2: z.custom<AcePacketV2>(),
}).strict();

export type AceHypergraphMetadataV1 = z.infer<typeof aceHypergraphMetadataSchema>;

export function buildAceHypergraphMetadata(packet: AcePacketV2): AceHypergraphMetadataV1 {
  return aceHypergraphMetadataSchema.parse({ ace_packet_v2: packet });
}
