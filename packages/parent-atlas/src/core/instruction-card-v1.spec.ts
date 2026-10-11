import { describe, expect, it } from 'vitest';
import { instructionCardV1Schema, parseInstructionCardV1 } from './instruction-card-v1.js';

const hash = 'a'.repeat(64);
const fixture = () => ({
  schema: 'atlas.instruction-card.v1',
  cardId: 'card:1', cardRevision: 'rev:1',
  requestId: 'req:1', workflowId: 'workflow:1',
  dagNodeId: 'dag:1', actionId: 'action:1',
  kernelBindingRef: 'binding:1', kernelBindingChecksum: hash,
  algorithmManifestRef: 'manifest:1',
  sourceSnapshotRevision: 'source:1',
  workspaceRevision: 'workspace:1',
  representationRevision: 'representation:1',
  graphSnapshotRevision: null,
  contextManifestChecksum: null,
  expectedInputChecksum: hash,
  expectedOutputSchemaId: 'schema:output',
  dependencyCardIds: [], requiredEvidenceRefs: ['evidence:1'],
  routingHint: 'cpu', admission: 'NOT_PERFORMED',
  executable: false, canonicalAuthority: false,
});

describe('InstructionCardV1 descriptor-only proof', () => {
  it('accepts a revision-qualified non-executable card', () => {
    expect(parseInstructionCardV1(fixture()).kernelBindingRef).toBe('binding:1');
  });
  it('rejects attempts to claim executable or canonical authority', () => {
    expect(instructionCardV1Schema.safeParse({ ...fixture(), executable: true }).success).toBe(false);
    expect(instructionCardV1Schema.safeParse({ ...fixture(), canonicalAuthority: true }).success).toBe(false);
    expect(instructionCardV1Schema.safeParse({ ...fixture(), admission: 'ADMITTED' }).success).toBe(false);
  });
  it('rejects missing evidence and malformed checksums', () => {
    expect(instructionCardV1Schema.safeParse({ ...fixture(), requiredEvidenceRefs: [] }).success).toBe(false);
    expect(instructionCardV1Schema.safeParse({ ...fixture(), kernelBindingChecksum: 'wrong' }).success).toBe(false);
  });
  it('rejects self references, duplicate dependencies and extra fields', () => {
    expect(instructionCardV1Schema.safeParse({ ...fixture(), dependencyCardIds: ['card:1'] }).success).toBe(false);
    expect(instructionCardV1Schema.safeParse({ ...fixture(), dependencyCardIds: ['card:2', 'card:2'] }).success).toBe(false);
    expect(instructionCardV1Schema.safeParse({ ...fixture(), shellCommand: 'rm -rf /' }).success).toBe(false);
  });
});
