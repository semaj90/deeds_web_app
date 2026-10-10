import { createHash } from 'node:crypto';

/**
 * SOURCE-AUTH-COMPOSE-01: read-only preflight, not an admission authority.
 * Callers must inject an existing authorized source/receipt resolver.
 * This module must not open arbitrary filesystem paths, query stores or invent revisions.
 */
export interface SourceAuthorityCandidateV1 {
  chunkRowId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
}

export interface VerifiedSourceAuthorityV1 extends SourceAuthorityCandidateV1 {
  sourceBindingReceiptChecksum: string;
  sourceFileSha256: string;
  verifiedBytesSha256: string;
  authorityProducerRevision: string;
  sourceReceiptVerified: true;
}

export type SourceAuthorityShadowPreflightV1 =
  | {
      schema: 'atlas.source-authority-shadow-preflight.v1';
      status: 'VERIFIED_SHADOW';
      requestId: string;
      candidateSnapshotChecksum: string;
      bindings: readonly VerifiedSourceAuthorityV1[];
      checksum: string;
      writesPerformed: false;
      canonicalAuthority: false;
    }
  | {
      schema: 'atlas.source-authority-shadow-preflight.v1';
      status: 'BLOCKED';
      requestId: string;
      candidateSnapshotChecksum: string | null;
      reason: string;
      bindings: readonly [];
      checksum: null;
      writesPerformed: false;
      canonicalAuthority: false;
    };

const valid = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const hexDigest = (s: unknown): s is string => valid(s) && /^(?:sha256:)?[a-f0-9]{64}$/i.test(s);
const sameDigest = (a: string, b: string) =>
  a.replace(/^sha256:/i, '').toLowerCase() === b.replace(/^sha256:/i, '').toLowerCase();

export async function preflightSourceAuthorityShadowV1(input: {
  requestId: string;
  candidateSnapshotChecksum: string;
  candidates: readonly SourceAuthorityCandidateV1[];
  resolveVerifiedSource: (candidate: SourceAuthorityCandidateV1) => Promise<VerifiedSourceAuthorityV1 | null>;
}): Promise<SourceAuthorityShadowPreflightV1> {
  const blocked = (reason: string): SourceAuthorityShadowPreflightV1 => ({
    schema: 'atlas.source-authority-shadow-preflight.v1',
    status: 'BLOCKED', requestId: input.requestId,
    candidateSnapshotChecksum: hexDigest(input.candidateSnapshotChecksum) ? input.candidateSnapshotChecksum : null,
    reason, bindings: [], checksum: null, writesPerformed: false, canonicalAuthority: false,
  });
  if (!valid(input.requestId) || !hexDigest(input.candidateSnapshotChecksum)) return blocked('REQUEST_OR_SNAPSHOT_INVALID');
  if (input.candidates.length === 0 || input.candidates.length > 100) return blocked('CANDIDATE_BUDGET_INVALID');
  const seen = new Set<string>();
  const bindings: VerifiedSourceAuthorityV1[] = [];
  for (const c of input.candidates) {
    if (![c.chunkRowId, c.packetKey, c.sourceRef, c.sourceRevision, c.workspaceRevision].every(valid)) {
      return blocked('CANDIDATE_LINEAGE_INCOMPLETE');
    }
    if (seen.has(c.chunkRowId)) return blocked('DUPLICATE_CANDIDATE');
    seen.add(c.chunkRowId);
    let receipt: VerifiedSourceAuthorityV1 | null;
    try {
      receipt = await input.resolveVerifiedSource(c);
    } catch {
      return blocked('SOURCE_AUTHORITY_PROVIDER_FAILED');
    }
    if (!receipt) return blocked('SOURCE_AUTHORITY_UNAVAILABLE');
    if (
      receipt.chunkRowId !== c.chunkRowId ||
      receipt.packetKey !== c.packetKey ||
      receipt.sourceRef !== c.sourceRef ||
      receipt.sourceRevision !== c.sourceRevision ||
      receipt.workspaceRevision !== c.workspaceRevision
    ) return blocked('SOURCE_AUTHORITY_IDENTITY_MISMATCH');
    if (
      receipt.sourceReceiptVerified !== true ||
      !hexDigest(receipt.sourceBindingReceiptChecksum) ||
      !hexDigest(receipt.sourceFileSha256) ||
      !hexDigest(receipt.verifiedBytesSha256) ||
      !sameDigest(receipt.sourceFileSha256, receipt.verifiedBytesSha256) ||
      !valid(receipt.authorityProducerRevision)
    ) return blocked('SOURCE_AUTHORITY_RECEIPT_INVALID');
    bindings.push({ ...receipt });
  }
  const checksum = 'sha256:' + createHash('sha256').update(JSON.stringify({
    schema: 'atlas.source-authority-shadow-preflight.v1',
    requestId: input.requestId,
    candidateSnapshotChecksum: input.candidateSnapshotChecksum,
    bindings,
  })).digest('hex');
  return {
    schema: 'atlas.source-authority-shadow-preflight.v1',
    status: 'VERIFIED_SHADOW',
    requestId: input.requestId,
    candidateSnapshotChecksum: input.candidateSnapshotChecksum,
    bindings, checksum, writesPerformed: false, canonicalAuthority: false,
  };
}
