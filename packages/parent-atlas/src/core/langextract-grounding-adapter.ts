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

/**
 * UTF8_PARSER_BUFFER_V1 grounding (NLP-EXTRACT-03).
 *
 * LangExtract is a Python library: its `char_interval` counts Unicode CODE POINTS. JavaScript string
 * indices count UTF-16 CODE UNITS. They diverge for any astral character (emoji, supplementary CJK),
 * so `source_text.slice(start, end)` is wrong on such text. This function makes the interval basis an
 * explicit input and converts to UTF-8 byte offsets into the parser buffer (the source-text-envelope
 * `parserBuffer`: BOM already stripped, UTF-8 re-encoded, newlines untouched, so CRLF is 2 bytes).
 * Fails closed per extraction; a source revision mismatch rejects the whole batch.
 * No I/O, no writes, canonical_authority is always false.
 */
export const LANGEXTRACT_OFFSET_BASES = ['PYTHON_CODEPOINT', 'UTF16_CODE_UNIT'] as const;
export type LangExtractOffsetBasisV1 = (typeof LANGEXTRACT_OFFSET_BASES)[number];
export const UTF8_PARSER_BUFFER_V1 = 'UTF8_PARSER_BUFFER_V1' as const;

export type Utf8GroundedSpanV1 = {
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  offset_basis: LangExtractOffsetBasisV1;
  source_text_encoding_revision: typeof UTF8_PARSER_BUFFER_V1;
  extraction_class: string;
  char_start: number;
  char_end: number;
  utf8_start_byte: number;
  utf8_end_byte: number;
  slice_sha256: string;
  text_matches_extraction: boolean;
  evidence_checksum: string;
  canonical_authority: false;
};

export type Utf8GroundingRejectionCode =
  | 'NO_INTERVAL'
  | 'INTERVAL_NOT_INCREASING'
  | 'INTERVAL_OUT_OF_RANGE'
  | 'SPLITS_SURROGATE_PAIR';

export function groundLangExtractUtf8SpansV1(input: {
  source_ref: string;
  source_revision: string;
  expected_source_revision: string;
  workspace_revision: string;
  parser_buffer: Uint8Array;
  offset_basis: LangExtractOffsetBasisV1;
  extractions: LangExtractRawExtractionV1[];
}): {
  spans: Utf8GroundedSpanV1[];
  rejections: Array<{ index: number; code: Utf8GroundingRejectionCode }>;
  canonical_authority: false;
  writes_performed: false;
} {
  if (input.source_revision !== input.expected_source_revision) {
    throw new Error('LANGEXTRACT_SOURCE_REVISION_MISMATCH');
  }
  if (!LANGEXTRACT_OFFSET_BASES.includes(input.offset_basis)) {
    throw new Error('LANGEXTRACT_OFFSET_BASIS_UNSUPPORTED');
  }
  const buf = Buffer.from(input.parser_buffer.buffer, input.parser_buffer.byteOffset, input.parser_buffer.byteLength);
  // Fatal decode: a parser buffer that is not valid UTF-8 is a contract violation, not something to repair.
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);

  // Position tables: index in the requested basis -> UTF-8 byte offset.
  const byteAt: number[] = [];
  const unitToByte = new Map<number, number>();
  let bytes = 0;
  let units = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    byteAt.push(bytes);
    unitToByte.set(units, bytes);
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    units += cp > 0xffff ? 2 : 1;
  }
  byteAt.push(bytes);
  unitToByte.set(units, bytes);
  const limit = input.offset_basis === 'PYTHON_CODEPOINT' ? byteAt.length - 1 : units;
  // A UTF-16 index that lands inside a surrogate pair has no entry in unitToByte -> null -> rejected.
  const toByte = (idx: number): number | null =>
    input.offset_basis === 'PYTHON_CODEPOINT' ? byteAt[idx] : (unitToByte.get(idx) ?? null);

  const spans: Utf8GroundedSpanV1[] = [];
  const rejections: Array<{ index: number; code: Utf8GroundingRejectionCode }> = [];
  input.extractions.forEach((rawValue, index) => {
    const raw = langExtractRawExtractionSchema.parse(rawValue);
    const iv = raw.char_interval;
    if (!iv) return void rejections.push({ index, code: 'NO_INTERVAL' });
    if (iv.end_pos <= iv.start_pos) return void rejections.push({ index, code: 'INTERVAL_NOT_INCREASING' });
    if (iv.end_pos > limit) return void rejections.push({ index, code: 'INTERVAL_OUT_OF_RANGE' });
    const b0 = toByte(iv.start_pos);
    const b1 = toByte(iv.end_pos);
    if (b0 === null || b1 === null) return void rejections.push({ index, code: 'SPLITS_SURROGATE_PAIR' });
    const slice = buf.subarray(b0, b1);
    const sliceSha = createHash('sha256').update(slice).digest('hex');
    spans.push({
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      workspace_revision: input.workspace_revision,
      offset_basis: input.offset_basis,
      source_text_encoding_revision: UTF8_PARSER_BUFFER_V1,
      extraction_class: raw.extraction_class,
      char_start: iv.start_pos,
      char_end: iv.end_pos,
      utf8_start_byte: b0,
      utf8_end_byte: b1,
      slice_sha256: sliceSha,
      text_matches_extraction: slice.toString('utf8') === raw.extraction_text,
      evidence_checksum: sha256(JSON.stringify([
        input.source_ref, input.source_revision, input.workspace_revision, input.offset_basis,
        UTF8_PARSER_BUFFER_V1, raw.extraction_class, b0, b1, sliceSha,
      ])),
      canonical_authority: false,
    });
  });
  return { spans, rejections, canonical_authority: false, writes_performed: false };
}
