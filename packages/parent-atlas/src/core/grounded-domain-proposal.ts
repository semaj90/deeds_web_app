import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GroundedLangExtractObservationV1 } from './structural-symbol.js';

const groundedIntervalSchema = z.object({
  start_pos: z.number().int().nonnegative(),
  end_pos: z.number().int().positive(),
}).refine((value) => value.end_pos > value.start_pos, 'grounded interval must be non-empty');

export const groundedDomainCandidateSchema = z.object({
  schema: z.literal('atlas.grounded-domain-candidate.v1'),
  candidateId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  extractionId: z.string().min(1),
  extractionClass: z.string().min(1),
  groundedText: z.string().min(1),
  charInterval: groundedIntervalSchema,
  domainId: z.string().min(1),
  taxonomyRevision: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  producerRevision: z.string().min(1),
  status: z.literal('REVIEW_REQUIRED'),
  canonicalAuthority: z.literal(false),
}).strict();

export type GroundedDomainCandidateV1 = z.infer<typeof groundedDomainCandidateSchema>;

function candidateId(observation: GroundedLangExtractObservationV1, domainId: string): string {
  return `domain-candidate:${createHash('sha256')
    .update(JSON.stringify([
      observation.source_ref,
      observation.source_revision,
      observation.extraction_id,
      domainId,
    ]))
    .digest('hex')
    .slice(0, 40)}`;
}

/**
 * Convert grounded observations into reviewable domain candidates only.
 * This function never assigns canonical concept IDs or writes persistence.
 */
export function buildGroundedDomainCandidates(input: {
  observations: GroundedLangExtractObservationV1[];
  extractionClassToDomain: ReadonlyMap<string, string>;
  taxonomyRevision: string;
  producerRevision: string;
  evidenceRefPrefix: string;
}): GroundedDomainCandidateV1[] {
  const candidates: GroundedDomainCandidateV1[] = [];

  for (const observation of input.observations) {
    const domainId = input.extractionClassToDomain.get(observation.extraction_class);
    if (!domainId || !observation.alignment_exact) continue;

    candidates.push(groundedDomainCandidateSchema.parse({
      schema: 'atlas.grounded-domain-candidate.v1',
      candidateId: candidateId(observation, domainId),
      sourceRef: observation.source_ref,
      sourceRevision: observation.source_revision,
      extractionId: observation.extraction_id,
      extractionClass: observation.extraction_class,
      groundedText: observation.extraction_text,
      charInterval: observation.char_interval,
      domainId,
      taxonomyRevision: input.taxonomyRevision,
      confidence: observation.confidence,
      evidenceRefs: [`${input.evidenceRefPrefix}:${observation.extraction_id}`],
      producerRevision: input.producerRevision,
      status: 'REVIEW_REQUIRED',
      canonicalAuthority: false,
    }));
  }

  return candidates;
}
