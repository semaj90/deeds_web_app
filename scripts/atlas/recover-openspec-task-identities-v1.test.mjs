import test from 'node:test';
import assert from 'node:assert/strict';

import { recoverOpenSpecTaskIdentitiesV1 } from './recover-openspec-task-identities-v1.mjs';

function task({ changeId, authorityScope = 'openspec://root', declaredTaskId, normalizedClaimHash, archived = false, sourceLine, logicalTaskKey = null, identityState = 'DECLARED_ID', derivedTaskKey = null, sectionSlug = null, taskBody = null }) {
  return {
    taskRef: `openspec/changes/${changeId}/tasks.md#L${sourceLine}`,
    authorityScope,
    changeId,
    archived,
    taskId: declaredTaskId,
    taskText: normalizedClaimHash ?? `Claim ${sourceLine}`,
    dependencySourceText: taskBody,
    taskHash: `sha256:source-${sourceLine}`,
    taskIdentity: {
      declaredTaskId,
      derivedTaskKey: derivedTaskKey ?? `sha256:derived-${sourceLine}`,
      logicalTaskKey,
      identityState,
      normalizedClaimHash,
      sectionSlug,
      migrationKey: null,
    },
  };
}

test('retains a derived key as proposal-only alias when an authored ID exists', () => {
  const report = recoverOpenSpecTaskIdentitiesV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [task({ changeId: 'foo', authorityScope: 'openspec://root', declaredTaskId: 'EVF-03', normalizedClaimHash: 'sha256:abc123', derivedTaskKey: 'derived/abc123', sourceLine: 1 })],
  });
  assert.deepEqual(report.mappings[0].aliasProposals, [{
    aliasKey: 'openspec://root/foo/derived/abc123',
    aliasKind: 'DERIVED_KEY',
    disposition: 'PROPOSAL_ONLY',
  }]);
  assert.equal(report.aliasProposals[0].canonicalTaskKey, 'openspec://root/foo/EVF-03');
});

test('emits bounded duplicate classes with grouped source references', () => {
  const report = recoverOpenSpecTaskIdentitiesV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [
      task({ changeId: 'alpha', declaredTaskId: 'A-01', normalizedClaimHash: 'sha256:claim-a', sourceLine: 10 }),
      task({ changeId: 'alpha', declaredTaskId: 'A-01', normalizedClaimHash: 'sha256:claim-a', sourceLine: 20, archived: true }),
      task({ changeId: 'beta', declaredTaskId: 'A-01', normalizedClaimHash: 'sha256:claim-b', sourceLine: 30 }),
      task({ changeId: 'gamma', declaredTaskId: null, normalizedClaimHash: 'sha256:claim-a', sourceLine: 40 }),
    ],
  });

  assert.equal(report.summary.sourceFilesMutated, false);
  assert.ok(report.summary.duplicateDiagnosticGroupCount > 0);
  assert.ok(report.summary.duplicateClassCounts.DUPLICATE_DECLARED_ID_SAME_CHANGE >= 1);
  assert.ok(report.summary.duplicateClassCounts.DUPLICATE_DECLARED_ID_CROSS_CHANGE >= 1);
  assert.ok(report.summary.duplicateClassCounts.DUPLICATE_NORMALIZED_CLAIM_CROSS_CHANGE >= 1);
  assert.ok(report.summary.duplicateClassCounts.ARCHIVE_DUPLICATE >= 1);
  assert.ok(report.duplicateDiagnostics.every((diagnostic) => diagnostic.sourceRefs.length >= 2));
});

test('keeps a unique declared logical key when the normalized claim collides', () => {
  const row = task({
    changeId: 'alpha',
    declaredTaskId: 'A-01',
    normalizedClaimHash: 'sha256:repeated-claim',
    sourceLine: 10,
    logicalTaskKey: 'alpha:A-01',
    identityState: 'AMBIGUOUS',
  });
  const report = recoverOpenSpecTaskIdentitiesV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [row],
  });

  assert.equal(report.mappings[0].identityState, 'DECLARED_ID');
  assert.equal(report.mappings[0].canonicalTaskKey, 'openspec://root/alpha/A-01');
  assert.equal(report.mappings[0].canonicalKeyAdmitted, true);
});

