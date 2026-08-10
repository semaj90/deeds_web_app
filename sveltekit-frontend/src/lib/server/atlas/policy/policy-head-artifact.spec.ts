import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPolicyHeadArtifact, trainPolicyHeadsFromReplay } from './policy-head-artifact.js';
import { POLICY_FEATURES } from './policy-state.js';
import { buildRouteTraceTrainingRow } from './policy-training.js';
import type { PolicyDecision, PolicyStateTensor, RevisionTuple } from './policy-types.js';

function makePolicyState(): PolicyStateTensor {
  return {
    revision: 'parent-atlas.policy-state.v1',
    featureRevision: 'parent-atlas.policy-features.v1',
    featureCount: POLICY_FEATURES.length,
    features: POLICY_FEATURES,
    values: Float32Array.from(POLICY_FEATURES.map((_, index) => index / POLICY_FEATURES.length)),
    stateHint: 'TRACE',
  };
}

function makeDecision(): PolicyDecision {
  return {
    revision: 'parent-atlas.policy-decision.v1',
    action: 'GRAPH_TRACE',
    model: 'ORNITH',
    budget: 'MEDIUM',
    maxParallelToolCalls: 3,
    rankedActions: [{ action: 'GRAPH_TRACE', score: 1 }],
    stateHint: 'TRACE',
  };
}

function makeRevision(): RevisionTuple {
  return {
    workspaceRevision: 'ws:1',
    sourceRevision: 'src:1',
    representationRevision: 'rep:1',
    graphRevision: 'graph:1',
    featureRevision: 'feat:1',
  };
}

describe('policy head artifact', () => {
  it('trains from replay rows and persists a versioned artifact', async () => {
    const datasetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-head-artifact-'));
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-head-artifact-out-'));
    try {
      const rows = Array.from({ length: 12 }, (_, index) =>
        buildRouteTraceTrainingRow({
          trace: {
            traceId: `trace:${index}`,
            queryHash: `query:${index}`,
            query: `query ${index}`,
            decisionId: `decision:${index}`,
            selectedState: 'RETRIEVE',
            selectedToolName: 'GRAPH_TRACE',
            candidateTools: ['GRAPH_TRACE', 'RECOVER'],
            proposalId: `proposal:${index}`,
            proposedArguments: {},
            schemaValid: true,
            approvalRequired: false,
            executed: true,
            executionId: `exec:${index}`,
            resultClass: 'answer',
            resultCount: 1,
            sourceRefCount: 1,
            sourceRefs: [`source:${index}`],
            durationMs: 10,
            recoveryAttempted: false,
            finalState: 'SYNTHESIZE',
            finalOutcome: 'success',
            createdAt: new Date(`2026-08-10T12:00:${String(index).padStart(2, '0')}.000Z`),
            updatedAt: new Date(`2026-08-10T12:00:${String(index).padStart(2, '0')}.000Z`),
          },
          policyState: makePolicyState(),
          decision: makeDecision(),
          revisions: makeRevision(),
          labelProvenance: {
            source: 'EXECUTION',
            sourceRevision: 'labels:1',
            sourceRefs: [`ledger:${index}`],
          },
          labelConfidence: 0.95,
        }),
      );

      const datasetFile = path.join(datasetDir, '2026-08-10.jsonl');
      fs.writeFileSync(datasetFile, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

      const { artifact, artifactPath } = await trainPolicyHeadsFromReplay({
        datasetDir,
        artifactDir,
        now: new Date('2026-08-10T12:30:00.000Z'),
        training: { holdoutFraction: 0.25, learningRate: 0.3, epochs: 50, l2: 1e-4, seed: 'artifact-test' },
      });

      expect(fs.existsSync(artifactPath)).toBe(true);
      expect(artifact.sourceRowCount).toBe(12);
      expect(artifact.actionHead.classes).toContain('GRAPH_TRACE');
      expect(artifact.metrics.actionLearned.accuracy).toBeGreaterThanOrEqual(artifact.metrics.actionBaseline.accuracy);

      const loaded = await loadPolicyHeadArtifact(artifactPath);
      expect(loaded.revision).toBe('parent-atlas.policy-head-artifact.v1');
      expect(loaded.sourceRowCount).toBe(12);
      expect(loaded.sourceRowDigest).toBe(artifact.sourceRowDigest);
      expect(loaded.metrics.repairSuccessLearned.accuracy).toBeGreaterThanOrEqual(loaded.metrics.repairSuccessBaseline.accuracy);
    } finally {
      fs.rmSync(datasetDir, { recursive: true, force: true });
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });
});
