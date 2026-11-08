import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILDER = path.join(HERE, 'build-domain-review-sheet-v1.mjs');
const palette = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'nes-domain-palette-v1.json'), 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-sheet-'));
const draft = path.join(dir, 'draft.jsonl');
fs.writeFileSync(draft, JSON.stringify({ id: 'r1', sourceRef: 'src/a.ts', featureLabel: 'Session guard', textEvidence: 'guards sessions', sourceRevision: `sha256:${'0'.repeat(64)}`, workspaceRevision: 'ws:1', proposedOntologyGroup: 'auth' }) + '\n');
const topLevelOf = (file) => JSON.parse(/"topLevel":(\[[^\]]*\])/.exec(fs.readFileSync(file, 'utf8'))[1]);
const build = (extra, out) => spawnSync(process.execPath, [BUILDER, '--input', draft, '--output', out, ...extra], { encoding: 'utf8' });

test('--palette labels in exactly the NES palette domains and offers no ontology children', () => {
  const out = path.join(dir, 'palette.html');
  const r = build(['--palette'], out);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(topLevelOf(out), Object.keys(palette.domains));
  assert.match(fs.readFileSync(out, 'utf8'), /"children":\[\]/);
});

test('default mode is unchanged: the 13-group ontology', () => {
  const out = path.join(dir, 'ontology.html');
  assert.equal(build([], out).status, 0);
  const groups = topLevelOf(out);
  assert.equal(groups.length, 13);
  assert.ok(groups.includes('devops') && groups.includes('frontend') && !groups.includes('agent'));
});

test('palette mode claims no per-class proposal counts from a different vocabulary', () => {
  const out = path.join(dir, 'palette2.html');
  build(['--palette'], out);
  const needs = JSON.parse(/"needs":(\[.*?\]),"rows"/s.exec(fs.readFileSync(out, 'utf8'))[1]);
  assert.ok(needs.every((n) => n.revisionQualifiedRowsProposed === 0));
});
