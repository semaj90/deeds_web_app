import { z } from 'zod';

const revisionSchema = z.string().min(1);

export const xgboostTracePacketReferenceSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  workspace_revision: revisionSchema,
  source_revision: revisionSchema,
  representation_id: z.literal('semantic_768'),
  representation_revision: revisionSchema,
  retrieval_rank: z.number().int().nonnegative(),
});

export type XgboostTracePacketReference = z.infer<typeof xgboostTracePacketReferenceSchema>;

export function validateXgboostTracePacketReference(input: unknown): XgboostTracePacketReference {
  return xgboostTracePacketReferenceSchema.parse(input);
}

export function validateXgboostTracePacketReferences(input: unknown): XgboostTracePacketReference[] {
  const references = z.array(xgboostTracePacketReferenceSchema).parse(input);
  const packetKeys = new Set<string>();
  for (const reference of references) {
    if (packetKeys.has(reference.packet_key)) {
      throw new Error('XGBOOST_TRACE_PACKET_REFERENCE_DUPLICATE_PACKET_KEY');
    }
    packetKeys.add(reference.packet_key);
  }
  return references;
}
