import { describe, expect, it } from 'vitest';
import { assertSnapshotBelongsToWorkflow, buildMastraSnapshotRef } from './mastra-snapshot-bridge.js';

describe('Mastra snapshot bridge', () => {
  it('keeps runtime snapshot identity subordinate to Atlas workflow identity', () => {
    const ref = buildMastraSnapshotRef({ workflowId:'w', workflowRevision:1, runId:'r', atlasWorkflowChecksum:'atlas', suspendedStepIds:['b','a'], storageRef:'mastra://run/r', capturedAt:'2026-08-18T00:00:00.000Z', snapshot:{ value:{ step:'suspended' } } });
    expect(ref.suspendedStepIds).toEqual(['a','b']);
    expect(() => assertSnapshotBelongsToWorkflow(ref, 'other')).toThrow(/mismatch/);
  });
});
