#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = packageJson.scripts ?? {};
const guard = 'run-resource-guarded-script-v1.mjs';

const requiredGuardedScripts = [
  'atlas:docs:capability-census',
  'atlas:docs:ast-structural-conflicts',
  'atlas:docs:ast-conflict-disposition',
  'atlas:docs:ast-source-parity',
  'atlas:docs:ast-source-worktree',
  'atlas:docs:ontology-population-decision',
  'atlas:docs:packet-source-scope',
  'atlas:docs:ast-digest-divergence',
  'atlas:docs:ast-canary-readiness',
  'atlas:docs:knowledge-source-snapshot-live',
  'atlas:docs:knowledge-source-drift-disposition',
  'atlas:docs:nlp-training-readiness',
  'atlas:docs:domain-review-sheet',
  'atlas:source-owner:reconciliation',
  'atlas:docs:postgres-index-capability',
  'atlas:docs:pgvector-chunk-stream-dry-run',
  'atlas:docs:bitfrost-warmer-dry-run',
  'atlas:smoke:workstation-pgvector-stack',
];

test('high-risk Atlas scripts remain resource guarded', () => {
  const missing = requiredGuardedScripts.filter((name) => !scripts[name]?.includes(guard));
  assert.deepEqual(missing, []);
});

test('guarded scripts still name a concrete child script', () => {
  const invalid = requiredGuardedScripts.filter((name) => {
    const command = scripts[name];
    return !command || !command.includes(guard) || command.trim().endsWith(guard);
  });
  assert.deepEqual(invalid, []);
});
