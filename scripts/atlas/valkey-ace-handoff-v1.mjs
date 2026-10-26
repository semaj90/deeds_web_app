/**
 * VAL-ACE-01: diagnostic-only Valkey -> ACE handoff inspector (adapted from the
 * operator-supplied scaffold, 2026-10-11). It deliberately cannot admit evidence,
 * synthesize context or write to Valkey. The calling owner must pass an
 * independently observed Valkey GET result, the resolver receipt from
 * resolveCachedPacketCandidatesV1, and the source-span receipt from the existing
 * source-binding owner. Never manufacture a match from a cache score or demo text.
 *
 * Changes vs the scaffold:
 *  - cacheRead must carry sourceRevision and it must equal the resolved match's.
 *  - Receipt checksums are verified through an INJECTED verifier (the owner of the
 *    hashing, i.e. canonicalSha256V1 in sveltekit-frontend); this file does not
 *    reimplement that encoding. No verifier -> BLOCKED.
 *  - Deterministic code-point ordering instead of localeCompare.
 * Status: FIXTURE_ONLY (tests use injected observations, not production Valkey).
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const compareUtf8 = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const stable = (value) => JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => compareUtf8(a, b))) : v));
const sha = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

const blocked = (reason, observation = null) => valkeyAceHandoffV1Schema.parse({
  schema: 'atlas.valkey-ace-handoff.v1', status: 'BLOCKED', reason,
  observation, admitted: false, canonicalAuthority: false,
  ontologyTuple: null, contextManifest: null, aceInjectionAuthorized: false,
});


const text = z.string().trim().min(1);
/** Strict contract for the Valkey GET observation the production caller must supply. */
export const valkeyCacheReadV1Schema = z.object({
  source: z.literal('VALKEY_GET'),
  cacheKey: text,
  cacheGeneration: text,
  representationRevision: text,
  hintId: text,
  sourceRef: text,
  packetKey: text,
  sourceRevision: text,
  workspaceRevision: text,
}).strict();

const observationSchema = z.object({
  cacheKey: text, cacheGeneration: text, representationRevision: text, hintId: text,
  candidateOrdinal: z.number().int().nonnegative(), canonicalId: text, packetKey: text, sourceRef: text,
  sourceRevision: text, workspaceRevision: text, ordinalMapChecksum: text, resolverChecksum: text,
  sourceSpanReceiptChecksum: text, evidenceRef: text,
}).strict();

/** Strict contract for the handoff result. Authority fields are literals: they can never be true. */
export const valkeyAceHandoffV1Schema = z.discriminatedUnion('status', [
  z.object({
    schema: z.literal('atlas.valkey-ace-handoff.v1'),
    status: z.literal('SOURCE_VERIFIED_NOT_ADMITTED'),
    observation: observationSchema,
    admitted: z.literal(false), canonicalAuthority: z.literal(false),
    ontologyTuple: z.null(), contextManifest: z.null(), aceInjectionAuthorized: z.literal(false),
    checksum: text,
  }).strict(),
  z.object({
    schema: z.literal('atlas.valkey-ace-handoff.v1'),
    status: z.literal('BLOCKED'),
    reason: text,
    observation: z.null(),
    admitted: z.literal(false), canonicalAuthority: z.literal(false),
    ontologyTuple: z.null(), contextManifest: z.null(), aceInjectionAuthorized: z.literal(false),
  }).strict(),
]);

const IDENTITY_KEYS = ['hintId', 'canonicalId', 'packetKey', 'sourceRef', 'sourceRevision', 'workspaceRevision'];

/**
 * @param {object} input
 * @param {object} input.cacheRead independently observed Valkey GET (source must be 'VALKEY_GET')
 * @param {object} input.resolution atlas.cached-packet-candidate-resolution.v1 receipt
 * @param {object} input.sourceSpanVerification SOURCE_SPAN_VERIFIED_NOT_ADMITTED receipt
 * @param {(kind: 'resolution' | 'sourceSpan', receipt: object) => boolean} input.verifyReceiptChecksum
 *   supplied by the hashing owner; must recompute and compare the receipt checksum
 */
