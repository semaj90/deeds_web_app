import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCouchDbOfflineBatchV1, createCouchDbOfflineBatchV1, createCouchDbReplayStateV1, summarizeCouchDbReplayV1 } from './couchdb-offline-batch-v1.mjs';
import { reduceCouchDbKanbanReplayWithDuckDbV1, verifyCouchDbDuckDbKanbanRollupV1 } from './couchdb-duckdb-kanban-rollup-v1.mjs';

function replay(changes) {
  const batch = createCouchDbOfflineBatchV1({ sourceDatabase: 'fixture_kanban', lastSequence: 'end', changes });
  return summarizeCouchDbReplayV1(applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), batch).state);
}

const task = (id, status, priority, notes, refs = []) => ({
  id,
  changes: [{ rev: '1-a' }],
  doc: { _id: id, _rev: '1-a', type: 'kanban-task', kanbanStatus: status, priority, sourceRefs: refs, llmNotes: notes },
});

test('DuckDB rollup emits only deterministic metadata aggregates, never task content', async () => {
  const result = await reduceCouchDbKanbanReplayWithDuckDbV1(replay([
    task('a', 'TODO', 'HIGH', 'private note one', ['src/a.ts', 'src/b.ts']),
    task('b', 'TODO', 'LOW', 'private note two', []),
  ]));
  assert.deepEqual(result.byStatus, [{ status: 'TODO', documentCount: 2 }]);
  assert.deepEqual(result.byPriority, [{ priority: 'HIGH', documentCount: 1 }, { priority: 'LOW', documentCount: 1 }]);
  assert.equal(result.projectedDocumentCount, 2);
  assert.equal(result.sourceReferenceCount, 2);
  assert.equal(JSON.stringify(result).includes('private note'), false);
  assert.deepEqual(verifyCouchDbDuckDbKanbanRollupV1(result), { valid: true, reason: null });
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('DuckDB rollup rejects unsupported task shape and tampered replay summaries', async () => {
  await assert.rejects(reduceCouchDbKanbanReplayWithDuckDbV1(replay([task('a', 'todo', 'HIGH', '')])), /KANBAN_TASK_SCHEMA_UNSUPPORTED/);
  const summary = replay([task('a', 'TODO', 'HIGH', '')]);
  await assert.rejects(reduceCouchDbKanbanReplayWithDuckDbV1({ ...summary, documents: [] }), /REPLAY_SUMMARY_DIGEST_OR_AUTHORITY_INVALID/);
});

test('DuckDB rollup readback rejects modified receipt fields', async () => {
  const result = await reduceCouchDbKanbanReplayWithDuckDbV1(replay([task('a', 'TODO', 'HIGH', '')]));
  assert.equal(verifyCouchDbDuckDbKanbanRollupV1({ ...result, projectedDocumentCount: 99 }).reason, 'ROLLUP_DIGEST_MISMATCH');
});
