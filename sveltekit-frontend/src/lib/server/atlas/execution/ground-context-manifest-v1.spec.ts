import { describe, expect, it } from 'vitest';
import type { ContextManifestV1 } from '../graph/graph-runtime-contracts';
import { bindContextManifestToGroundedExecutionV1, checksumContextManifestV1 } from './ground-context-manifest-v1';

function manifest(): ContextManifestV1 {
  return {
    schema: 'atlas.context-manifest.v1',
    requestId: 'request:1',
    snapshotId: 'snapshot:1',
    graphRevision: 'graph:1',
    query: 'fix the qdrant writer',
    candidateBucket: 32,
    candidateCount: 2,
    tokenBudget: 1200,
    selectedNodeKeys: ['node:2', 'node:1'],
    evidenceRefs: ['evidence:2', 'evidence:1'],
    producerRevision: 'context-compiler:v1',
  };
}

describe('bindContextManifestToGroundedExecutionV1', () => {
  it('binds task/run/worker identity to the exact context manifest checksum', () => {
    const source = manifest();
    const grounded = bindContextManifestToGroundedExecutionV1({
      taskId: 'task:1',
      runId: 'run:1',
      workerId: 'codex-worker',
      manifest: source,
      packetKeys: ['packet:2', 'packet:1', 'packet:2'],
      processIds: ['process:1'],
      sourceRefs: ['src/b.ts', 'src/a.ts', 'src/b.ts'],
    });

    expect(grounded.contextManifestChecksum).toBe(checksumContextManifestV1(source));
    expect(grounded.grounding.packetKeys).toEqual(['packet:1', 'packet:2']);
    expect(grounded.grounding.sourceRefs).toEqual(['src/a.ts', 'src/b.ts']);
    expect(grounded.grounding.evidenceRefs).toEqual(['evidence:1', 'evidence:2']);
  });

  it('changes the checksum when retrieval evidence changes', () => {
    const left = manifest();
    const right = { ...manifest(), evidenceRefs: ['evidence:1', 'evidence:3'] };
    expect(checksumContextManifestV1(left)).not.toBe(checksumContextManifestV1(right));
  });

  it('requires source grounding and admitted evidence before execution', () => {
    expect(() => bindContextManifestToGroundedExecutionV1({
      taskId: 'task:1',
      runId: 'run:1',
      workerId: 'codex-worker',
      manifest: manifest(),
      sourceRefs: [],
    })).toThrow('GROUNDED_SOURCE_REFS_REQUIRED');

    expect(() => bindContextManifestToGroundedExecutionV1({
      taskId: 'task:1',
      runId: 'run:1',
      workerId: 'codex-worker',
      manifest: { ...manifest(), evidenceRefs: [] },
      sourceRefs: ['src/a.ts'],
    })).toThrow('CONTEXT_MANIFEST_EVIDENCE_REQUIRED');
  });
});
