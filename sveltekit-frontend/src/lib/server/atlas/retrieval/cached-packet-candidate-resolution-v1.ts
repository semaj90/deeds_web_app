import { createHash } from 'node:crypto';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  compareUtf8,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import type { GroundedExtractionSourceBindingReceiptV1 } from '../identity/grounded-extraction-source-binding-v1.js';

export interface CachedPacketHintV1 {
  hintId: string;
  kind: 'SOURCE_REF' | 'CENTROID';
  sourceRef?: string | null;
}

export interface CachedPacketCandidateResolutionInputV1 {
  workspaceRevision: string;
  ordinalMap: CandidateOrdinalMapV1;
  hints: readonly CachedPacketHintV1[];
}

export interface CachedPacketCandidateMatchV1 {
  hintId: string;
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string | null;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
}

export interface CachedPacketSourceSpanEvidenceV1 {
  canonicalId: string;
  packetKey: string | null;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  evidenceRef: string;
  extractorRevision: string;
  startByte: number;
  endByte: number;
  text: string;
  sourceBytes: Uint8Array;
}

export interface CachedPacketCandidateResolutionV1 {
  schema: 'atlas.cached-packet-candidate-resolution.v1';
  status: 'RESOLVED_HINTS' | 'NO_RESOLVED_HINTS';
  ordinalMapChecksum: string;
  workspaceRevision: string;
  matches: Array<{
    hintId: string;
    candidateOrdinal: number;
    canonicalId: string;
    packetKey: string | null;
    sourceRef: string;
    sourceRevision: string;
    workspaceRevision: string;
  }>;
  rejections: Array<{ hintId: string; reason: string }>;
  evidenceStatus: 'UNVERIFIED';
  canonicalAuthority: false;
  checksum: string;
}

export interface CachedPacketSourceSpanVerificationV1 {
  schema: 'atlas.cached-packet-source-span-verification.v1';
  status: 'SOURCE_SPAN_VERIFIED_NOT_ADMITTED';
  hintId: string;
  canonicalId: string;
  packetKey: string | null;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  evidenceRef: string;
  extractorRevision: string;
  startByte: number;
  endByte: number;
  spanChecksum: string;
  canonicalAuthority: false;
  admitted: false;
  checksum: string;
}

export interface CachedPacketSourceBindingSpanVerificationV1 extends CachedPacketSourceSpanVerificationV1 {
  canonicalPacketKey: string;
  storagePacketKey: string;
  packetResolutionSource: GroundedExtractionSourceBindingReceiptV1['packetResolutionSource'];
  sourceBindingReceiptChecksum: string;
  sourceBindingChecksum: string;
}

export function verifyCachedPacketCandidateSourceSpanV1(
  match: CachedPacketCandidateMatchV1,
  evidence: CachedPacketSourceSpanEvidenceV1,
): CachedPacketSourceSpanVerificationV1 {
  if (evidence.canonicalId !== match.canonicalId
    || evidence.packetKey !== match.packetKey
    || evidence.sourceRef !== match.sourceRef
    || evidence.sourceRevision !== match.sourceRevision
    || evidence.workspaceRevision !== match.workspaceRevision) {
    throw new Error('CACHED_PACKET_EVIDENCE_IDENTITY_MISMATCH');
  }
  if (!evidence.evidenceRef.trim() || !evidence.extractorRevision.trim()) {
    throw new Error('CACHED_PACKET_EVIDENCE_PROVENANCE_MISSING');
  }
  if (!ArrayBuffer.isView(evidence.sourceBytes)
    || evidence.sourceBytes.BYTES_PER_ELEMENT !== 1
    || !Number.isInteger(evidence.startByte)
    || !Number.isInteger(evidence.endByte)
    || evidence.startByte < 0
    || evidence.endByte <= evidence.startByte
    || evidence.endByte > evidence.sourceBytes.byteLength) {
    throw new Error('CACHED_PACKET_EVIDENCE_SPAN_INVALID');
  }
  const sourceBytes = Buffer.from(evidence.sourceBytes.buffer, evidence.sourceBytes.byteOffset, evidence.sourceBytes.byteLength);
  const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  if (sourceRevision !== evidence.sourceRevision) {
    throw new Error('CACHED_PACKET_EVIDENCE_SOURCE_REVISION_MISMATCH');
  }
  const span = sourceBytes.subarray(evidence.startByte, evidence.endByte);
  const actualText = Buffer.from(span).toString('utf8');
  if (actualText !== evidence.text || !Buffer.from(actualText, 'utf8').equals(Buffer.from(span))) {
    throw new Error('CACHED_PACKET_EVIDENCE_SPAN_TEXT_MISMATCH');
  }
  const spanChecksum = `sha256:${createHash('sha256').update(span).digest('hex')}`;
  const payload = {
    schema: 'atlas.cached-packet-source-span-verification.v1' as const,
    status: 'SOURCE_SPAN_VERIFIED_NOT_ADMITTED' as const,
    hintId: match.hintId,
    canonicalId: match.canonicalId,
    packetKey: match.packetKey,
    sourceRef: match.sourceRef,
    sourceRevision: match.sourceRevision,
    workspaceRevision: match.workspaceRevision,
    evidenceRef: evidence.evidenceRef,
    extractorRevision: evidence.extractorRevision,
    startByte: evidence.startByte,
    endByte: evidence.endByte,
    spanChecksum,
    canonicalAuthority: false as const,
    admitted: false as const,
  };
  return { ...payload, checksum: canonicalSha256V1(payload) };
}

