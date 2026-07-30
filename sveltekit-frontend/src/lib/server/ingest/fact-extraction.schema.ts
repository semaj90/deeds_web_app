import { z } from 'zod';

/**
 * Fact extraction schemas for Phase 110 Gate G13
 * Validates output from Gemma4 fact extraction before persistence to atlas_facts
 */

export const factArgumentSchema = z.object({
  argument_index: z.number().int().min(0).max(255),
  argument_name: z.enum([
    'subject',
    'object',
    'predicate',
    'temporal_anchor',
    'location',
    'event',
    'entity',
    'other'
  ]),
  argument_value: z.string().min(1).max(1000),
  argument_type: z.enum([
    'entity',
    'event',
    'location',
    'temporal',
    'numeric',
    'boolean',
    'relation',
    'other'
  ]),
});

export type FactArgument = z.infer<typeof factArgumentSchema>;

export const extractedFactSchema = z.object({
  packet_key: z.string().min(1).max(255),
  source_ref: z.string().min(1).max(1024),
  fact_text: z.string().min(10).max(2000),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  reasoning_trace: z.string().max(5000).optional(),
  arguments: z.array(factArgumentSchema).min(0).max(10),
});

export type ExtractedFact = z.infer<typeof extractedFactSchema>;

/**
 * Batch extraction result (returned by Gate G13)
 */
export const batchExtractedFactsSchema = z.object({
  packet_key: z.string(),
  source_ref: z.string(),
  facts: z.array(extractedFactSchema),
  extraction_duration_ms: z.number().int().min(0),
  model_used: z.string(),
  extracted_at: z.string().datetime(),
});

export type BatchExtractedFacts = z.infer<typeof batchExtractedFactsSchema>;
