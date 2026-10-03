import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

/**
 * ACE-REV-01: content-addressed retrieval-policy and ACE-playbook revisions.
 *
 * Pure (no I/O). A revision is the SHA-256 of the canonical encoding of the exact config, so a config change
 * automatically produces a new revision and therefore a new cache identity. Hand-set labels such as 'v1' or
 * 'policy:r1' are never accepted as a production revision. This module mints nothing canonical: it only derives
 * a digest that callers pass into the existing ContextManifestV2 / RetrievalCacheIdentityV1 owners.
 */
export const REVISION_AUTHORITY_SCHEMA_V1 = 'atlas.revision-authority.v1' as const;
export type RevisionKindV1 = 'retrieval-policy' | 'ace-playbook';
const REVISION_RE = /^sha256:[a-f0-9]{64}$/;

function requireConfig(config: unknown): Record<string, unknown> {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('REVISION_CONFIG_MUST_BE_A_PLAIN_OBJECT');
  }
  if (Object.keys(config as object).length === 0) throw new TypeError('REVISION_CONFIG_MUST_NOT_BE_EMPTY');
  return config as Record<string, unknown>;
}

/** `sha256:<hex>` over the canonical encoding of {schema, kind, config}; kind is part of the digest. */
export function contentAddressedRevisionV1(kind: RevisionKindV1, config: unknown): string {
  return `sha256:${canonicalSha256V1({ schema: REVISION_AUTHORITY_SCHEMA_V1, kind, config: requireConfig(config) })}`;
}

export type RevisionCheckV1 =
  | { ok: true; revision: string }
  | { ok: false; reason: 'NOT_CONTENT_ADDRESSED' | 'CONFIG_DIGEST_MISMATCH' | 'INVALID_CONFIG' };

/** Fails closed: a supplied revision must be a sha256 revision AND equal the digest of the config it claims. */
export function verifyContentAddressedRevisionV1(kind: RevisionKindV1, revision: unknown, config: unknown): RevisionCheckV1 {
  if (typeof revision !== 'string' || !REVISION_RE.test(revision)) return { ok: false, reason: 'NOT_CONTENT_ADDRESSED' };
  let expected: string;
  try { expected = contentAddressedRevisionV1(kind, config); } catch { return { ok: false, reason: 'INVALID_CONFIG' }; }
  return expected === revision ? { ok: true, revision } : { ok: false, reason: 'CONFIG_DIGEST_MISMATCH' };
}

export interface RevisionAuthorityEnvelopeV1 {
  schema: typeof REVISION_AUTHORITY_SCHEMA_V1;
  retrievalPolicyRevision: string;
  acePlaybookRevision: string;
  canonicalAuthority: false;
}

/** Both revisions from their canonical configs, ready for the existing manifest-admission input. */
export function buildRevisionAuthorityEnvelopeV1(input: { retrievalPolicyConfig: unknown; acePlaybookConfig: unknown }): RevisionAuthorityEnvelopeV1 {
  return {
    schema: REVISION_AUTHORITY_SCHEMA_V1,
    retrievalPolicyRevision: contentAddressedRevisionV1('retrieval-policy', input.retrievalPolicyConfig),
    acePlaybookRevision: contentAddressedRevisionV1('ace-playbook', input.acePlaybookConfig),
    canonicalAuthority: false,
  };
}
