#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveWorkspaceRevisionCoordinate } from './lib/workspace-revision-authority.mjs';

function withFixture(record, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wra-test-'));
  const file = path.join(dir, 'workspace-source-binding-observation.json');
  fs.writeFileSync(file, JSON.stringify({ record }));
  try {
    return fn(dir, 'workspace-source-binding-observation.json');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 1. Missing artifact -> UNPROVEN
{
  const result = resolveWorkspaceRevisionCoordinate({ repoRoot: os.tmpdir(), observationPath: `does-not-exist-${Date.now()}.json` });
  assert.equal(result.coordinate.authority, 'UNPROVEN');
  assert.equal(result.coordinate.value, null);
  assert.equal(result.reason, 'observation_artifact_missing');
  console.log('PASS: missing artifact -> UNPROVEN');
}

// 2. Fresh, clean worktree -> PROVEN
{
  const now = Date.now();
  const result = withFixture(
    { workspaceRevision: 'sha256:abc123', generatedAt: new Date(now - 60_000).toISOString(), dirty: false },
    (repoRoot, observationPath) => resolveWorkspaceRevisionCoordinate({ repoRoot, observationPath, now }),
  );
  assert.equal(result.coordinate.authority, 'PROVEN');
  assert.equal(result.coordinate.value, 'sha256:abc123');
  assert.equal(result.coordinate.evidence_refs.length, 1);
  assert.match(result.reason, /clean_worktree/);
  console.log('PASS: fresh clean artifact -> PROVEN');
}

// 3. Fresh but dirty worktree -> still PROVEN, reason flags dirty
{
  const now = Date.now();
  const result = withFixture(
    { workspaceRevision: 'sha256:def456', generatedAt: new Date(now - 60_000).toISOString(), dirty: true },
    (repoRoot, observationPath) => resolveWorkspaceRevisionCoordinate({ repoRoot, observationPath, now }),
  );
  assert.equal(result.coordinate.authority, 'PROVEN');
  assert.match(result.reason, /dirty_worktree/);
  console.log('PASS: fresh dirty artifact -> PROVEN with dirty reason');
}

// 4. Stale artifact (older than maxAgeMs) -> UNPROVEN
{
  const now = Date.now();
  const result = withFixture(
    { workspaceRevision: 'sha256:stale', generatedAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(), dirty: false },
    (repoRoot, observationPath) => resolveWorkspaceRevisionCoordinate({ repoRoot, observationPath, now, maxAgeMs: 24 * 60 * 60 * 1000 }),
  );
  assert.equal(result.coordinate.authority, 'UNPROVEN');
  assert.equal(result.coordinate.value, null);
  assert.match(result.reason, /observation_stale/);
  console.log('PASS: stale artifact -> UNPROVEN');
}

// 5. Incomplete record -> UNPROVEN
{
  const result = withFixture(
    { workspaceRevision: null, generatedAt: null },
    (repoRoot, observationPath) => resolveWorkspaceRevisionCoordinate({ repoRoot, observationPath }),
  );
  assert.equal(result.coordinate.authority, 'UNPROVEN');
  assert.equal(result.reason, 'observation_record_incomplete');
  console.log('PASS: incomplete record -> UNPROVEN');
}

// 6. Against the REAL repo artifact (read-only, no mutation) — confirms the
// resolver correctly identifies it as stale right now (generatedAt 2026-08-23,
// well past the default 24h threshold), proving the honesty behavior end to end.
{
  const result = resolveWorkspaceRevisionCoordinate({ repoRoot: path.resolve(import.meta.dirname, '../..') });
  console.log(`REAL ARTIFACT: authority=${result.coordinate.authority} reason=${result.reason}`);
  assert.equal(result.coordinate.authority, 'UNPROVEN', 'expected the real artifact to currently be stale');
}

console.log('All workspace-revision-authority tests passed.');
