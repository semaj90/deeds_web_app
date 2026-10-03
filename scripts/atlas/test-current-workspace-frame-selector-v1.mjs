#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveCurrentWorkspaceFrameV1, computeWorkspaceFrameAuthorityV1 } from './lib/current-workspace-frame-selector-v1.mjs';

function fixture(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-frame-selector-'));
  fs.mkdirSync(path.join(root, 'docs/reports'), { recursive: true });
  for (const [relative, value] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  return root;
}

const admitted = (revision, snapshotRevision = 'sha256:snap') => ({
  status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
  authority: true,
  workspaceRevision: revision,
  snapshotRevision,
});
const derived = (revision, snapshotRevision = 'sha256:snap') => ({
  status: 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION',
  workspaceRevisionCandidate: revision,
  snapshotRevision,
});
const plan = (revision, snapshotRevision = 'sha256:snap') => ({
  status: 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED',
  workspaceRevisionCandidate: revision,
  snapshotRevision,
});

test('admission beats a newer derived candidate', () => {
  const root = fixture({
    'docs/reports/workspace-revision-tournament-admission-v1.json': admitted('sha256:admitted'),
    'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json': derived('sha256:derived'),
    'docs/reports/graphify-source-selection-plan-v1.json': plan('sha256:derived'),
  });
  const result = resolveCurrentWorkspaceFrameV1({ root, argv: [], env: {} });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_SELECTED');
  assert.equal(result.selectedWorkspaceRevision, 'sha256:admitted');
  assert.equal(result.selectedSource, 'WORKSPACE_REVISION_TOURNAMENT_ADMISSION_RECEIPT');
});

test('conflicting authoritative receipts fail closed', () => {
  const root = fixture({
    'docs/reports/workspace-revision-tournament-admission-v1.json': admitted('sha256:a'),
    'docs/reports/current-graphify-snapshot-authority-v1.json': {
      status: 'CURRENT_SNAPSHOT_PROVEN',
      sourceSnapshot: { workspaceRevision: 'sha256:b', snapshotRevision: 'sha256:snap' },
    },
  });
  const result = resolveCurrentWorkspaceFrameV1({ root, argv: [], env: {} });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_BLOCKED');
  assert.ok(result.blockers.includes('CURRENT_REVISION_SELECTOR_CONFLICT'));
});

test('explicit CLI revision resolves an authority conflict without mutating receipts', () => {
  const root = fixture({
    'docs/reports/workspace-revision-tournament-admission-v1.json': admitted('sha256:a'),
    'docs/reports/current-graphify-snapshot-authority-v1.json': {
      status: 'CURRENT_SNAPSHOT_PROVEN',
      sourceSnapshot: { workspaceRevision: 'sha256:b', snapshotRevision: 'sha256:snap' },
    },
  });
  const result = resolveCurrentWorkspaceFrameV1({ root, argv: ['--workspace-revision', 'sha256:operator'], env: {} });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_SELECTED');
  assert.equal(result.selectedWorkspaceRevision, 'sha256:operator');
  assert.equal(result.selectedSource, 'CLI_WORKSPACE_REVISION');
  assert.equal(result.explicitOverride, true);
});

test('explicit authority manifest beats environment and admitted receipts', () => {
  const root = fixture({
    'frame.json': {
      authority: true,
      workspaceRevision: 'sha256:manifest',
      snapshotRevision: 'sha256:manifest-snapshot',
    },
    'docs/reports/workspace-revision-tournament-admission-v1.json': admitted('sha256:admitted', 'sha256:admitted-snapshot'),
  });
  const result = resolveCurrentWorkspaceFrameV1({
    root,
    argv: ['--manifest', 'frame.json'],
    env: { ATLAS_EXPECTED_GRAPHIFY_WORKSPACE_REVISION: 'sha256:env' },
  });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_SELECTED');
  assert.equal(result.selectedWorkspaceRevision, 'sha256:manifest');
  assert.equal(result.selectedSource, 'EXPLICIT_AUTHORITY_MANIFEST');
  assert.equal(result.selectedAuthority, true);
});

test('CLI revision has explicit override precedence over an authority manifest', () => {
  const root = fixture({
    'frame.json': {
      authority: true,
      workspaceRevision: 'sha256:manifest',
      snapshotRevision: 'sha256:manifest-snapshot',
    },
  });
  const result = resolveCurrentWorkspaceFrameV1({
    root,
    argv: ['--manifest', 'frame.json', '--workspace-revision', 'sha256:cli'],
    env: {},
  });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_SELECTED');
  assert.equal(result.selectedWorkspaceRevision, 'sha256:cli');
  assert.equal(result.selectedSource, 'CLI_WORKSPACE_REVISION');
  assert.equal(result.explicitOverride, true);
  assert.equal(result.selectedAuthority, false);
});

test('environment revision overrides receipts but remains non-authoritative', () => {
  const root = fixture({
    'docs/reports/workspace-revision-tournament-admission-v1.json': admitted('sha256:admitted'),
  });
  const result = resolveCurrentWorkspaceFrameV1({
    root,
    argv: [],
    env: { ATLAS_EXPECTED_GRAPHIFY_WORKSPACE_REVISION: 'sha256:env' },
  });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_SELECTED');
  assert.equal(result.selectedWorkspaceRevision, 'sha256:env');
  assert.equal(result.selectedSource, 'ENV_WORKSPACE_REVISION');
  assert.equal(result.selectedAuthority, false);
});

test('derived candidate is fallback only when no authority receipt exists', () => {
  const root = fixture({
    'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json': derived('sha256:derived'),
    'docs/reports/graphify-source-selection-plan-v1.json': plan('sha256:derived'),
  });
  const result = resolveCurrentWorkspaceFrameV1({ root, argv: [], env: {} });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_SELECTED');
  assert.equal(result.selectedWorkspaceRevision, 'sha256:derived');
  assert.equal(result.selectedSource, 'CURRENT_SEALED_SNAPSHOT_DERIVATION_FALLBACK');
  assert.equal(result.selectedAuthority, false);
});

test('CURRENT-WORKSPACE-FRAME-AUTHORITY-SEMANTICS-01: a derived-fallback frame is SELECTED but never canonically authoritative', () => {
  const root = fixture({
    'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json': derived('sha256:derived'),
    'docs/reports/graphify-source-selection-plan-v1.json': plan('sha256:derived'),
  });
  const result = resolveCurrentWorkspaceFrameV1({ root, argv: [], env: {} });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_SELECTED');
  const authority = computeWorkspaceFrameAuthorityV1(result);
  assert.equal(authority.frameAuthoritative, false);
  assert.equal(authority.canonicalAuthority, false);
  assert.equal(authority.promotionEligible, false);
});

test('CURRENT-WORKSPACE-FRAME-AUTHORITY-SEMANTICS-01: an explicit CLI override frame is SELECTED but never canonically authoritative', () => {
  const root = fixture({
    'docs/reports/workspace-revision-tournament-admission-v1.json': admitted('sha256:a'),
    'docs/reports/current-graphify-snapshot-authority-v1.json': {
      status: 'CURRENT_SNAPSHOT_PROVEN',
      sourceSnapshot: { workspaceRevision: 'sha256:b', snapshotRevision: 'sha256:snap' },
    },
  });
  const result = resolveCurrentWorkspaceFrameV1({ root, argv: ['--workspace-revision', 'sha256:operator'], env: {} });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_SELECTED');
  assert.equal(result.explicitOverride, true);
  const authority = computeWorkspaceFrameAuthorityV1(result);
  assert.equal(authority.frameAuthoritative, false);
  assert.equal(authority.canonicalAuthority, false);
  assert.equal(authority.promotionEligible, false);
});

test('CURRENT-WORKSPACE-FRAME-AUTHORITY-SEMANTICS-01: a clean admission receipt with no conflict and no blockers IS canonically authoritative', () => {
  const root = fixture({
    'docs/reports/workspace-revision-tournament-admission-v1.json': admitted('sha256:admitted'),
  });
  const result = resolveCurrentWorkspaceFrameV1({ root, argv: [], env: {} });
  assert.equal(result.status, 'CURRENT_WORKSPACE_FRAME_SELECTED');
  assert.equal(result.selectedAuthority, true);
  const authority = computeWorkspaceFrameAuthorityV1(result);
  assert.equal(authority.frameAuthoritative, true);
  assert.equal(authority.canonicalAuthority, true);
  assert.equal(authority.promotionEligible, true);
});
