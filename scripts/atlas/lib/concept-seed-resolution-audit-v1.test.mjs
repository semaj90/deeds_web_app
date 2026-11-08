import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveStructuralCollisions,
  auditCollisionResolutions,
  NAMESPACE_RULES,
} from './concept-seed-resolution-audit-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');

test('deriveStructuralCollisions finds all five real collisions from concept-seed proposals', () => {
  const seedPath = path.join(REPO_ROOT, 'docs/reports/concept-seed-dry-v1.json');
  const seed = JSON.parse(readFileSync(seedPath, 'utf8'));

  const collisions = deriveStructuralCollisions(seed.proposals);
  assert.equal(collisions.length, 5);
  const labels = collisions.map((c) => c.label).sort();
  assert.deepEqual(labels, ['cache', 'database', 'graph', 'protocol', 'retrieval']);

  for (const c of collisions) {
    assert.equal(c.claimants.length, 2);
  }
});

test('auditCollisionResolutions correctly resolves 4 approved collisions and keeps protocol unresolved', () => {
  const seedPath = path.join(REPO_ROOT, 'docs/reports/concept-seed-dry-v1.json');
  const approvalPath = path.join(REPO_ROOT, 'docs/reports/concept-seed-alias-collision-resolution-proposal-v1.json');

  const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
  const approval = JSON.parse(readFileSync(approvalPath, 'utf8'));

  const audit = auditCollisionResolutions(seed.proposals, approval);

  assert.equal(audit.schema, 'atlas.concept-seed-resolution-audit.v2');
  assert.equal(audit.rawCollisions.length, 5);
  assert.equal(audit.resolved.length, 4);
  assert.equal(audit.unresolved.length, 1);

  // Check unresolved
  assert.equal(audit.unresolved[0].label, 'protocol');
  assert.deepEqual(audit.unresolved[0].claimants, [
    'concept:ontology-domain:atlas:ProtocolDomain',
    'concept:type:protocol',
  ]);

  // Check resolved details
  const resolvedLabels = audit.resolved.map((r) => r.label);
  assert.deepEqual(resolvedLabels, ['cache', 'database', 'graph', 'retrieval']);

  for (const res of audit.resolved) {
    assert.equal(res.predicate, 'ALIAS_OF');
    assert.equal(res.approval, 'HUMAN_APPROVED');
    assert.equal(res.relationStatus, 'PROPOSED_NOT_PERSISTED');
    assert.equal(res.objectConceptId, res.primaryConceptId);
    assert.equal(res.subjectConceptId, res.aliasConceptId);
  }

  // Check safety invariants
  assert.equal(audit.writesPerformed, false);
  assert.equal(audit.canonicalRelationsUpdated, false);
  assert.equal(audit.admissionAuthorized, false);

  // Check deterministic checksums
  assert.ok(audit.rawCollisionChecksum.startsWith('sha256:'));
  assert.ok(audit.approvalPairsChecksum.startsWith('sha256:'));
});

test('auditCollisionResolutions rejects unapproved status or missing documents', () => {
  assert.throws(() => auditCollisionResolutions([], null), /APPROVAL_DOCUMENT_REQUIRED/);
  assert.throws(
    () => auditCollisionResolutions([], { status: 'DRAFT_PROPOSAL', resolutions: [] }),
    /APPROVAL_STATUS_NOT_VERIFIED/
  );
});

test('auditCollisionResolutions rejects duplicate approval for same label', () => {
  const proposals = [
    { conceptId: 'concept:domain:test', canonicalLabel: 'test', namespace: NAMESPACE_RULES.primary, aliases: [] },
    { conceptId: 'concept:ontology-domain:test', canonicalLabel: 'test-ont', namespace: NAMESPACE_RULES.alias, aliases: ['test'] },
  ];
  const approval = {
    status: 'APPROVED_BY_OPERATOR',
    resolutions: [
      {
        label: 'test',
        primaryConceptId: 'concept:domain:test',
        aliasOfConceptIds: ['concept:ontology-domain:test'],
        relation: 'ALIAS_OF',
      },
      {
        label: 'test',
        primaryConceptId: 'concept:domain:test',
        aliasOfConceptIds: ['concept:ontology-domain:test'],
        relation: 'ALIAS_OF',
      },
    ],
  };

  assert.throws(() => auditCollisionResolutions(proposals, approval), /DUPLICATE_APPROVAL:test/);
});
