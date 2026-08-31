import { createHash } from 'node:crypto';
import { z, type ZodType } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * TypedEvidenceEnvelopeV1 — the target shape for any JSON/NDJSON artifact
 * (receipts, agent event logs, Graphify batches, audit streams, bulk
 * manifests) parsed via simdjson On-Demand.
 *
 * simdjson's On-Demand model validates fields lazily as they are consumed,
 * not upfront against the whole document — so `payload` is only trusted
 * once `payloadSchema` (caller-supplied, record-shape-specific) has parsed
 * it. This envelope is what proves that happened: `payloadChecksum` is a
 * hash of the *validated* payload, never the raw pre-validation bytes, so a
 * consumer downstream can trust the checksum implies "every
 * correctness-critical field was actually touched," not just "bytes were
 * well-formed JSON."
 */
export const typedEvidenceEnvelopeSchema = z.object({
  schema: z.literal('atlas.typed-evidence-envelope.v1').default('atlas.typed-evidence-envelope.v1'),
  envelopeId: id,
  artifactRef: id,
  artifactRevision: revision,
  recordIndex: z.number().int().nonnegative(),
  payloadSchemaId: id,
  payloadChecksum: sha256Hex,
  typedEvidenceChecksum: sha256Hex,
  rawInputChecksum: sha256Hex,
  evidenceId: id,
  sourceRef: id,
  sourceRevision: revision,
  parserRevision: revision,
  adapterRevision: revision,
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type TypedEvidenceEnvelopeV1 = z.infer<typeof typedEvidenceEnvelopeSchema>;

export const typedEvidenceFailureCodeSchema = z.enum([
  'JSON_PARSE_FAILED',
  'UTF8_INVALID',
  'SCHEMA_REJECTED',
  'SCHEMA_REVISION_UNSUPPORTED',
  'SOURCE_REVISION_MISSING',
  'EVIDENCE_ID_MISSING',
  'CHECKSUM_MISMATCH',
]);

export type TypedEvidenceFailureCode = z.infer<typeof typedEvidenceFailureCodeSchema>;

export type SimdjsonTypedAdaptResultV1<T> =
  | { status: 'ACCEPTED'; envelope: TypedEvidenceEnvelopeV1; payload: T }
  | { status: 'REJECTED'; recordIndex: number; code: TypedEvidenceFailureCode; reason: string };

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((out, key) => {
          out[key] = (item as Record<string, unknown>)[key];
          return out;
        }, {});
    }
    return item;
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

/**
 * Adapt one simdjson-parsed record into a TypedEvidenceEnvelopeV1.
 *
 * This does NOT parse JSON itself — it takes an already-simdjson-parsed
 * JS value (or a value from any parser) and requires `payloadSchema` to
 * actually validate it. The whole point of this function is to make it
 * structurally impossible to skip that step: there is no path from a raw
 * record to an envelope that does not go through `payloadSchema.parse()`.
 */
export function adaptSimdjsonTypedEvidence<T>(input: {
  artifactRef: string;
  artifactRevision: string;
  sourceRef: string;
  sourceRevision: string;
  evidenceId: string;
  rawInputChecksum: string;
  parserRevision: string;
  recordIndex: number;
  record: unknown;
  payloadSchema: ZodType<T>;
  payloadSchemaId: string;
  adapterRevision: string;
}): SimdjsonTypedAdaptResultV1<T> {
  if (!input.sourceRevision) {
    return { status: 'REJECTED', recordIndex: input.recordIndex, code: 'SOURCE_REVISION_MISSING', reason: 'sourceRevision is required' };
  }
  if (!input.evidenceId) {
    return { status: 'REJECTED', recordIndex: input.recordIndex, code: 'EVIDENCE_ID_MISSING', reason: 'evidenceId is required' };
  }
  const parsed = input.payloadSchema.safeParse(input.record);
  if (!parsed.success) {
    return {
      status: 'REJECTED',
      recordIndex: input.recordIndex,
      code: 'SCHEMA_REJECTED',
      reason: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') || 'SIMDJSON_TYPED_EVIDENCE_VALIDATION_FAILED',
    };
  }
  const payloadChecksum = sha256(parsed.data);
  const envelope = typedEvidenceEnvelopeSchema.parse({
    schema: 'atlas.typed-evidence-envelope.v1',
    envelopeId: `simdjson:${sha256({
      artifactRef: input.artifactRef,
      artifactRevision: input.artifactRevision,
      recordIndex: input.recordIndex,
      payloadChecksum,
    }).slice(0, 40)}`,
    artifactRef: input.artifactRef,
    artifactRevision: input.artifactRevision,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    evidenceId: input.evidenceId,
    rawInputChecksum: input.rawInputChecksum,
    parserRevision: input.parserRevision,
    recordIndex: input.recordIndex,
    payloadSchemaId: input.payloadSchemaId,
    payloadChecksum,
    typedEvidenceChecksum: payloadChecksum,
    adapterRevision: input.adapterRevision,
    canonicalAuthority: false,
  });
  return { status: 'ACCEPTED', envelope, payload: parsed.data };
}

/**
 * Adapt a full stream of already-parsed records (e.g. one JS value per
 * NDJSON line from simdjson's `iterate_many`/streaming mode). Rejections
 * do not throw and do not stop the stream — callers decide whether a
 * partial-accept run is acceptable (`FAIL_CLOSED` vs `SKIP_OPTIONAL`
 * belongs to the caller's WorkflowActionEventV1 failurePolicy, not here).
 */
export function adaptSimdjsonTypedEvidenceStream<T>(input: {
  artifactRef: string;
  artifactRevision: string;
  sourceRef: string;
  sourceRevision: string;
  evidenceIdPrefix?: string;
  rawInputChecksums: readonly string[];
  parserRevision: string;
  records: readonly unknown[];
  payloadSchema: ZodType<T>;
  payloadSchemaId: string;
  adapterRevision: string;
}): SimdjsonTypedAdaptResultV1<T>[] {
  if (input.rawInputChecksums.length !== input.records.length) {
    throw new Error('rawInputChecksums must align one-to-one with records');
  }
  return input.records.map((record, recordIndex) =>
    adaptSimdjsonTypedEvidence({
      artifactRef: input.artifactRef,
      artifactRevision: input.artifactRevision,
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      evidenceId: `${input.evidenceIdPrefix ?? input.sourceRef}:${recordIndex}`,
      rawInputChecksum: input.rawInputChecksums[recordIndex] ?? '',
      parserRevision: input.parserRevision,
      recordIndex,
      record,
      payloadSchema: input.payloadSchema,
      payloadSchemaId: input.payloadSchemaId,
      adapterRevision: input.adapterRevision,
    }),
  );
}
