import { createHash } from 'node:crypto';
import { z } from 'zod';

export const SynthesisOutputV1Schema = z.object({
  answer: z.string().min(1),
  citations: z.array(z.object({
    externalEvidenceId: z.string().startsWith('sha256:'),
    quote: z.string().min(1),
  }).strict()),
  confidence: z.number().min(0).max(1),
}).strict();

export type SynthesisOutputV1 = z.infer<typeof SynthesisOutputV1Schema>;

export const SynthesisReceiptV1Schema = z.object({
  schema: z.literal('atlas.external-research-synthesis-receipt.v1'),
  requestId: z.string().min(1),
  promptPlanChecksum: z.string().min(1),
  contextManifestId: z.string().min(1),
  modelRevision: z.string().min(1),
  responseChecksum: z.string().startsWith('sha256:'),
  citedEvidenceIds: z.array(z.string().startsWith('sha256:')),
  unsupportedCitationCount: z.number().int().nonnegative(),
  output: SynthesisOutputV1Schema,
  canonicalAuthority: z.literal(false),
  mutationAuthority: z.literal(false),
}).strict();

export type SynthesisReceiptV1 = z.infer<typeof SynthesisReceiptV1Schema>;

export function buildSynthesisReceiptV1(input: Omit<SynthesisReceiptV1, 'schema' | 'responseChecksum'>): SynthesisReceiptV1 {
  const responseChecksum = `sha256:${createHash('sha256').update(JSON.stringify(input.output)).digest('hex')}`;
  return SynthesisReceiptV1Schema.parse({ schema: 'atlas.external-research-synthesis-receipt.v1', ...input, responseChecksum });
}

export function validateSynthesisCitations(output: SynthesisOutputV1, allowedEvidenceIds: Set<string>): string[] {
  return output.citations
    .map((citation) => citation.externalEvidenceId)
    .filter((id) => !allowedEvidenceIds.has(id));
}
