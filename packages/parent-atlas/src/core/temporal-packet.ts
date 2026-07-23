import { z } from 'zod';

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export const LOD_LEVEL_VALUES = ['lod0', 'lod1', 'lod2', 'lod3', 'lod4', 'lod5'] as const;
export const PACKET_KIND_VALUES = [
  'corpus_card',
  'document_summary',
  'section_summary',
  'retrieval_chunk',
  'structural_atom',
  'source_object',
  'graph_context_synthesis',
] as const;

export const lodLevelSchema = z.enum(LOD_LEVEL_VALUES);
export const packetKindSchema = z.enum(PACKET_KIND_VALUES);

export const temporalPacketSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  document_id: z.string().min(1),
  document_version: z.string().min(1),
  content_hash: z.string().min(1),
  lod: lodLevelSchema,
  packet_kind: packetKindSchema,
  authoritative_text: z.string().min(1),
  processing_pass_id: z.string().min(1),
  valid_from: z.string().min(1),
  parent_packet_key: z.string().min(1).nullable().optional(),
  derived_from_packet_ids: z.array(z.string().min(1)).default([]),
  valid_to: z.string().min(1).nullable().optional(),
  transaction_from: z.string().min(1).nullable().optional(),
  transaction_to: z.string().min(1).nullable().optional(),
  is_current: z.boolean().default(true),
  domain_class: z.string().min(1).nullable().optional(),
  summary: z.string().min(1).nullable().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});

export type TemporalPacket = z.infer<typeof temporalPacketSchema>;

export function normalizeTemporalPacket(input: unknown): TemporalPacket {
  return temporalPacketSchema.parse(input);
}

export function describeTemporalPacketContract(): string {
  return normalizeText(
    'Temporal packets preserve versioned source evidence across LOD0 corpus cards through LOD5 immutable source objects, with processing-pass lineage and non-destructive version markers.',
  );
}