export function inspectValkeyAceHandoffV1({ cacheRead, resolution, sourceSpanVerification, verifyReceiptChecksum }) {
  if (typeof verifyReceiptChecksum !== 'function') return blocked('CHECKSUM_VERIFIER_REQUIRED');
  if (!cacheRead || cacheRead.source !== 'VALKEY_GET' || !nonEmpty(cacheRead.cacheKey)
      || !nonEmpty(cacheRead.cacheGeneration) || !nonEmpty(cacheRead.representationRevision)) {
    return blocked('CACHE_READ_NOT_OBSERVED');
  }
  if (!nonEmpty(cacheRead.sourceRevision)) return blocked('CACHE_READ_SOURCE_REVISION_REQUIRED');
  if (!valkeyCacheReadV1Schema.safeParse(cacheRead).success) return blocked('CACHE_READ_SCHEMA_INVALID');
  if (!resolution || resolution.schema !== 'atlas.cached-packet-candidate-resolution.v1'
      || resolution.canonicalAuthority !== false || resolution.evidenceStatus !== 'UNVERIFIED'
      || !nonEmpty(resolution.ordinalMapChecksum) || !nonEmpty(resolution.checksum)) {
    return blocked('CANONICAL_RESOLVER_RECEIPT_INVALID');
  }
  if (verifyReceiptChecksum('resolution', resolution) !== true) return blocked('RESOLVER_CHECKSUM_NOT_VERIFIED');
  if (!Array.isArray(resolution.matches) || resolution.matches.length !== 1) {
    return blocked('EXACTLY_ONE_CANONICAL_MATCH_REQUIRED');
  }
  const match = resolution.matches[0];
  if (!nonEmpty(match.hintId) || !nonEmpty(match.canonicalId)
      || !nonEmpty(match.packetKey) || !nonEmpty(match.sourceRef)
      || !nonEmpty(match.sourceRevision) || !nonEmpty(match.workspaceRevision)
      || !Number.isSafeInteger(match.candidateOrdinal) || match.candidateOrdinal < 0
      || match.hintId !== cacheRead.hintId || match.sourceRef !== cacheRead.sourceRef
      || match.packetKey !== cacheRead.packetKey
      || match.workspaceRevision !== cacheRead.workspaceRevision
      || resolution.workspaceRevision !== match.workspaceRevision) {
    return blocked('CACHE_CANONICAL_IDENTITY_MISMATCH');
  }
  if (match.sourceRevision !== cacheRead.sourceRevision) return blocked('CACHE_SOURCE_REVISION_STALE');
  if (!sourceSpanVerification || sourceSpanVerification.status !== 'SOURCE_SPAN_VERIFIED_NOT_ADMITTED'
      || sourceSpanVerification.canonicalAuthority !== false || sourceSpanVerification.admitted !== false
      || !nonEmpty(sourceSpanVerification.checksum) || !nonEmpty(sourceSpanVerification.evidenceRef)
      || !nonEmpty(sourceSpanVerification.spanChecksum)
      || IDENTITY_KEYS.some((key) => sourceSpanVerification[key] !== match[key])) {
    return blocked('SOURCE_SPAN_RECEIPT_MISSING_OR_MISMATCHED');
  }
  if (verifyReceiptChecksum('sourceSpan', sourceSpanVerification) !== true) {
    return blocked('SOURCE_SPAN_CHECKSUM_NOT_VERIFIED');
  }
  const observation = Object.freeze({
    cacheKey: cacheRead.cacheKey, cacheGeneration: cacheRead.cacheGeneration,
    representationRevision: cacheRead.representationRevision,
    hintId: match.hintId, candidateOrdinal: match.candidateOrdinal,
    canonicalId: match.canonicalId, packetKey: match.packetKey,
    sourceRef: match.sourceRef, sourceRevision: match.sourceRevision,
    workspaceRevision: match.workspaceRevision,
    ordinalMapChecksum: resolution.ordinalMapChecksum,
    resolverChecksum: resolution.checksum,
    sourceSpanReceiptChecksum: sourceSpanVerification.checksum,
    evidenceRef: sourceSpanVerification.evidenceRef,
  });
  const payload = {
    schema: 'atlas.valkey-ace-handoff.v1',
    status: 'SOURCE_VERIFIED_NOT_ADMITTED', observation,
    admitted: false, canonicalAuthority: false,
    ontologyTuple: null, contextManifest: null, aceInjectionAuthorized: false,
  };
  return valkeyAceHandoffV1Schema.parse({ ...payload, checksum: sha(stable(payload)) });
}
