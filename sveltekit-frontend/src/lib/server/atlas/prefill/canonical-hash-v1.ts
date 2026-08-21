import { createHash } from 'node:crypto';
import { z } from 'zod';

export const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

const canonicalScalarSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export type CanonicalScalarV1 = z.infer<typeof canonicalScalarSchema>;

export const CanonicalPacketHashInputV1Schema = z.object({
  schema: z.literal('atlas.canonical-packet-hash-input.v1').default('atlas.canonical-packet-hash-input.v1'),
  schemaVersion: z.string().min(1),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  scalarFields: z.record(z.string(), canonicalScalarSchema).default({}),
  /** Set-like identities. Order is intentionally discarded before hashing. */
  setIds: z.array(z.string().min(1)).default([]),
  /** Sequence-like identities. Order is semantically significant. */
  orderedIds: z.array(z.string().min(1)).default([]),
  /** Text is normalized to Unicode NFC before hashing. */
  normalizedText: z.record(z.string(), z.string()).default({}),
  tensorChecksums: z.array(sha256HexSchema).default([]),
  sourceRevisions: z.array(z.string().min(1)).default([]),
}).strict();

export type CanonicalPacketHashInputV1 = z.infer<typeof CanonicalPacketHashInputV1Schema>;

export const CanonicalPacketHashV1Schema = z.object({
  schema: z.literal('atlas.canonical-packet-hash.v1'),
  algorithm: z.literal('SHA-256'),
  canonicalEncoding: z.literal('ATLAS_CANONICAL_V1'),
  hash: sha256HexSchema,
  schemaVersion: z.string().min(1),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
}).strict();

export type CanonicalPacketHashV1 = z.infer<typeof CanonicalPacketHashV1Schema>;

function lengthPrefixedUtf8(value: string): string {
  const normalized = value.normalize('NFC');
  return `${Buffer.byteLength(normalized, 'utf8')}:${normalized}`;
}

function float64Hex(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError('canonical encoding rejects NaN and Infinity');
  const normalized = Object.is(value, -0) ? 0 : value;
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeDoubleBE(normalized, 0);
  return buffer.toString('hex');
}

/**
 * Atlas-owned canonical scalar/object encoder.
 *
 * This exists specifically so canonical identity does not depend on JSON,
 * Protobuf, Arrow, database row, or language-runtime serialization bytes.
 * Arrays remain ordered. Object keys are Unicode-NFC-normalized and sorted.
 */
export function canonicalEncodeV1(value: unknown): string {
  if (value === null) return 'n;';
  if (typeof value === 'boolean') return value ? 'b1;' : 'b0;';
  if (typeof value === 'string') return `s${lengthPrefixedUtf8(value)};`;
  if (typeof value === 'number') return `f${float64Hex(value)};`;

  if (Array.isArray(value)) {
    return `a${value.length}[${value.map((item) => canonicalEncodeV1(item)).join('')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const normalized = new Map<string, unknown>();
    for (const [rawKey, item] of entries) {
      const key = rawKey.normalize('NFC');
      if (normalized.has(key)) throw new TypeError(`canonical object contains colliding normalized key: ${key}`);
      normalized.set(key, item);
    }
    const keys = [...normalized.keys()].sort((a, b) => a.localeCompare(b, 'en'));
    return `o${keys.length}{${keys
      .map((key) => `k${lengthPrefixedUtf8(key)};${canonicalEncodeV1(normalized.get(key))}`)
      .join('')}}`;
  }

  throw new TypeError(`canonical encoding does not support ${typeof value}`);
}

export function canonicalSha256V1(value: unknown): string {
  return createHash('sha256').update(canonicalEncodeV1(value), 'utf8').digest('hex');
}

function stableUnique(values: readonly string[], normalizeUnicode = true): string[] {
  const normalized = values
    .map((value) => normalizeUnicode ? value.normalize('NFC') : value)
    .filter((value) => value.length > 0);
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Format-independent packet identity. Set-like arrays are sorted while ordered
 * arrays remain ordered. This hash must remain distinct from Protobuf/JSON/Arrow
 * byte checksums, which are projection checksums only.
 */
export function buildCanonicalPacketHashV1(
  raw: z.input<typeof CanonicalPacketHashInputV1Schema>,
): CanonicalPacketHashV1 {
  const input = CanonicalPacketHashInputV1Schema.parse(raw);
  const scalarFields = Object.fromEntries(
    Object.entries(input.scalarFields)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([key, value]) => [key.normalize('NFC'), typeof value === 'string' ? value.normalize('NFC') : value]),
  );
  const normalizedText = Object.fromEntries(
    Object.entries(input.normalizedText)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([key, value]) => [key.normalize('NFC'), value.normalize('NFC')]),
  );

  const canonicalPayload = {
    schema: 'atlas.canonical-packet-hash-payload.v1',
    schemaVersion: input.schemaVersion.normalize('NFC'),
    canonicalId: input.canonicalId.normalize('NFC'),
    packetKey: input.packetKey.normalize('NFC'),
    scalarFields,
    setIds: stableUnique(input.setIds),
    orderedIds: input.orderedIds.map((value) => value.normalize('NFC')),
    normalizedText,
    tensorChecksums: stableUnique(input.tensorChecksums, false),
    sourceRevisions: stableUnique(input.sourceRevisions),
  };

  return CanonicalPacketHashV1Schema.parse({
    schema: 'atlas.canonical-packet-hash.v1',
    algorithm: 'SHA-256',
    canonicalEncoding: 'ATLAS_CANONICAL_V1',
    hash: canonicalSha256V1(canonicalPayload),
    schemaVersion: canonicalPayload.schemaVersion,
    canonicalId: canonicalPayload.canonicalId,
    packetKey: canonicalPayload.packetKey,
  });
}
