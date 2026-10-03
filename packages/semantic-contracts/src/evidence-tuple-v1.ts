import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalHashJSON } from './canonical-hashing.js';

const Sha256RefSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const EvidenceTupleUnsignedV1Schema = z.object({
  schema: z.literal('atlas.evidence-tuple.v1'),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  session_id: z.string().min(1),
  source_path: z.string().min(1),
  byte_start: z.number().int().nonnegative().safe(),
  byte_end: z.number().int().nonnegative().safe(),
  raw_sha256: Sha256RefSchema,
  severity: z.string().min(1),
}).strict().superRefine((tuple, context) => {
  if (tuple.byte_end <= tuple.byte_start) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['byte_end'],
      message: 'byte_end must be greater than byte_start',
    });
  }
});

export const EvidenceTupleV1Schema = EvidenceTupleUnsignedV1Schema.extend({
  event_id: Sha256RefSchema,
}).strict().superRefine((tuple, context) => {
  const { event_id, ...unsigned } = tuple;
  const expected = `sha256:${canonicalHashJSON(unsigned)}`;
  if (event_id !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['event_id'],
      message: 'event_id does not match the canonical envelope content',
    });
  }
});

export type EvidenceTupleV1 = z.infer<typeof EvidenceTupleV1Schema>;
export type EvidenceTupleV1Input = Omit<EvidenceTupleV1, 'event_id'>;

export type EvidenceTupleRawSpanInputV1 = {
  sourceBytes: Uint8Array;
  sourcePath: string;
  byteStart: number;
  byteEnd: number;
  sessionId: string;
  subject: string;
  predicate: string;
  object: string;
  severity: string;
};

/** Builds a content-addressed evidence pointer; it does not read or persist source data. */
export function createEvidenceTupleV1(input: EvidenceTupleV1Input): EvidenceTupleV1 {
  const unsigned = EvidenceTupleUnsignedV1Schema.parse(input);
  return EvidenceTupleV1Schema.parse({
    ...unsigned,
    event_id: `sha256:${canonicalHashJSON(unsigned)}`,
  });
}

/**
 * Binds an already-proposed claim to an exact UTF-8 source byte span.
 * This function neither extracts/invents claims nor reads or persists files.
 */
export function createEvidenceTupleFromRawSpanV1(input: EvidenceTupleRawSpanInputV1): EvidenceTupleV1 {
  if (!(input.sourceBytes instanceof Uint8Array)) throw new Error('EVIDENCE_TUPLE_SOURCE_BYTES_INVALID');
  if (!Number.isSafeInteger(input.byteStart) || !Number.isSafeInteger(input.byteEnd)
    || input.byteStart < 0 || input.byteEnd <= input.byteStart || input.byteEnd > input.sourceBytes.byteLength) {
    throw new Error('EVIDENCE_TUPLE_BYTE_SPAN_INVALID');
  }

  const span = input.sourceBytes.subarray(input.byteStart, input.byteEnd);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(span);
  } catch {
    throw new Error('EVIDENCE_TUPLE_SPAN_NOT_UTF8');
  }

  return createEvidenceTupleV1({
    schema: 'atlas.evidence-tuple.v1',
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    session_id: input.sessionId,
    source_path: input.sourcePath,
    byte_start: input.byteStart,
    byte_end: input.byteEnd,
    raw_sha256: `sha256:${createHash('sha256').update(span).digest('hex')}`,
    severity: input.severity,
  });
}
