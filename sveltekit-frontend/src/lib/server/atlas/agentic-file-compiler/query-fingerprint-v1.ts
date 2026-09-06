import { createHash } from 'node:crypto';
import { z } from 'zod';

export const QUERY_FINGERPRINT_V1_SCHEMA = 'parent-atlas.query-fingerprint.v1' as const;

const HEX_SHA256 = z.string().regex(/^[a-f0-9]{64}$/);

export const QueryFingerprintV1Schema = z.object({
  schema: z.literal(QUERY_FINGERPRINT_V1_SCHEMA),
  requestId: z.string().min(1),
  originalQuery: z.string().min(1).max(16_000),
  normalizedQuery: z.string().min(1).max(16_000),
  queryChecksum: HEX_SHA256,
  normalizedLexemes: z.array(z.string().min(1)).max(512),
  rareLexemes: z.array(z.string().min(1)).max(512),
  rareLexemesAvailable: z.boolean(),
  trigramFingerprint: HEX_SHA256,
  normalizerRevision: z.string().min(1),
  corpusRevision: z.string().min(1).optional(),
  observedAt: z.string().datetime({ offset: true }),
  checksum: HEX_SHA256,
}).strict();

export type QueryFingerprintV1 = z.infer<typeof QueryFingerprintV1Schema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function lexemes(value: string): string[] {
  return [...new Set(value.split(/[^\p{L}\p{N}_.:/-]+/u).filter(Boolean))].sort();
}

function trigrams(value: string): string[] {
  if (value.length < 3) return value.length > 0 ? [value] : [];
  return [...new Set(Array.from({ length: value.length - 2 }, (_, index) => value.slice(index, index + 3)))].sort();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Builds a derived query feature. `observedAt` is intentionally excluded from
 * the deterministic checksum so repeated observations of the same request and
 * revisions remain comparable. Missing rare-term statistics are represented by
 * an explicit availability flag, never by fabricated frequency values.
 */
export function buildQueryFingerprintV1(input: {
  requestId: string;
  query: string;
  normalizerRevision: string;
  corpusRevision?: string;
  rareLexemes?: readonly string[];
  rareLexemesAvailable?: boolean;
  observedAt?: string;
}): QueryFingerprintV1 {
  const normalizedQuery = normalizeQuery(input.query);
  if (!normalizedQuery) throw new Error('QUERY_EMPTY_AFTER_NORMALIZATION');
  const normalizedLexemes = lexemes(normalizedQuery);
  const rareLexemesAvailable = input.rareLexemesAvailable ?? input.rareLexemes !== undefined;
  const rareLexemes = rareLexemesAvailable
    ? [...new Set((input.rareLexemes ?? []).map(normalizeQuery).filter(Boolean))].sort()
    : [];
  const trigramFingerprint = sha256(stableJson(trigrams(normalizedQuery)));
  const identity = {
    schema: QUERY_FINGERPRINT_V1_SCHEMA,
    normalizedQuery,
    queryChecksum: sha256(normalizedQuery),
    normalizedLexemes,
    rareLexemes,
    rareLexemesAvailable,
    trigramFingerprint,
    normalizerRevision: input.normalizerRevision,
    ...(input.corpusRevision ? { corpusRevision: input.corpusRevision } : {}),
  };
  return QueryFingerprintV1Schema.parse({
    ...identity,
    requestId: input.requestId,
    originalQuery: input.query,
    observedAt: input.observedAt ?? new Date().toISOString(),
    checksum: sha256(stableJson(identity)),
  });
}