test('disambiguates repeated implicit claims only when stable section slugs are unique', () => {
  const common = {
    changeId: 'alpha',
    declaredTaskId: null,
    normalizedClaimHash: 'sha256:repeated-claim',
    derivedTaskKey: 'sha256:repeated-claim',
    identityState: 'AMBIGUOUS',
  };
  const first = task({ ...common, sourceLine: 10, sectionSlug: 'phase-one' });
  const second = task({ ...common, sourceLine: 20, sectionSlug: 'phase-two' });
  const report = recoverOpenSpecTaskIdentitiesV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [first, second],
  });

  assert.deepEqual(report.mappings.map((mapping) => mapping.identityState), ['DERIVED_STABLE_KEY', 'DERIVED_STABLE_KEY']);
  assert.equal(new Set(report.mappings.map((mapping) => mapping.canonicalTaskKey)).size, 2);
  assert.equal(report.mappings.every((mapping) => mapping.canonicalKeyAdmitted), true);
  assert.equal(report.summary.canonicalKeyCollisionGroupCount, 0);
  assert.deepEqual(
    report.mappings.map((mapping) => mapping.canonicalTaskKey),
    recoverOpenSpecTaskIdentitiesV1({
      schema: 'atlas.openspec-evidence-portfolio-census.v2',
      source: { workspaceRevision: 'sha256:workspace' },
      tasks: [second, first],
    }).mappings.reverse().map((mapping) => mapping.canonicalTaskKey),
  );
});

test('keeps repeated implicit claims conflicting when their section slugs also collide', () => {
  const common = {
    changeId: 'alpha',
    declaredTaskId: null,
    normalizedClaimHash: 'sha256:repeated-claim',
    derivedTaskKey: 'sha256:repeated-claim',
    identityState: 'AMBIGUOUS',
    sectionSlug: 'same-section',
  };
  const report = recoverOpenSpecTaskIdentitiesV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [task({ ...common, sourceLine: 10 }), task({ ...common, sourceLine: 20 })],
  });

  assert.deepEqual(report.mappings.map((mapping) => mapping.identityState), ['CONFLICTING', 'CONFLICTING']);
  assert.equal(report.summary.canonicalKeyCollisionGroupCount, 1);
  assert.equal(report.mappings.every((mapping) => !mapping.canonicalKeyAdmitted), true);
});

test('disambiguates duplicate claim titles by checkbox-independent task block content', () => {
  const tasks = [
    task({ changeId: 'change-a', sourceLine: 12, identityState: 'AMBIGUOUS', normalizedClaimHash: 'sha256:same-claim', derivedTaskKey: 'sha256:same-claim', sectionSlug: 'repeated-section', taskBody: '- [x] repeated claim\n  command: run alpha' }),
    task({ changeId: 'change-a', sourceLine: 30, identityState: 'AMBIGUOUS', normalizedClaimHash: 'sha256:same-claim', derivedTaskKey: 'sha256:same-claim', sectionSlug: 'repeated-section', taskBody: '- [ ] repeated claim\n  command: run beta' }),
  ];
  const census = { schema: 'atlas.openspec-evidence-portfolio-census.v2', source: { workspaceRevision: 'sha256:workspace' }, tasks };
  const report = recoverOpenSpecTaskIdentitiesV1(census);
  const reversed = recoverOpenSpecTaskIdentitiesV1({ ...census, tasks: [...tasks].reverse() });
  const keysByRef = (value) => Object.fromEntries(value.mappings.map((mapping) => [mapping.sourceRef, mapping.canonicalTaskKey]));

  assert.deepEqual(report.mappings.map((mapping) => mapping.identityState), ['DERIVED_STABLE_KEY', 'DERIVED_STABLE_KEY']);
  assert.deepEqual(keysByRef(report), keysByRef(reversed));
});

test('admits unique headings while isolating only the repeated-heading collision', () => {
  const common = {
    changeId: 'alpha',
    declaredTaskId: null,
    normalizedClaimHash: 'sha256:repeated-claim',
    derivedTaskKey: 'sha256:repeated-claim',
    identityState: 'AMBIGUOUS',
  };
  const report = recoverOpenSpecTaskIdentitiesV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [
      task({ ...common, sourceLine: 10, sectionSlug: 'unique-section' }),
      task({ ...common, sourceLine: 20, sectionSlug: 'repeated-section' }),
      task({ ...common, sourceLine: 30, sectionSlug: 'repeated-section' }),
    ],
  });

  assert.equal(report.mappings[0].identityState, 'DERIVED_STABLE_KEY');
  assert.equal(report.mappings[0].canonicalKeyAdmitted, true);
  assert.deepEqual(report.mappings.slice(1).map((mapping) => mapping.identityState), ['CONFLICTING', 'CONFLICTING']);
  assert.equal(report.summary.canonicalKeyCollisionGroupCount, 1);
  assert.equal(report.summary.canonicalKeyCollisionTaskCount, 2);
});
