import { describe, expect, it } from 'vitest';
import {
  classifyGraphifyStructuralPersistenceProofV1,
  type GraphifyStructuralPersistenceObservationV1,
} from './graphify-structural-persistence-proof-v1.js';

function base(overrides: Partial<GraphifyStructuralPersistenceObservationV1> = {}): GraphifyStructuralPersistenceObservationV1 {
  return {
    schema: 'atlas.graphify-structural-persistence-observation.v1',
    tableExists: true,
    columns: [
      { name: 'evidence_id', dataType: 'text', nullable: false },
      { name: 'evidence_kind', dataType: 'text', nullable: false },
      { name: 'source_ref', dataType: 'text', nullable: false },
      { name: 'source_revision', dataType: 'text', nullable: false },
      { name: 'evidence_revision', dataType: 'text', nullable: false },
      { name: 'producer_revision', dataType: 'text', nullable: false },
      { name: 'payload', dataType: 'jsonb', nullable: false },
    ],
    sourceRevisionIndexPresent: true,
    structuralRowCount: 0,
    suspiciousPseudoRevisionCount: 0,
    sampleEvidenceId: null,
    repositoryReadbackStatus: 'NOT_ATTEMPTED',
    repositoryReadbackChecksum: null,
    revisionOwnerProven: false,
    canonicalWriteAttempted: false,
    producerRevision: 'gph18-test.v1',
    ...overrides,
  };
}

describe('GPH-18 structural persistence proof', () => {
  it('identifies the persistence owner but blocks canonical persistence while revision ownership is unproven', () => {
    const proof = classifyGraphifyStructuralPersistenceProofV1(base());
    expect(proof.status).toBe('PERSISTENCE_OWNER_IDENTIFIED_NO_STRUCTURAL_ROWS_REVISION_BLOCKED');
    expect(proof.canonicalPersistenceAuthorized).toBe(false);
    expect(proof.blockers).toContain('SOURCE_REVISION_OWNER_NOT_PROVEN');
    expect(proof.canonicalWriteAttempted).toBe(false);
  });

  it('allows existing-row readback proof without authorizing new canonical writes', () => {
    const proof = classifyGraphifyStructuralPersistenceProofV1(base({
      structuralRowCount: 1,
      sampleEvidenceId: 'evidence:existing',
      repositoryReadbackStatus: 'PROVEN',
      repositoryReadbackChecksum: 'a'.repeat(64),
    }));
    expect(proof.status).toBe('PERSISTENCE_OWNER_IDENTIFIED_READBACK_PROVEN_REVISION_BLOCKED');
    expect(proof.repositoryReadbackExistingRowProven).toBe(true);
    expect(proof.canonicalPersistenceAuthorized).toBe(false);
  });

  it('fails closed when pseudo-revisions already exist in the canonical ledger', () => {
    const proof = classifyGraphifyStructuralPersistenceProofV1(base({ suspiciousPseudoRevisionCount: 3 }));
    expect(proof.status).toBe('PERSISTENCE_OWNER_IDENTIFIED_PSEUDOREVISION_DETECTED');
    expect(proof.blockers).toContain('PSEUDOREVISION_ROWS_DETECTED');
    expect(proof.canonicalPersistenceAuthorized).toBe(false);
  });

  it('requires revision ownership before reporting canonical persistence ready', () => {
    const proof = classifyGraphifyStructuralPersistenceProofV1(base({ revisionOwnerProven: true }));
    expect(proof.status).toBe('CANONICAL_PERSISTENCE_READY');
    expect(proof.canonicalPersistenceAuthorized).toBe(true);
  });
});
