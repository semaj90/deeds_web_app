/**
 * ContextEvidenceAssemblerV1 — PROTOTYPE (read-only, pure function, no I/O).
 *
 * Accepts only revision-qualified evidence and returns typed rejection reasons for everything else.
 * It does not persist, admit, or call a model. Part of openspec/changes/parent-atlas-source-qualified-corpus-admission.
 *
 * Qualified evidence requires: a source ref, a sha256 source revision, a canonical concept id,
 * and a workspace revision. Missing or malformed fields are rejected, never defaulted.
 */
import { createHash } from 'node:crypto';

export type EvidenceRejectionReason =
  | 'MISSING_EVIDENCE_ID'
  | 'MISSING_TEXT'
  | 'CONFLICTING_EVIDENCE_ID'
  | 'MISSING_SOURCE_REF'
  | 'MISSING_SOURCE_REVISION'
  | 'MALFORMED_SOURCE_REVISION'
  | 'MISSING_WORKSPACE_REVISION'
  | 'MALFORMED_WORKSPACE_REVISION'
  | 'MISSING_CANONICAL_CONCEPT'
  | 'MISSING_ENCODER_IDENTITY'
  | 'MISSING_EVIDENCE_KIND'
  | 'MISSING_PRODUCER_REVISION'
  | 'MISSING_BYTE_SPAN'
  | 'MALFORMED_BYTE_SPAN'
  | 'STALE_SOURCE_REVISION';

export type EvidenceKind = 'source' | 'ast' | 'edge' | 'lexical' | 'taxonomy';
const KINDS: readonly EvidenceKind[] = ['source', 'ast', 'edge', 'lexical', 'taxonomy'];

export interface EvidenceCandidate {
  evidenceId: string;
  sourceRef?: string | null;
  sourceRevision?: string | null;
  workspaceRevision?: string | null;
  canonicalFeatureId?: string | null;
  encoderId?: string | null;
  /** Required identity beyond the source revision (ENR table). Missing kind is rejected, never defaulted. */
  kind?: EvidenceKind | null;
  producerRevision?: string | null;
  byteSpan?: [number, number] | null;
  /** Taxonomy only: UNRESOLVED proposals are reported separately and never accepted as canonical. */
  taxonomyStatus?: 'RESOLVED' | 'UNRESOLVED' | null;
  text: string;
}

export interface AssembledEvidence extends Omit<EvidenceCandidate, 'sourceRef' | 'sourceRevision' | 'workspaceRevision' | 'canonicalFeatureId' | 'encoderId' | 'kind' | 'producerRevision' | 'byteSpan' | 'taxonomyStatus'> {
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  canonicalFeatureId: string;
  encoderId: string;
  kind: EvidenceKind;
  producerRevision: string | null;
  byteSpan: [number, number] | null;
}

export interface AssemblyOptions {
  /** Expected source revision per sourceRef, from a validated workspace snapshot. Mismatch = stale join. */
  snapshot?: Record<string, string>;
}

export interface AssemblyResult {
  schema: 'atlas.context-evidence-assembly.v1';
  accepted: AssembledEvidence[];
  /** Taxonomy proposals without a resolved crosswalk. Reported, never admitted. */
  unresolved: Array<{ evidenceId: string; kind: 'taxonomy' }>;
  rejected: Array<{ evidenceId: string; reasons: EvidenceRejectionReason[] }>;
  checksum: string;
  canonicalAuthority: false;
  writesPerformed: 0;
}

const SHA256 = /^sha256:[0-9a-f]{64}$/;

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !['0', 'null', 'unknown'].includes(value.trim().toLowerCase());
}