export function verifyCachedPacketCandidateSourceBindingSpanV1(
  match: CachedPacketCandidateMatchV1,
  evidence: CachedPacketSourceSpanEvidenceV1,
  receipt: GroundedExtractionSourceBindingReceiptV1,
): CachedPacketSourceBindingSpanVerificationV1 {
  const spanVerification = verifyCachedPacketCandidateSourceSpanV1(match, evidence);
  const receiptPayload = {
    schema: receipt.schema,
    status: receipt.status,
    canonicalPacketKey: receipt.canonicalPacketKey,
    storagePacketKey: receipt.storagePacketKey,
    packetResolutionSource: receipt.packetResolutionSource,
    sourceRef: receipt.sourceRef,
    sourceRevision: receipt.sourceRevision,
    workspaceRevision: receipt.workspaceRevision,
    sourceBindingChecksum: receipt.sourceBindingChecksum,
    submittedTextChecksum: receipt.submittedTextChecksum,
    byteLength: receipt.byteLength,
    canonicalAuthority: receipt.canonicalAuthority,
    writesPerformed: receipt.writesPerformed,
  };
  const expectedReceiptChecksum = `sha256:${createHash('sha256').update(JSON.stringify(receiptPayload), 'utf8').digest('hex')}`;
  if (receipt.status !== 'VERIFIED_SOURCE_BINDING'
    || receipt.canonicalAuthority !== false
    || receipt.writesPerformed !== false
    || receipt.checksum !== expectedReceiptChecksum
    || !/^sha256:[a-f0-9]{64}$/.test(receipt.sourceBindingChecksum)
    || (receipt.canonicalPacketKey !== match.packetKey && receipt.storagePacketKey !== match.packetKey)
    || receipt.sourceRef !== match.sourceRef
    || receipt.sourceRevision !== match.sourceRevision
    || receipt.workspaceRevision !== match.workspaceRevision
    || receipt.submittedTextChecksum !== spanVerification.sourceRevision
    || receipt.byteLength !== evidence.sourceBytes.byteLength) {
    throw new Error('CACHED_PACKET_SOURCE_BINDING_RECEIPT_MISMATCH');
  }
  const payload = {
    ...spanVerification,
    canonicalPacketKey: receipt.canonicalPacketKey,
    storagePacketKey: receipt.storagePacketKey,
    packetResolutionSource: receipt.packetResolutionSource,
    sourceBindingReceiptChecksum: receipt.checksum,
    sourceBindingChecksum: receipt.sourceBindingChecksum,
  };
  return { ...payload, checksum: canonicalSha256V1(payload) };
}

export function resolveCachedPacketCandidatesV1(
  input: CachedPacketCandidateResolutionInputV1,
): CachedPacketCandidateResolutionV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  if (ordinalMap.workspaceRevision !== input.workspaceRevision) {
    throw new Error('CACHED_PACKET_CANDIDATE_WORKSPACE_REVISION_MISMATCH');
  }

  const hintIds = new Set<string>();
  const matches: CachedPacketCandidateResolutionV1['matches'] = [];
  const rejections: CachedPacketCandidateResolutionV1['rejections'] = [];

  for (const hint of [...input.hints].sort((left, right) => compareUtf8(left.hintId, right.hintId))) {
    if (!hint.hintId.trim() || hintIds.has(hint.hintId)) {
      throw new Error('CACHED_PACKET_HINT_ID_INVALID_OR_DUPLICATE');
    }
    hintIds.add(hint.hintId);

    if (hint.kind === 'CENTROID') {
      rejections.push({ hintId: hint.hintId, reason: 'CENTROID_HINT_NOT_EVIDENCE' });
      continue;
    }
    if (typeof hint.sourceRef !== 'string' || hint.sourceRef.length === 0) {
      rejections.push({ hintId: hint.hintId, reason: 'SOURCE_REF_REQUIRED' });
      continue;
    }

    const candidates = ordinalMap.candidates.filter((candidate) => candidate.sourceRef === hint.sourceRef);
    if (candidates.length === 0) {
      rejections.push({ hintId: hint.hintId, reason: 'CANONICAL_CANDIDATE_NOT_FOUND' });
      continue;
    }
    if (candidates.length !== 1) {
      rejections.push({ hintId: hint.hintId, reason: 'SOURCE_REF_AMBIGUOUS' });
      continue;
    }

    const candidate = candidates[0]!;
    matches.push({
      hintId: hint.hintId,
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef!,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
    });
  }

  const payload = {
    schema: 'atlas.cached-packet-candidate-resolution.v1' as const,
    status: matches.length > 0 ? 'RESOLVED_HINTS' as const : 'NO_RESOLVED_HINTS' as const,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    workspaceRevision: input.workspaceRevision,
    matches,
    rejections,
    evidenceStatus: 'UNVERIFIED' as const,
    canonicalAuthority: false as const,
  };
  return { ...payload, checksum: canonicalSha256V1(payload) };
}
