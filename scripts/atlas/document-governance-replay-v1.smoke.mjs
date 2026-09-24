#!/usr/bin/env node
/** Rebuild generated document-governance projections twice and require byte parity. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const outputs = [
  'docs/reports/document-governance-registry-v1.json',
  'docs/MASTER-TOC.md',
];
const digest = (path) => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
const replay = () => {
  execFileSync(process.execPath, ['scripts/atlas/build-master-toc.mjs'], { cwd: root, stdio: 'inherit' });
  return Object.fromEntries(outputs.map((path) => [path, digest(path)]));
};

const first = replay();
const firstToc = readFileSync(join(root, 'docs/MASTER-TOC.md'), 'utf8');
assert.match(firstToc, /^## Canonical topics$/m);
assert.match(firstToc, /^## Active OpenSpec task progress$/m);
assert.match(firstToc, /^## Experiments and challengers$/m);
assert.match(firstToc, /^## Conflicts$/m);
assert.match(firstToc, /TANG_INSPIRED_LOW_RANK_SHORTLIST.*EXECUTED_UNPROVEN/);
assert.match(firstToc, /Recall@10 30%.*Recall@24 33%.*Top24 overlap 33%/);
assert.match(firstToc, /NE-23E exact-rerank\/quality evaluation/);
assert.doesNotMatch(firstToc, /^- \[archive\]\(openspec\/changes\/archive\//m,
  'archived changes must not be listed as active OpenSpec work');
const second = replay();
assert.deepEqual(second, first, 'registry and Master TOC must be byte-identical after consecutive rebuilds');
console.log(`DOCUMENT_GOVERNANCE_REPLAY_PASS ${JSON.stringify(second)}`);
