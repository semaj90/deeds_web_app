import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCouchDbOfflineBatchV1, createCouchDbOfflineBatchV1, createCouchDbReplayStateV1, summarizeCouchDbReplayV1 } from './couchdb-offline-batch-v1.mjs';
import { reduceCouchDbKanbanReplayWithDuckDbV1 } from './couchdb-duckdb-kanban-rollup-v1.mjs';
import { summarizeCouchDbKanbanReplayWithCpuOracleV1 } from './couchdb-kanban-rollup-cpu-oracle-v1.mjs';

test('CPU oracle and DuckDB agree on status, priority, and source-reference projections', async () => {
  const batch = createCouchDbOfflineBatchV1({ sourceDatabase: 'fixture_kanban', lastSequence: 'seq-1', changes: [
    { id: 'one', changes: [{ rev: '1-a' }], doc: { _id: 'one', _rev: '1-a', type: 'kanban-task', kanbanStatus: 'TODO', priority: 'HIGH', sourceRefs: ['src/a.ts'], llmNotes: 'not projected' } },
    { id: 'two', changes: [{ rev: '1-b' }], doc: { _id: 'two', _rev: '1-b', type: 'kanban-task', kanbanStatus: 'DONE', priority: 'LOW', sourceRefs: [], llmNotes: 'not projected' } },
  ] });
  const summary = summarizeCouchDbReplayV1(applyCouchDbOfflineBatchV1(createCouchDbReplayStateV1(), batch).state);
  const [cpu, gpu] = await Promise.all([
    summarizeCouchDbKanbanReplayWithCpuOracleV1(summary),
    reduceCouchDbKanbanReplayWithDuckDbV1(summary),
  ]);
  const { oracleDigest, ...cpuProjection } = cpu;
  assert.deepEqual({
    inputDocumentCount: gpu.inputDocumentCount,
    liveDocumentCount: gpu.liveDocumentCount,
    tombstoneCount: gpu.tombstoneCount,
    conflictedDocumentCount: gpu.conflictedDocumentCount,
    projectedDocumentCount: gpu.projectedDocumentCount,
    sourceReferenceCount: gpu.sourceReferenceCount,
    byStatus: gpu.byStatus,
    byPriority: gpu.byPriority,
  }, cpuProjection);
  assert.match(oracleDigest, /^sha256:[0-9a-f]{64}$/);
});
