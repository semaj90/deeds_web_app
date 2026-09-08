import { describe, expect, it } from 'vitest';
import { buildTaskSemanticProjectionIntentV1, TaskSemanticProjectionIntentV1Schema } from './task-semantic-projection-intent-v1.js';

const input = {
  packetId: '11111111-1111-4111-8111-111111111111',
  qdrantPointId: '22222222-2222-4222-8222-222222222222',
  collection: 'codebase_chunks_768',
  vectorName: 'content',
  representationRevision: 'semantic_768:v1',
  modelRevision: 'embeddinggemma:300m',
  inputChecksum: 'a'.repeat(64),
  artifactRef: 'artifact://semantic/task/11111111',
  sourceRef: 'task:1',
  sourceRevision: null,
  workspaceRevision: null,
};

describe('TaskSemanticProjectionIntentV1', () => {
  it('builds a deterministic non-canonical artifact reference', () => {
    const first = buildTaskSemanticProjectionIntentV1(input);
    const second = buildTaskSemanticProjectionIntentV1(input);
    expect(first).toEqual(second);
    expect(first.canonicalAuthority).toBe(false);
    expect(first).not.toHaveProperty('embedding');
    expect(TaskSemanticProjectionIntentV1Schema.parse(first)).toEqual(first);
  });

  it('rejects an inline embedding payload', () => {
    expect(() => TaskSemanticProjectionIntentV1Schema.parse({
      ...buildTaskSemanticProjectionIntentV1(input),
      embedding: [0, 1],
    })).toThrow();
  });
});
