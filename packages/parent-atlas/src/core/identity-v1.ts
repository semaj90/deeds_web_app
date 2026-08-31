import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Shared, read-only identity derivations. These functions preserve the
 * existing symbol-version formula; they do not migrate existing IDs. */
export const IDENTITY_ALGORITHM_REVISION = 'atlas-identity-derivation-v1';

const requiredText = z.string().trim().min(1);
const revisionQualified = z.object({
  sourceRef: requiredText,
  sourceRevision: requiredText,
});

export const structuralOccurrenceV1Schema = revisionQualified.extend({
  parserRevision: requiredText,
  upstreamNodeId: z.string().trim().min(1).optional(),
  upstreamChunkId: z.string().trim().min(1).optional(),
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().nonnegative(),
  normalizedNodeHash: z.string().trim().min(1).optional(),
  contentHash: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.byteEnd < value.byteStart) {
    ctx.addIssue({ code: 'custom', path: ['byteEnd'], message: 'byteEnd must be >= byteStart' });
  }
});

export type StructuralOccurrenceV1 = z.infer<typeof structuralOccurrenceV1Schema>;

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function deriveStructuralOccurrenceKeyV1(input: StructuralOccurrenceV1): string {
  const value = structuralOccurrenceV1Schema.parse(input);
  return `occurrence:${sha256(canonicalJson([
    value.sourceRef,
    value.sourceRevision,
    value.parserRevision,
    value.upstreamNodeId ?? null,
    value.upstreamChunkId ?? null,
    value.byteStart,
    value.byteEnd,
  ]))}`;
}

export const symbolVersionDerivationInputV1Schema = z.object({
  stableSymbolId: requiredText,
  sourceRevision: requiredText,
  declarationHash: requiredText,
  upstreamNodeId: requiredText,
});

export type SymbolVersionDerivationInputV1 = z.infer<typeof symbolVersionDerivationInputV1Schema>;

/** Exact compatibility derivation used by materialize-ast-symbol-versions.mjs. */
export function deriveSymbolVersionIdV1(input: SymbolVersionDerivationInputV1): string {
  const value = symbolVersionDerivationInputV1Schema.parse(input);
  return `symbol-version:${sha256(`${value.stableSymbolId}\0${value.sourceRevision}\0${value.declarationHash}\0${value.upstreamNodeId}`)}`;
}

export function identityDerivationMetadataV1() {
  return {
    algorithmRevision: IDENTITY_ALGORITHM_REVISION,
    canonicalSerialization: 'JSON.stringify(array) for occurrence; NUL-delimited tuple for symbol-version compatibility',
    displayAbbreviation: 'sha256 hex, prefixed by identity kind',
    canonicalChunkId: 'NOT_DEFINED_UNTIL_CHUNK_OWNER_AUDIT',
  } as const;
}
