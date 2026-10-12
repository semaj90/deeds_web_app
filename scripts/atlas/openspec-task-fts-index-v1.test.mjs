import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tokenize, parseTasks, parseProposal, buildIndex, toDrizzleRows, searchOpenSpecClaims } from './openspec-task-fts-index-v1.mjs';

const FIXTURE = [
  '## 1. Work',
  '',
  '- [x] **ALPHA-01** — first item done',
  '  continuation line about simdjson parsing.',
  '- [ ] BETA-02 open item about postgres fts',
  '- [ ] plain item with no declared id',
  '',
  '## 2. Other',
  '- [X] GAMMA-03 uppercase checked',
].join('\n');

test('tokenize lowercases, splits, and drops stopwords and single chars', () => {
  assert.deepEqual(tokenize('The SimdJSON parser, and a/b'), ['simdjson', 'parser']);
});

test('parseTasks reads checkbox state, declared IDs, and continuation lines', () => {
  const rows = parseTasks(FIXTURE, 'demo', 'openspec/changes/demo/tasks.md');
  assert.equal(rows.length, 4);
  assert.equal(rows[0].taskId, 'ALPHA-01');
  assert.equal(rows[0].state, 'DONE');
  assert.match(rows[0].text, /simdjson parsing/);
  assert.equal(rows[1].taskId, 'BETA-02');
  assert.equal(rows[1].state, 'OPEN');
  assert.equal(rows[2].taskId, null);
  assert.equal(rows[2].state, 'OPEN');
  assert.equal(rows[2].text, 'plain item with no declared id');
  assert.equal(rows[2].taskKey, 'demo:6');
});

test('parseTasks treats uppercase X as done and returns nothing for prose-only input', () => {
  const rows = parseTasks(FIXTURE, 'demo', 'x');
  assert.equal(rows.at(-1).state, 'DONE');
  assert.deepEqual(parseTasks('no checkboxes here\n', 'demo', 'x'), []);
});

test('parseProposal takes the first H1 as the title, falling back to the change id', () => {
  assert.equal(parseProposal('# Real Title\nbody', 'c', 'p').title, 'Real Title');
  assert.equal(parseProposal('no heading', 'c', 'p').title, 'c');
});

test('BM25 ranks the document containing the rare term first', () => {
  const index = buildIndex([
    { id: 'a', text: 'generic words about routing and retrieval' },
    { id: 'b', text: 'simdjson native parser benchmark' },
    { id: 'c', text: 'generic words about postgres indexes' },
  ]);
  const hits = index.search('simdjson');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'b');
  assert.deepEqual(index.search('zzz-unknown'), []);
});

test('claim search returns bounded BM25-ranked claims with ledger digests, not admission', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-claim-search-'));
  try {
    const change = path.join(root, 'parent-atlas-demo');
    fs.mkdirSync(change, { recursive: true });
    fs.writeFileSync(path.join(change, 'tasks.md'), [
      '# Tasks',
      '- [ ] SEARCH-01 Add simdjson benchmark coverage',
      '- [x] SEARCH-02 Record the parser baseline',
    ].join('\n'));
    fs.writeFileSync(path.join(change, 'proposal.md'), '# Parser proposal\nBenchmark simdjson against the Node parser.');

    const result = searchOpenSpecClaims('simdjson', { changesDir: root, limit: 2 });
    assert.equal(result.status, 'CLAIM_SEARCH_ONLY');
    assert.equal(result.canonicalAuthority, false);
    assert.equal(result.evidenceAdmission, false);
    assert.equal(result.writesPerformed, false);
    assert.equal(result.hits.length, 2);
    assert.equal(result.hits[0].kind, 'TASK');
    assert.equal(result.hits[0].taskId, 'SEARCH-01');
    assert.equal(result.hits[0].ledgerContentDigest.startsWith('sha256:'), true);
    assert.equal(result.hits[1].kind, 'PROPOSAL');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('claim search rejects blank queries and unbounded limits', () => {
  assert.throws(() => searchOpenSpecClaims('  '), /OPENSPEC_SEARCH_QUERY_INVALID/);
  assert.throws(() => searchOpenSpecClaims('x', { limit: 21 }), /OPENSPEC_SEARCH_LIMIT_INVALID/);
});

test('toDrizzleRows never defaults workspaceRevision and records the blocker', () => {
  const tasks = parseTasks(FIXTURE, 'demo', 'openspec/changes/demo/tasks.md');
  const out = toDrizzleRows({
    changes: ['demo'],
    tasks,
    proposals: [parseProposal('# Demo\n', 'demo', 'p')],
    tasksHashes: new Map([['demo', 'sha256:t']]),
    proposalHashes: new Map([['demo', 'sha256:p']]),
  });
  assert.equal(out.openspecChanges[0].workspaceRevision, null);
  assert.deepEqual(out.openspecChanges[0].blockers, ['WORKSPACE_REVISION_UNRESOLVED']);
  assert.equal(out.openspecTasks.length, 4);
  assert.ok(out.openspecTasks.every((r) => r.workspaceRevision === null));
  assert.equal(out.openspecTasks[2].taskIdStatus, 'MISSING');
  assert.equal(out.openspecTasks[0].declaredChecked, true);
  assert.equal(out.openspecTasks[0].taskHash.startsWith('sha256:'), true);
});
