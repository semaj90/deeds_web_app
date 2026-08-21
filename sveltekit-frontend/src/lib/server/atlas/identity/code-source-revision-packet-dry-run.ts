import {
  deriveCodeSourceRevisionV1,
  type CodeSourceRevisionV1,
} from './code-source-revision-v1.js';

export type CodeSourceRevisionPacketDryRunInput = {
  packetKey: string;
  sourceRef: string;
  sourceContent: string;
  workspaceRevision: string;
  representationId: 'semantic_768';
  representationRevision: number;
  existingPacketSha256?: string | null;
};

export type CodeSourceRevisionPacketDryRunResult = {
  status: 'READY_FOR_PERSISTENCE_REVIEW' | 'BLOCKED';
  canonicalWrites: false;
  packetKey: string;
  sourceRef: string;
  revision: CodeSourceRevisionV1 | null;
  existingDigestMatch: boolean | null;
  errors: string[];
};

export function dryRunCodeSourceRevisionPacket(
  input: CodeSourceRevisionPacketDryRunInput,
): CodeSourceRevisionPacketDryRunResult {
  const errors: string[] = [];
  if (!input.packetKey.trim()) errors.push('MISSING_PACKET_KEY');
  if (!input.sourceRef.trim()) errors.push('MISSING_SOURCE_REF');
  if (!input.workspaceRevision.trim()) errors.push('MISSING_WORKSPACE_REVISION');
  if (input.representationId !== 'semantic_768') errors.push('NON_CANONICAL_REPRESENTATION');
  if (!Number.isInteger(input.representationRevision) || input.representationRevision <= 0) {
    errors.push('INVALID_REPRESENTATION_REVISION');
  }

  let revision: CodeSourceRevisionV1 | null = null;
  try {
    revision = deriveCodeSourceRevisionV1(input.sourceContent);
  } catch {
    errors.push('SOURCE_CONTENT_UNAVAILABLE');
  }

  const existingDigestMatch = input.existingPacketSha256 == null || revision == null
    ? null
    : input.existingPacketSha256.toLowerCase() === revision.contentDigest;
  if (existingDigestMatch === false) errors.push('EXISTING_PACKET_DIGEST_MISMATCH');

  return {
    status: errors.length ? 'BLOCKED' : 'READY_FOR_PERSISTENCE_REVIEW',
    canonicalWrites: false,
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    revision,
    existingDigestMatch,
    errors,
  };
}
