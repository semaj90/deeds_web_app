import { createHash } from 'node:crypto';

/**
 * Represents the mandatory source-of-truth hashes required for a single row's data provenance.
 */
export interface BackfillRow {
  sourceContentHash: string | null;
  embeddingInputHash: string | null;
  projectionHash: string;
}

function normalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries())
        .sort(([left], [right]) => String(left).localeCompare(String(right)))
        .map(([key, entryValue]) => [key, normalizeJson(entryValue)])
    );
  }

  if (value instanceof Set) {
    return Array.from(value)
      .map((item) => normalizeJson(item))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }

  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = normalizeJson(record[key]);
      return accumulator;
    }, {});
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

/**
 * Generates a deterministic SHA-256 hash for the projection contract.
 */
export function buildProjectionHash(
  sourceContentHash: string | null,
  embeddingInputHash: string | null,
  projectionHash: string
): string {
  const canonicalInput = canonicalJson({
    sourceContentHash: sourceContentHash ?? null,
    embeddingInputHash: embeddingInputHash ?? null,
    projectionHash,
  });

  return createHash('sha256').update(canonicalInput).digest('hex');
}
