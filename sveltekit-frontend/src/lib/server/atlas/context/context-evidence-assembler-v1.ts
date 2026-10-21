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
  | 'MISSING_ENCODER_IDENTITY';

export interface EvidenceCandidate {
  evidenceId: string;
  sourceRef?: string | null;
  sourceRevision?: string | null;
  workspaceRevision?: string | null;
  canonicalFeatureId?: string | null;
  encoderId?: string | null;
  text: string;
}

export interface AssembledEvidence extends Omit<EvidenceCandidate, 'sourceRef' | 'sourceRevision' | 'workspaceRevision' | 'canonicalFeatureId' | 'encoderId'> {
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  canonicalFeatureId: string;
  encoderId: string;
}

export interface AssemblyResult {
  schema: 'atlas.context-evidence-assembly.v1';
  accepted: AssembledEvidence[];
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
  return reasons;
}

/** Deterministic order: sourceRef, then evidenceId. Checksum covers accepted records only. */
export function assembleContextEvidenceV1(candidates: EvidenceCandidate[]): AssemblyResult {
  const accepted: AssembledEvidence[] = [];
  const rejected: AssemblyResult['rejected'] = [];
  const identities = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (!identities.has(candidate.evidenceId)) identities.set(candidate.evidenceId, new Set());
    identities.get(candidate.evidenceId)!.add(JSON.stringify([
      candidate.sourceRef, candidate.sourceRevision, candidate.workspaceRevision,
      candidate.canonicalFeatureId, candidate.encoderId, candidate.text,
    ]));
  }
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.evidenceId)) continue;
    seen.add(c.evidenceId);
    const reasons: EvidenceRejectionReason[] = identities.get(c.evidenceId)!.size > 1
      ? ['CONFLICTING_EVIDENCE_ID'] : reasonsFor(c);
    if (reasons.length === 0) {
      accepted.push({
        evidenceId: c.evidenceId,
        text: c.text,
        sourceRef: c.sourceRef as string,
        sourceRevision: c.sourceRevision as string,
        workspaceRevision: c.workspaceRevision as string,
        canonicalFeatureId: c.canonicalFeatureId as string,
        encoderId: c.encoderId as string,
      });
    } else {
      rejected.push({ evidenceId: c.evidenceId, reasons });
    }
  }
  accepted.sort((a, b) => (a.sourceRef === b.sourceRef ? (a.evidenceId < b.evidenceId ? -1 : 1) : a.sourceRef < b.sourceRef ? -1 : 1));
  rejected.sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : 1));
  const checksum = 'sha256:' + createHash('sha256').update(JSON.stringify(accepted)).digest('hex');
  return { schema: 'atlas.context-evidence-assembly.v1', accepted, rejected, checksum, canonicalAuthority: false, writesPerformed: 0 };
}
