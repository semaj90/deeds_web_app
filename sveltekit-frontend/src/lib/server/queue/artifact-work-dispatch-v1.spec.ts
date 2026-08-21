import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueTask = vi.fn(async () => ({
  taskId: 'task-1',
  commandId: 'command-1',
  idempotencyKey: 'idem-1',
}));
const emit = vi.fn();

vi.mock('./outbox.js', () => ({ enqueueTask }));
vi.mock('$lib/server/analytics/analytics-sink.js', () => ({
  emit,
  makeEvent: (event: Record<string, unknown>) => event,
}));

import {
  ARTIFACT_WORK_ENVELOPE_MAX_BYTES,
  artifactWorkEnvelopeBytes,
  enqueueArtifactWorkItem,
} from './artifact-work-dispatch-v1.js';
import { actionWorkItemSchema } from './artifact-work-item-v1.js';

function makeItem(operation = 'materialize-feature-matrix') {
  return actionWorkItemSchema.parse({
    schema: 'atlas.action-work-item.v1',
    actionKey: 'action-key-00000001',
    commandType: 'retrieval.materialize',
    operation,
    inputArtifactRefs: [],
    requiredRevisionSetHash: 'revision-set-0001',
    budget: { timeoutMs: 30_000 },
    executorClass: 'CPU',
    priority: 'normal',
    parametersHash: 'parameters-hash-0001',
    expectedOutputSchema: 'atlas.feature-matrix.v1',
    producerRevision: 'producer-v1',
  });
}

beforeEach(() => {
  enqueueTask.mockClear();
  emit.mockClear();
});

describe('artifact work dispatch', () => {
  it('uses the transactional outbox enqueueTask path', async () => {
    const item = makeItem();

    const result = await enqueueArtifactWorkItem({
      runId: '11111111-1111-4111-8111-111111111111',
      requestId: '22222222-2222-4222-8222-222222222222',
      capability: 'retrieval',
      targetWorkerClass: 'atlas.worker.cpu.v1',
      item,
    });

    expect(result.taskId).toBe('task-1');
    expect(enqueueTask).toHaveBeenCalledTimes(1);
    expect(enqueueTask.mock.calls[0]?.[0].payload).toEqual(item);
  });

  it('measures the actual UTF-8 JSON envelope', () => {
    const item = makeItem('unicode-π-materialize');
    expect(artifactWorkEnvelopeBytes(item)).toBe(Buffer.byteLength(JSON.stringify(item), 'utf8'));
  });

  it('rejects an oversized envelope before enqueueTask', async () => {
    const item = makeItem('x'.repeat(ARTIFACT_WORK_ENVELOPE_MAX_BYTES));

    await expect(enqueueArtifactWorkItem({
      runId: '11111111-1111-4111-8111-111111111111',
      requestId: '22222222-2222-4222-8222-222222222222',
      capability: 'retrieval',
      targetWorkerClass: 'atlas.worker.cpu.v1',
      item,
    })).rejects.toThrow(/exceeds policy limit/);

    expect(enqueueTask).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