function reasonsFor(c: EvidenceCandidate): EvidenceRejectionReason[] {
  const reasons: EvidenceRejectionReason[] = [];
  if (!nonblank(c.evidenceId)) reasons.push('MISSING_EVIDENCE_ID');
  if (!nonblank(c.text)) reasons.push('MISSING_TEXT');
  if (!nonblank(c.sourceRef)) reasons.push('MISSING_SOURCE_REF');
  if (!nonblank(c.sourceRevision)) reasons.push('MISSING_SOURCE_REVISION');
  else if (!SHA256.test(c.sourceRevision)) reasons.push('MALFORMED_SOURCE_REVISION');
  if (!nonblank(c.workspaceRevision)) reasons.push('MISSING_WORKSPACE_REVISION');
  else if (!SHA256.test(c.workspaceRevision)) reasons.push('MALFORMED_WORKSPACE_REVISION');
  if (!nonblank(c.canonicalFeatureId)) reasons.push('MISSING_CANONICAL_CONCEPT');
  if (!nonblank(c.encoderId)) reasons.push('MISSING_ENCODER_IDENTITY');
  // Kind-specific identity. The kind is required: a missing kind is rejected, never defaulted.
  if (!c.kind || !KINDS.includes(c.kind)) {
    reasons.push('MISSING_EVIDENCE_KIND');
  } else if (c.kind === 'ast' || c.kind === 'edge') {
    if (!nonblank(c.producerRevision)) reasons.push('MISSING_PRODUCER_REVISION');
    if (c.kind === 'ast') {
      if (!c.byteSpan) reasons.push('MISSING_BYTE_SPAN');
      else if (!Array.isArray(c.byteSpan) || c.byteSpan.length !== 2 || !c.byteSpan.every(Number.isInteger) || c.byteSpan[0] < 0 || c.byteSpan[1] <= c.byteSpan[0]) {
        reasons.push('MALFORMED_BYTE_SPAN');
      }
    }
  }
  return reasons;
}

/** Deterministic order: sourceRef, then evidenceId. Checksum covers accepted records only. */
export function assembleContextEvidenceV1(candidates: EvidenceCandidate[], options: AssemblyOptions = {}): AssemblyResult {
  const accepted: AssembledEvidence[] = [];
  const rejected: AssemblyResult['rejected'] = [];
  const unresolved: AssemblyResult['unresolved'] = [];
  const identities = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (!identities.has(candidate.evidenceId)) identities.set(candidate.evidenceId, new Set());
    identities.get(candidate.evidenceId)!.add(JSON.stringify([
      candidate.sourceRef, candidate.sourceRevision, candidate.workspaceRevision,
      candidate.canonicalFeatureId, candidate.encoderId, candidate.text,
      candidate.kind, candidate.producerRevision, candidate.byteSpan, candidate.taxonomyStatus,
    ]));
  }
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.evidenceId)) continue;
    seen.add(c.evidenceId);
    const reasons: EvidenceRejectionReason[] = identities.get(c.evidenceId)!.size > 1
      ? ['CONFLICTING_EVIDENCE_ID'] : reasonsFor(c);
    if (reasons.length === 0 && options.snapshot) {
      const expected = options.snapshot[c.sourceRef as string];
      if (expected !== c.sourceRevision) reasons.push('STALE_SOURCE_REVISION');
    }
    if (reasons.length > 0) {
      rejected.push({ evidenceId: c.evidenceId, reasons });
    } else if (c.kind === 'taxonomy' && c.taxonomyStatus !== 'RESOLVED') {
      // An unresolved taxonomy proposal stays unresolved: it is reported, never admitted as canonical.
      unresolved.push({ evidenceId: c.evidenceId, kind: 'taxonomy' });
    } else {
      accepted.push({
        evidenceId: c.evidenceId,
        text: c.text,
        sourceRef: c.sourceRef as string,
        sourceRevision: c.sourceRevision as string,
        workspaceRevision: c.workspaceRevision as string,
        canonicalFeatureId: c.canonicalFeatureId as string,
        encoderId: c.encoderId as string,
        kind: c.kind as EvidenceKind,
        producerRevision: c.producerRevision ?? null,
        byteSpan: c.byteSpan ?? null,
      });
    }
  }
  accepted.sort((a, b) => (a.sourceRef === b.sourceRef ? (a.evidenceId < b.evidenceId ? -1 : 1) : a.sourceRef < b.sourceRef ? -1 : 1));
  rejected.sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : 1));
  unresolved.sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : 1));
  const checksum = 'sha256:' + createHash('sha256').update(JSON.stringify(accepted)).digest('hex');
  return { schema: 'atlas.context-evidence-assembly.v1', accepted, unresolved, rejected, checksum, canonicalAuthority: false, writesPerformed: 0 };
}
