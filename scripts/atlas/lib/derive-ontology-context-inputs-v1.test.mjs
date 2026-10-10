import assert from 'node:assert/strict';
import test from 'node:test';
import { planOntologyContextInputsV1 } from '../derive-ontology-context-inputs-v1.mjs';

const candidate = {
  packetKey: 'packet:1',
  sourceRef: 'src/ace.ts',
  sourceRevision: 'sha256:source-r1',
  workspaceRevision: 'sha256:workspace-r1',
  ordinalMapChecksum: 'sha256:ordinal-r1',
  ordinalMapIntegrityVerified: true,
};

const relation = {
  kind: 'RELATION',
  packetKey: candidate.packetKey,
  sourceRef: candidate.sourceRef,
  sourceRevision: candidate.sourceRevision,
  spanVerified: true,
  participantRolesVerified: true,
  evidenceRef: 'evidence:callsite-1',
};

const tuple = {
  tupleId: 'tuple:1',
  packetKey: candidate.packetKey,
  sourceRef: candidate.sourceRef,
  evidenceRefs: [relation.evidenceRef],
  provenance: {
    sourceRevision: candidate.sourceRevision,
    ontologyRevision: 'ontology:r1',
  },
  admissionReadbackVerified: true,
};

const manifest = {
  identityChecksumVerified: true,
  sourceRefs: [candidate.sourceRef],
  admittedTupleIds: [tuple.tupleId],
  sourceRevision: candidate.sourceRevision,
  ontologyRevision: tuple.provenance.ontologyRevision,
};

test('centroid/cache hints stay routing-only and cannot satisfy relation or tuple gates', () => {
  const plan = planOntologyContextInputsV1({ cacheHint: { centroidId: 'centroid:1' } });

  assert.equal(plan.cacheHintStatus, 'ROUTING_HINT_ONLY');
  assert.equal(plan.verifiedFactAdmission, false);
  assert.equal(plan.liveProven, false);
  assert.equal(plan.writesPerformed, false);
  assert.equal(plan.nextRequiredOwner, 'CANONICAL_CANDIDATE');
  assert.ok(plan.gates.every((gate) => gate.status === 'BLOCKED'));
});

test('missing grounded relation blocks tuple and ContextManifest claims', () => {
  const plan = planOntologyContextInputsV1({ candidate, tuple, manifest });

  assert.equal(plan.gates[0].status, 'IDENTITY_CLAIMS_MATCH');
  assert.equal(plan.gates[1].status, 'BLOCKED');
  assert.equal(plan.gates[2].status, 'BLOCKED');
  assert.equal(plan.gates[3].status, 'BLOCKED');
  assert.equal(plan.nextRequiredOwner, 'GROUNDED_RELATION');
  assert.equal(plan.liveProven, false);
});

test('source revision mismatch blocks ontology tuple readback', () => {
  const staleTuple = {
    ...tuple,
    provenance: { ...tuple.provenance, sourceRevision: 'sha256:old-source' },
  };
  const plan = planOntologyContextInputsV1({ candidate, relation, tuple: staleTuple, manifest });

  assert.equal(plan.gates[1].status, 'IDENTITY_CLAIMS_MATCH');
  assert.equal(plan.gates[2].status, 'BLOCKED');
  assert.equal(plan.gates[3].status, 'BLOCKED');
  assert.equal(plan.nextRequiredOwner, 'ONTOLOGY_TUPLE_READBACK');
});

test('missing tuple admission readback blocks ContextManifest derivation', () => {
  const unadmittedTuple = { ...tuple, admissionReadbackVerified: false };
  const plan = planOntologyContextInputsV1({ candidate, relation, tuple: unadmittedTuple, manifest });

  assert.equal(plan.gates[2].status, 'BLOCKED');
  assert.equal(plan.gates[3].status, 'BLOCKED');
  assert.equal(plan.nextRequiredOwner, 'ONTOLOGY_TUPLE_READBACK');
  assert.equal(plan.verifiedFactAdmission, false);
});

test('a complete claims-matching fixture still cannot claim live proof or admission', () => {
  const plan = planOntologyContextInputsV1({ candidate, relation, tuple, manifest });

  assert.ok(plan.gates.every((gate) => gate.status === 'IDENTITY_CLAIMS_MATCH'));
  assert.equal(plan.nextRequiredOwner, null);
  assert.equal(plan.verifiedFactAdmission, false);
  assert.equal(plan.liveProven, false);
  assert.equal(plan.writesPerformed, false);
});
