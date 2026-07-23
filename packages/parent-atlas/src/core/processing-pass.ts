import { z } from 'zod';

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export const PROCESSING_PASS_STATUS_VALUES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'interrupted',
] as const;

export const processingPassStatusSchema = z.enum(PROCESSING_PASS_STATUS_VALUES);

export const processingPassSchema = z.object({
  processing_pass_id: z.string().min(1),
  processor_name: z.string().min(1),
  processor_version: z.string().min(1),
  contract_version: z.string().min(1),
  input_packet_ids: z.array(z.string().min(1)).default([]),
  input_content_hashes: z.array(z.string().min(1)).default([]),
  output_packet_ids: z.array(z.string().min(1)).default([]),
  output_content_hashes: z.array(z.string().min(1)).default([]),
  started_at: z.string().min(1),
  completed_at: z.string().min(1).nullable().optional(),
  status: processingPassStatusSchema,
  trace_id: z.string().min(1).nullable().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});

export type ProcessingPass = z.infer<typeof processingPassSchema>;

export function normalizeProcessingPass(input: unknown): ProcessingPass {
  return processingPassSchema.parse(input);
}

export function describeProcessingPassContract(): string {
  return normalizeText(
    'Processing passes bind every summary, chunk, embedding, classification, and graph edge to a recorded processor, contract version, trace ID, and evidence set.',
  );
}
