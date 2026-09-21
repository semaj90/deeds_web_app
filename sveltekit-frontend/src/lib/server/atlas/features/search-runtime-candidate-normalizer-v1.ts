import type { Candidate } from '../../retrieval/search-runtime.js';
import {
  materializeCandidateOrdinalMap,
  type CandidateOrdinalMapV1,
  type CanonicalCandidateIdentityInput,
} from './canonical-candidate-v1.js';

/**
 * FEAT-LIVE-01, first slice (identity half): SearchRuntime candidates -> canonical candidate identities -> CandidateOrdinalMapV1.
 *
 * Pure and read-only: no I/O, no writes, no revision inference. A candidate that cannot supply workspaceRevision AND sourceRevision is
 * REJECTED with a typed reason (never defaulted to "unknown"), and a batch with nothing admissible fails closed. Identity precedence is
 * symbol_version_id -> packet_key -> source_ref (explicitly degraded). The feature-row half (AST observation + semantic feature
 * resolvers) is a separate, later slice; nothing here decides a semantic recipe (representation bindings stay empty).
 */
export type CandidateRejectionReasonV1 =
  | 'MISSING_WORKSPACE_REVISION'
  | 'MISSING_SOURCE_REVISION'
  | 'WORKSPACE_REVISION_MISMATCH'
  | 'NO_IDENTITY'
  | 'DUPLICATE_CANONICAL_ID';

export interface SearchRuntimeCandidateNormalizationV1 {
  schema: 'atlas.search-runtime-candidate-normalization.v1';
  requested: number;
  accepted: number;
  rejected: Array<{ id: string; reasons: CandidateRejectionReasonV1[] }>;
  revisionAvailability: {
    workspaceRevision: number;
    sourceRevision: number;
    symbolVersionId: number;
    packetKey: number;
    representationId: number;
    representationRevision: number;
  };
  identityDegradedCount: number;
  ordinalMap: CandidateOrdinalMapV1 | null;
  ordinalMapError: string | null;
  failClosed: boolean;
  representationState: 'HISTORICAL_UNFROZEN';
  promotionAllowed: false;
  canonicalAuthority: false;
  writesPerformed: false;
}

const has = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function normalizeSearchRuntimeCandidatesV1(input: {
  candidates: readonly Candidate[];
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  producerRevision: string;
}): SearchRuntimeCandidateNormalizationV1 {
  const availability = { workspaceRevision: 0, sourceRevision: 0, symbolVersionId: 0, packetKey: 0, representationId: 0, representationRevision: 0 };
  const rejected: SearchRuntimeCandidateNormalizationV1['rejected'] = [];
  const accepted: CanonicalCandidateIdentityInput[] = [];
  const seen = new Set<string>();
  let degraded = 0;

  for (const c of input.candidates) {
    const symbol = c.symbolVersionId ?? c.symbol_version_id ?? null;
    const packet = has(c.packetKey) ? c.packetKey : (c.packet_key ?? null);
    const sourceRef = has(c.sourceRef) ? c.sourceRef : (c.source_ref ?? null);
    if (has(c.workspaceRevision)) availability.workspaceRevision++;
    if (has(c.sourceRevision)) availability.sourceRevision++;
    if (has(symbol)) availability.symbolVersionId++;
    if (has(packet)) availability.packetKey++;
    if (has(c.representationId)) availability.representationId++;
    if (c.representationRevision !== null && c.representationRevision !== undefined) availability.representationRevision++;

    const reasons: CandidateRejectionReasonV1[] = [];
    if (!has(c.workspaceRevision)) reasons.push('MISSING_WORKSPACE_REVISION');
    else if (c.workspaceRevision !== input.workspaceRevision) reasons.push('WORKSPACE_REVISION_MISMATCH');
    if (!has(c.sourceRevision)) reasons.push('MISSING_SOURCE_REVISION');
    const isDegraded = !has(symbol) && !has(packet);
    const canonicalId = has(symbol) ? symbol : has(packet) ? packet : has(sourceRef) ? `source_ref:${sourceRef}` : null;
    if (!canonicalId) reasons.push('NO_IDENTITY');
    else if (seen.has(canonicalId)) reasons.push('DUPLICATE_CANONICAL_ID');
    if (reasons.length) {
      rejected.push({ id: c.id, reasons });
      continue;
    }
    seen.add(canonicalId as string);
    if (isDegraded) degraded++;
    accepted.push({
      canonicalId: canonicalId as string,
      packetKey: has(packet) ? packet : null,
      sourceRef: has(sourceRef) ? sourceRef : null,
      treeNodeId: null,
      symbolVersionId: has(symbol) ? symbol : null,
      workspaceRevision: c.workspaceRevision as string,
      sourceRevision: c.sourceRevision as string,
      graphRevision: null,
      semanticRevision: null,
      degradedIdentity: isDegraded,
      evidenceRefs: [],
      representationBindings: [],
    } as CanonicalCandidateIdentityInput);
  }

  let ordinalMap: CandidateOrdinalMapV1 | null = null;
  let ordinalMapError: string | null = null;
  if (accepted.length > 0) {
    try {
      ordinalMap = materializeCandidateOrdinalMap({
        candidates: accepted,
        candidateSnapshotRevision: input.candidateSnapshotRevision,
        workspaceRevision: input.workspaceRevision,
        producerRevision: input.producerRevision,
      });
    } catch (error) {
      ordinalMapError = error instanceof Error ? error.message.slice(0, 300) : 'ORDINAL_MAP_FAILED';
    }
  }

  return {
    schema: 'atlas.search-runtime-candidate-normalization.v1',
    requested: input.candidates.length,
    accepted: accepted.length,
    rejected,
    revisionAvailability: availability,
    identityDegradedCount: degraded,
    ordinalMap,
    ordinalMapError,
    failClosed: ordinalMap === null,
    representationState: 'HISTORICAL_UNFROZEN',
    promotionAllowed: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
