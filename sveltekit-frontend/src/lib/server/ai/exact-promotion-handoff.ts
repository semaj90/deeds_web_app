import { createHash } from 'node:crypto';

export type PromotionIdentityStatus = 'canonical' | 'degraded';

export interface ExactPromotionCandidateRefV1 {
  candidateOrdinal: number;
  canonicalId: string;
  identityStatus: PromotionIdentityStatus;
  identitySource: 'canonical_id' | 'symbol_version_id' | 'packet_key' | 'source_ref';
  packetKey?: string | null;
  symbolVersionId?: string | null;
  sourceRef?: string | null;
  sourceRevision?: string | null;
  semanticScore: number;
  recommendationScore: number;
  /** Diagnostic only. Never participates in canonical identity resolution. */
  qdrantPointId?: string | null;
}

export interface ExactPromotionHandoffV1 {
  schema: 'atlas.exact-promotion-handoff.v1';
  requestId: string;
  workspaceRevision: string;
  graphRevision?: string | null;
  representationRevision: string;
  recommendationReceiptId: string;
  required: boolean;
  candidates: ExactPromotionCandidateRefV1[];
  unresolvedCandidateOrdinals: number[];
  degradedCandidateOrdinals: number[];
  status: 'READY_FOR_EXACT_PROMOTION' | 'BLOCKED_IDENTITY_GAP';
  checksum: string;
}

export interface PromotionIdentityPayload {
  canonical_id?: unknown;
  canonicalId?: unknown;
  symbol_version_id?: unknown;
  symbolVersionId?: unknown;
  packet_key?: unknown;
  packetKey?: unknown;
  source_ref?: unknown;
  sourceRef?: unknown;
  source_revision?: unknown;
  sourceRevision?: unknown;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stable(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

/**
 * Resolve promotion identity without ever consulting a Qdrant point id.
 *
 * Strong identity precedence:
 *   explicit canonical_id > symbol_version_id > packet_key > source_ref
 *
 * source_ref is intentionally marked degraded. It can support read-only evidence
 * inspection, but cannot authorize a mutation that requires canonical proof.
 */
export function resolvePromotionIdentity(payload: PromotionIdentityPayload): {
  canonicalId: string;
  identityStatus: PromotionIdentityStatus;
  identitySource: ExactPromotionCandidateRefV1['identitySource'];
} | null {
  const explicitCanonical = text(payload.canonical_id) ?? text(payload.canonicalId);
  if (explicitCanonical) {
    return { canonicalId: explicitCanonical, identityStatus: 'canonical', identitySource: 'canonical_id' };
  }

  const symbolVersionId = text(payload.symbol_version_id) ?? text(payload.symbolVersionId);
  if (symbolVersionId) {
    return { canonicalId: symbolVersionId, identityStatus: 'canonical', identitySource: 'symbol_version_id' };
  }

  const packetKey = text(payload.packet_key) ?? text(payload.packetKey);
  if (packetKey) {
    return { canonicalId: packetKey, identityStatus: 'canonical', identitySource: 'packet_key' };
  }

  const sourceRef = text(payload.source_ref) ?? text(payload.sourceRef);
  if (sourceRef) {
    return { canonicalId: sourceRef, identityStatus: 'degraded', identitySource: 'source_ref' };
  }

  return null;
}

export function buildExactPromotionCandidate(input: {
  candidateOrdinal: number;
  payload: PromotionIdentityPayload;
  semanticScore: number;
  recommendationScore: number;
  qdrantPointId?: string | null;
}): ExactPromotionCandidateRefV1 | null {
  const identity = resolvePromotionIdentity(input.payload);
  if (!identity) return null;

  return {
    candidateOrdinal: input.candidateOrdinal,
    ...identity,
    packetKey: text(input.payload.packet_key) ?? text(input.payload.packetKey),
    symbolVersionId: text(input.payload.symbol_version_id) ?? text(input.payload.symbolVersionId),
    sourceRef: text(input.payload.source_ref) ?? text(input.payload.sourceRef),
    sourceRevision: text(input.payload.source_revision) ?? text(input.payload.sourceRevision),
    semanticScore: input.semanticScore,
    recommendationScore: input.recommendationScore,
    qdrantPointId: input.qdrantPointId ?? null,
  };
}

export function buildExactPromotionHandoff(input: {
  requestId: string;
  workspaceRevision: string;
  graphRevision?: string | null;
  representationRevision: string;
  recommendationReceiptId: string;
  required: boolean;
  candidates: Array<ExactPromotionCandidateRefV1 | null>;
}): ExactPromotionHandoffV1 {
  const resolved = input.candidates.filter((candidate): candidate is ExactPromotionCandidateRefV1 => candidate !== null);
  const suppliedOrdinals = new Set(resolved.map((candidate) => candidate.candidateOrdinal));
  const maxOrdinal = input.candidates.length;
  const unresolvedCandidateOrdinals = Array.from({ length: maxOrdinal }, (_, index) => index)
    .filter((ordinal) => !suppliedOrdinals.has(ordinal));
  const degradedCandidateOrdinals = resolved
    .filter((candidate) => candidate.identityStatus === 'degraded')
    .map((candidate) => candidate.candidateOrdinal)
    .sort((a, b) => a - b);

  const candidates = [...resolved].sort(
    (a, b) => b.recommendationScore - a.recommendationScore || a.candidateOrdinal - b.candidateOrdinal,
  );
  const blocked = input.required && (unresolvedCandidateOrdinals.length > 0 || degradedCandidateOrdinals.length > 0);

  const body = {
    schema: 'atlas.exact-promotion-handoff.v1' as const,
    requestId: input.requestId,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision ?? null,
    representationRevision: input.representationRevision,
    recommendationReceiptId: input.recommendationReceiptId,
    required: input.required,
    candidates,
    unresolvedCandidateOrdinals,
    degradedCandidateOrdinals,
    status: blocked ? 'BLOCKED_IDENTITY_GAP' as const : 'READY_FOR_EXACT_PROMOTION' as const,
  };

  return { ...body, checksum: sha256(body) };
}
