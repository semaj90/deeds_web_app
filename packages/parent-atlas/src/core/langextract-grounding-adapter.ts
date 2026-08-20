import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  groundedLangExtractObservationSchema,
  langExtractAlignmentStatusSchema,
  type GroundedLangExtractObservationV1,
} from './structural-symbol.js';

const revision = z.string().min(1);

export const langExtractRawExtractionSchema = z.object({
  extraction_class: z.string().min(1),
  extraction_text: z.string().min(1),
  char_interval: z.object({
    start_pos: z.number().int().nonnegative(),
    end_pos: z.number().int().nonnegative(),
  }).nullable().optional(),
  alignment_status: langExtractAlignmentStatusSchema.nullable().optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  confidence: z.number().finite().min(0).max(1).default(1),
}).strict();

export const langExtractGroundingReceiptSchema = z.object({
  schema: z.literal('atlas.langextract-grounding-receipt.v1').default('atlas.langextract-grounding-receipt.v1'),
  source_ref: z.string().min(1),
  source_revision: revision,
  input_count: z.number().int().nonnegative(),
  grounded_count: z.number().int().nonnegative(),
  exact_alignment_count: z.number().int().nonnegative(),
  fuzzy_or_expanded_alignment_count: z.number().int().nonnegative(),
  unknown_alignment_count: z.number().int().nonnegative(),
  rejected_ungrounded_count: z.number().int().nonnegative(),
  rejected_invalid_interval_count: z.number().int().nonnegative(),
  producer_revision: revision,
}).strict();

export type LangExtractRawExtractionV1 = z.infer<typeof langExtractRawExtractionSchema>;
export type LangExtractGroundingReceiptV1 = z.infer<typeof langExtractGroundingReceiptSchema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stringAttributes(value: LangExtractRawExtractionV1['attributes']): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item === null ? 'null' : String(item)]));
}

/**
 * LangExtract results without a source interval are rejected from canonical
 * evidence. Grounded fuzzy/expanded alignments are retained, but remain weaker
 * evidence than match_exact and are counted separately in the receipt.
 */
export function adaptGroundedLangExtract(input: {
  source_ref: string;
  source_revision: string;
  source_text: string;
  extractor_revision: string;
  producer_revision: string;
  extractions: LangExtractRawExtractionV1[];
}): { observations: GroundedLangExtractObservationV1[]; receipt: LangExtractGroundingReceiptV1 } {
  const observations: GroundedLangExtractObservationV1[] = [];
  let rejectedUngrounded = 0;
  let rejectedInvalid = 0;
  let exactAlignment = 0;
  let fuzzyOrExpanded = 0;
  let unknownAlignment = 0;

  for (const rawValue of input.extractions) {
    const raw = langExtractRawExtractionSchema.parse(rawValue);
    const interval = raw.char_interval;
    if (!interval) {
      rejectedUngrounded += 1;
      continue;
    }
    if (interval.end_pos <= interval.start_pos || interval.end_pos > input.source_text.length) {
      rejectedInvalid += 1;
      continue;
    }

    const groundedText = input.source_text.slice(interval.start_pos, interval.end_pos);
    if (groundedText.length === 0) {
      rejectedInvalid += 1;
      continue;
    }

    const alignmentExact = raw.alignment_status === 'match_exact';
    if (alignmentExact) exactAlignment += 1;
    else if (raw.alignment_status) fuzzyOrExpanded += 1;
    else unknownAlignment += 1;

    observations.push(groundedLangExtractObservationSchema.parse({
      extraction_id: `langextract:${sha256(JSON.stringify([
        input.source_ref,
        input.source_revision,
        raw.extraction_class,
        interval.start_pos,
        interval.end_pos,
        raw.extraction_text,
        raw.alignment_status ?? null,
      ])).slice(0, 40)}`,
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      extraction_class: raw.extraction_class,
      extraction_text: raw.extraction_text,
      char_interval: interval,
      alignment_status: raw.alignment_status ?? null,
      alignment_exact: alignmentExact,
      attributes: {
        ...stringAttributes(raw.attributes),
        grounded_text_hash: sha256(groundedText),
        alignment_status: raw.alignment_status ?? 'unknown',
      },
      confidence: raw.confidence,
      extractor_revision: input.extractor_revision,
      canonical_authority: false,
    }));
  }

  return {
    observations,
    receipt: langExtractGroundingReceiptSchema.parse({
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      input_count: input.extractions.length,
      grounded_count: observations.length,
      exact_alignment_count: exactAlignment,
      fuzzy_or_expanded_alignment_count: fuzzyOrExpanded,
      unknown_alignment_count: unknownAlignment,
      rejected_ungrounded_count: rejectedUngrounded,
      rejected_invalid_interval_count: rejectedInvalid,
      producer_revision: input.producer_revision,
    }),
  };
}
