import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOpenTodosV1 } from './extract-master-open-todos-v1.mjs';

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
