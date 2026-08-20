import { z } from 'zod';
import {
  langExtractRawExtractionSchema,
  type LangExtractRawExtractionV1,
} from './langextract-grounding-adapter.js';

const legacyGroundedExtractionSchema = z.object({
  class: z.string().min(1),
  text: z.string().min(1),
  start_char: z.number().int().nonnegative().nullable().optional(),
  end_char: z.number().int().nonnegative().nullable().optional(),
  char_interval: z.object({
    start_pos: z.number().int().nonnegative().nullable().optional(),
    end_pos: z.number().int().nonnegative().nullable().optional(),
  }).nullable().optional(),
  alignment_status: z.enum(['match_exact', 'match_greater', 'match_lesser', 'match_fuzzy']).nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().finite().min(0).max(1).optional(),
}).passthrough();

function scalarAttributes(value: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      out[key] = item;
    } else {
      out[key] = JSON.stringify(item);
    }
  }
  return out;
}

/**
 * Bridges current 8095 metadata (`class`, `text`, legacy start_char/end_char)
 * and the newer LangExtract-native `char_interval` shape into one raw contract.
 *
 * TODO(8095-grounding): once the Python sidecar calls
 * `normalize_langextract_extraction()` directly, remove legacy start_char/end_char
 * compatibility and require char_interval + alignment_status from the service.
 */
export function adaptSidecarGroundedExtractions(metadata: Record<string, unknown>): LangExtractRawExtractionV1[] {
  const raw = metadata.grounded_extractions;
  if (!Array.isArray(raw)) return [];

  const output: LangExtractRawExtractionV1[] = [];
  for (const candidate of raw) {
    const parsed = legacyGroundedExtractionSchema.safeParse(candidate);
    if (!parsed.success) continue;

    const interval = parsed.data.char_interval
      ?? (
        parsed.data.start_char != null && parsed.data.end_char != null
          ? { start_pos: parsed.data.start_char, end_pos: parsed.data.end_char }
          : null
      );

    const start = interval?.start_pos;
    const end = interval?.end_pos;
    output.push(langExtractRawExtractionSchema.parse({
      extraction_class: parsed.data.class,
      extraction_text: parsed.data.text,
      char_interval: start != null && end != null ? { start_pos: start, end_pos: end } : null,
      alignment_status: parsed.data.alignment_status ?? null,
      attributes: scalarAttributes(parsed.data.attributes),
      confidence: parsed.data.confidence ?? 1,
    }));
  }

  return output;
}
