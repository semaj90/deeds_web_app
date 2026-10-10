import { createHash } from 'node:crypto';
import {
  preflightSourceAuthorityShadowV1,
  type SourceAuthorityCandidateV1,
  type SourceAuthorityShadowPreflightV1,
  type VerifiedSourceAuthorityV1,
} from './source-authority-shadow-preflight-v1.js';

export type SourceBindingReceiptLikeV1 = {
  status: 'VERIFIED_SOURCE_BINDING';
  canonicalPacketKey: string;
  storagePacketKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  submittedTextChecksum: string;
  sourceBindingChecksum: string;
  checksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
};

export type WorkspaceFileDigestV1 = {
  file_found: boolean;
  file_sha256: string | null;
  file_byte_length: number | null;
};

/**
 * Inject existing, authorized source-text, byte-digest and binding owners.
 * Neither the adapter nor callback assertions grant canonical admission.
 * Dependencies must be assembled by trusted server code, never tool input.
 */
export function createSourceAuthorityBindingAdapterV1(deps: {
  readSourceText: (sourceRef: string) => Promise<string | null>;
  readFileDigest: (sourceRef: string, byteLength: number) => Promise<WorkspaceFileDigestV1>;
  resolveSourceBinding: (input: {
    packetKey: string;
    sourceRef: string;
    sourceRevision: string;
    workspaceRevision: string;
    submittedText: string;
  }) => Promise<SourceBindingReceiptLikeV1>;
  authorityProducerRevision: string;
}) {
  const match = (a: string, b: string) =>
    a.replace(/^sha256:/i, '').toLowerCase() === b.replace(/^sha256:/i, '').toLowerCase();
  const digest = (value: string) => 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex');
  const validDigest = (value: unknown): value is string =>
    typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value);

  const resolveVerifiedSource = async (candidate: SourceAuthorityCandidateV1): Promise<VerifiedSourceAuthorityV1 | null> => {
    if (!deps.authorityProducerRevision.trim() || !validDigest(candidate.sourceRevision)) return null;
    const text = await deps.readSourceText(candidate.sourceRef);
    if (text === null) return null;
    const actualDigest = digest(text);
    if (!match(actualDigest, candidate.sourceRevision)) return null;
    const file = await deps.readFileDigest(candidate.sourceRef, Buffer.byteLength(text, 'utf8'));
    if (!file.file_found || !validDigest(file.file_sha256) ||
        file.file_byte_length !== Buffer.byteLength(text, 'utf8') ||
        !match(file.file_sha256, actualDigest)) return null;
    const binding = await deps.resolveSourceBinding({
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
      submittedText: text,
    });
    if (
      binding.status !== 'VERIFIED_SOURCE_BINDING' ||
      binding.canonicalAuthority !== false || binding.writesPerformed !== false ||
      binding.canonicalPacketKey !== candidate.packetKey ||
      binding.sourceRef !== candidate.sourceRef ||
      binding.sourceRevision !== candidate.sourceRevision ||
      binding.workspaceRevision !== candidate.workspaceRevision ||
      !validDigest(binding.checksum) ||
      !validDigest(binding.sourceBindingChecksum) ||
      !validDigest(binding.submittedTextChecksum) ||
      !match(binding.submittedTextChecksum, actualDigest)
    ) return null;
    return {
      ...candidate,
      sourceBindingReceiptChecksum: binding.checksum,
      sourceFileSha256: file.file_sha256,
      verifiedBytesSha256: actualDigest,
      authorityProducerRevision: deps.authorityProducerRevision,
      sourceReceiptVerified: true,
    };
  };

  return {
    resolveVerifiedSource,
    preflight: (input: {
      requestId: string;
      candidateSnapshotChecksum: string;
      candidates: readonly SourceAuthorityCandidateV1[];
    }): Promise<SourceAuthorityShadowPreflightV1> =>
      preflightSourceAuthorityShadowV1({ ...input, resolveVerifiedSource }),
  };
}
