import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractOpenTodosV1, inspectMasterReferencesV1 } from './extract-master-open-todos-v1.mjs';

function referenceFixture(context) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'atlas-master-refs-'));
  context.after(() => {
    assert.equal(path.dirname(root), parent);
    assert.ok(path.basename(root).startsWith('atlas-master-refs-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (name) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'fixture');
  };
  return { root, write };
}

test('reference inspection distinguishes exact, missing, ambiguous and untracked paths without proving completion', async (context) => {
  const { root, write } = referenceFixture(context);
  for (const file of ['src/one.ts', 'sveltekit-frontend/src/one.ts', 'sveltekit-frontend/src/two.ts', 'local/data.json']) write(file);
  const report = extractOpenTodosV1('# Lane\n- [x] Review src/one.ts src/two.ts src/missing.ts local/data.json\n- [ ] No explicit file\n', 'master.md', { includeChecked: true });
  const result = await inspectMasterReferencesV1(report, root, ['sveltekit-frontend/src/two.ts']);
  const references = result.claims[0].references;
  assert.equal(references.find((item) => item.reference === 'src/one.ts').status, 'AMBIGUOUS_REFERENCE');
  assert.equal(references.find((item) => item.reference === 'src/two.ts').matches[0].tracked, true);
  assert.equal(references.find((item) => item.reference === 'local/data.json').matches[0].tracked, false);
  assert.equal(references.find((item) => item.reference === 'src/missing.ts').status, 'MISSING_EXACT_REFERENCE');
  assert.equal(result.claimsWithoutExplicitReferences, 1);
  assert.equal(result.productionReadinessEstablished, false);
  assert.equal(result.canonicalAuthority, false);
});

test('reference inspection rejects traversal and absolute paths without fetching external URLs', async (context) => {
  const { root } = referenceFixture(context);
  const report = extractOpenTodosV1('- [ ] A claim');
  report.tasks[0].sourceRefs = ['../secret.txt', '/etc/passwd', 'C:/secret.txt', 'github.com/org/repo'];
  const result = await inspectMasterReferencesV1(report, root);
  assert.equal(result.referenceStatusCounts.UNSAFE_REFERENCE_REJECTED, 3);
  assert.equal(result.referenceStatusCounts.EXTERNAL_REFERENCE_NOT_FETCHED, 1);
  assert.equal(result.trackedInventoryProvided, false);
});

test('reference budgets fail explicitly rather than silently dropping source claims', async (context) => {
  const { root } = referenceFixture(context);
  const report = extractOpenTodosV1('- [x] Many files', 'master.md', { includeChecked: true });
  report.tasks[0].sourceRefs = Array.from({ length: 1001 }, (_, index) => `src/file-${index}.ts`);
  await assert.rejects(inspectMasterReferencesV1(report, root), /MASTER_REFERENCE_BUDGET_EXCEEDED/);
});

test('directory references are inspected without recursive enumeration or tracked-directory claims', async (context) => {
  const { root, write } = referenceFixture(context);
  write('scripts/nested/one.ts');
  const report = extractOpenTodosV1('- [ ] Inspect scripts/');
  const result = await inspectMasterReferencesV1(report, root, ['scripts/nested/one.ts']);
  assert.equal(result.claims[0].references[0].matches[0].kind, 'DIRECTORY');
  assert.equal(result.claims[0].references[0].matches[0].tracked, null);
});

test('literal reference extraction preserves Svelte route files, dynamic segments and Unicode paths', () => {
  const report = extractOpenTodosV1('- [ ] Inspect src/routes/api/[id]/+server.ts src/λ/日本.ts scripts/');
  assert.deepEqual(report.tasks[0].sourceRefs, ['src/routes/api/[id]/+server.ts', 'src/λ/日本.ts', 'scripts/']);
});

test('explicit frontend paths are not prefixed again and repeated phase headings remain distinct', async (context) => {
  const { root, write } = referenceFixture(context);
  write('sveltekit-frontend/src/one.ts');
  write('sveltekit-frontend/sveltekit-frontend/src/one.ts');
  const report = extractOpenTodosV1('# Phase 11G\n- [x] Read sveltekit-frontend/src/one.ts\n# Phase 11G\n- [ ] Other claim\n# Empty\n', 'master.md', { includeChecked: true });
  const result = await inspectMasterReferencesV1(report, root, []);
  assert.equal(result.claims[0].references[0].status, 'EXACT_REFERENCE_PRESENT');
  assert.deepEqual(result.sections.map((section) => section.claimCount), [1, 1, 0]);
  assert.equal(result.sections[0].title, result.sections[1].title);
  assert.notEqual(result.sections[0].lineNumber, result.sections[1].lineNumber);
});

test('extracts unchecked tasks, preserves UTF-8 byte spans, and labels retrieval work', () => {
  const text = '# Retrieval λ\r\n\r\n- [ ] Align pgvector semantic_768 with EmbeddingGemma\r\n- [x] Complete unrelated work\r\n';
  const result = extractOpenTodosV1(text, 'docs/todo.md');

  assert.equal(result.openCount, 1);
  assert.equal(result.tasks[0].workstream, 'DENSE_RETRIEVAL');
  assert.equal(result.tasks[0].domain, 'Retrieval');
  assert.equal(result.tasks[0].featureLabel, 'semantic-768-pgvector');
  assert.equal(result.tasks[0].ownerArea, 'docs');
  assert.equal(Buffer.from(text).subarray(result.tasks[0].startByte, result.tasks[0].endByte).toString('utf8'), result.tasks[0].task);
  assert.equal(result.tasks[0].canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('labels FastAPI CPU worker alignment separately from dense retrieval', () => {
  const result = extractOpenTodosV1('# Runtime\n- [ ] Bound FastAPI CPU worker concurrency\n');
  assert.equal(result.tasks[0].workstream, 'EMBEDDING_RUNTIME_ALIGNMENT');
  assert.equal(result.tasks[0].featureLabel, 'embedding-cpu-workers');
});

test('labels repair workflow items without treating them as admitted error evidence', () => {
  const result = extractOpenTodosV1('# Agent\n- [ ] Route agentic errors through a read-only repair proposal flow\n');
  assert.equal(result.tasks[0].workstream, 'AGENTIC_ERROR_FIXING');
  assert.equal(result.tasks[0].featureLabel, 'agentic-error-fixing');
  assert.equal(result.tasks[0].errorFixingEligibility, 'NOT_ESTABLISHED_FROM_TODO_TEXT');
});

test('produces deterministic task IDs and checksums for identical input', () => {
  const text = '# Retrieval\n- [ ] Align semantic_768 and pgvector\n';
  const first = extractOpenTodosV1(text, 'docs/todo.md');
  const second = extractOpenTodosV1(text, 'docs/todo.md');
  assert.deepEqual(first, second);
});

test('all-claim review preserves checked, partial, and repeated phase namespaces without promotion', () => {
  const text = '# Master\n## Phase 11G — Browser\n- [x] Score candidates\n* [~] Cache weights\n## Phase 11G — Intent\n- [ ] Review labels\n';
  const result = extractOpenTodosV1(text, 'docs/master.md', { includeChecked: true });
  assert.equal(result.claimCount, 3);
  assert.equal(result.openCount, 1);
  assert.equal(result.checkedClaimCount, 1);
  assert.equal(result.partialClaimCount, 1);
  assert.notEqual(result.tasks[0].section, result.tasks[2].section);
  assert.deepEqual(result.tasks.map((task) => task.recordedState), ['CHECKED_CLAIM', 'PARTIAL_CLAIM', 'OPEN_CLAIM']);
  assert.ok(result.tasks.every((task) => task.qualification === 'NOT_VERIFIED_BY_CHECKLIST'));
});

test('byte spans remain exact with mixed line endings and non-ASCII content', () => {
  const text = '# λ\r\n- [x] Checked 🔎\n- [ ] Open é\r\n- [ ] Final';
  const result = extractOpenTodosV1(text, 'docs/master.md', { includeChecked: true });
  assert.equal(result.tasks.length, 3);
  const bytes = Buffer.from(text);
  for (const task of result.tasks) {
    assert.equal(bytes.subarray(task.startByte, task.endByte).toString('utf8'), task.task);
  }
  assert.deepEqual(result.tasks.map((task) => task.lineNumber), [2, 3, 4]);
});

test('default remains unchecked-only and empty input stays empty', () => {
  assert.equal(extractOpenTodosV1('').claimCount, 0);
  const result = extractOpenTodosV1('- [x] Checked\n- [~] Partial\n- [ ] Open\n');
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].task, 'Open');
});

test('retains headings without checklist rows and repeated heading occurrences', () => {
  const result = extractOpenTodosV1('# Master\n## Phase 10A\nNo checkbox.\n## Phase 11G\n- [x] First\n## Phase 11G\n- [x] Second\n',
    'docs/master.md', { includeChecked: true });
  assert.equal(result.sections.length, 4);
  assert.deepEqual(result.tasks.map((task) => task.sectionLineNumber), [4, 6]);
  assert.deepEqual(result.sections.filter((section) => section.title === 'Phase 11G')
    .map((section) => section.lineNumber), [4, 6]);
});
