import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RouteTraceTrainingRowSchema, appendRouteTraceTrainingRow, buildRouteTraceTrainingRow, buildSearchRuntimeTrainingRow, loadRouteTraceTrainingRows } from './policy-training.js';
import { POLICY_FEATURES, POLICY_FEATURE_REVISION, POLICY_STATE_TENSOR_REVISION } from './policy-state.js';
import type { PolicyDecision, PolicyStateTensor, RevisionTuple } from './policy-types.js';
import type { RouteTrace } from '$lib/server/router/router-types.js';

function makePolicyState(): PolicyStateTensor {
  return {
    revision: POLICY_STATE_TENSOR_REVISION,
    featureRevision: POLICY_FEATURE_REVISION,
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

function makeTrace(overrides: Partial<RouteTrace> = {}): RouteTrace {
  return {
    traceId: 'trace:1',
    queryHash: 'q:1',
    query: 'find the retry logic',
    decisionId: 'decision:1',
    selectedState: 'RETRIEVE',
    selectedToolName: 'kb.trace_search',
    candidateTools: ['kb.trace_search', 'db.lookup'],
    proposalId: 'proposal:1',
    proposedArguments: {},
    schemaValid: true,
    approvalRequired: false,
    executed: true,
    executionId: 'exec:1',
    resultClass: 'answer',
    resultCount: 1,
    sourceRefCount: 1,
    sourceRefs: ['src/ref/1'],
    durationMs: 12,
    recoveryAttempted: false,
    finalState: 'SYNTHESIZE',
    finalOutcome: 'success',
    createdAt: new Date('2026-08-10T12:00:00.000Z'),
    updatedAt: new Date('2026-08-10T12:00:01.000Z'),
    ...overrides,
  };
}

describe('policy training export', () => {
  it('rejects route traces without provenance-backed labels', () => {
    expect(() =>
      buildRouteTraceTrainingRow({
        trace: makeTrace({ executed: false, executionId: undefined }),
        policyState: makePolicyState(),
        decision: makeDecision(),
        revisions: makeRevision(),
        labelProvenance: {
          source: 'EXECUTION',
          sourceRevision: 'label:1',
          sourceRefs: ['label-ledger:1'],
        },
      }),
    ).toThrow(/provenance-backed/i);
  });

  it('builds a stable provenance-backed row', () => {
    const rowA = buildRouteTraceTrainingRow({
      trace: makeTrace(),
      policyState: makePolicyState(),
      decision: makeDecision(),
      revisions: makeRevision(),
      labelProvenance: {
        source: 'EXECUTION',
        sourceRevision: 'label:1',
        sourceRefs: ['ledger:1', 'exec:1'],
      },
      labelConfidence: 0.92,
    });
    const rowB = buildRouteTraceTrainingRow({
      trace: makeTrace(),
      policyState: makePolicyState(),
      decision: makeDecision(),
      revisions: makeRevision(),
      labelProvenance: {
        source: 'EXECUTION',
        sourceRevision: 'label:1',
        sourceRefs: ['ledger:1', 'exec:1'],
      },
      labelConfidence: 0.92,
    });

    expect(rowA.trainingDigest).toBe(rowB.trainingDigest);
    expect(rowA.revision).toBe('parent-atlas.policy-training-row.v1');
    expect(rowA.policyAction).toBe('GRAPH_TRACE');
    expect(rowA.labelSourceRefs).toEqual(['ledger:1', 'exec:1']);
    expect(RouteTraceTrainingRowSchema.parse(rowA).trainingDigest).toBe(rowA.trainingDigest);
  });

  it('appends a training row to a jsonl sink', async () => {
    const datasetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-training-'));
    try {
      const row = await appendRouteTraceTrainingRow(
        {
          trace: makeTrace(),
          policyState: makePolicyState(),
          decision: makeDecision(),
          revisions: makeRevision(),
          labelProvenance: {
            source: 'REPLAY',
            sourceRevision: 'replay:1',
            sourceRefs: ['replay-ledger:1'],
          },
        },
        { datasetDir, now: new Date('2026-08-10T12:00:00.000Z') },
      );

      const filePath = path.join(datasetDir, '2026-08-10.jsonl');
      expect(fs.existsSync(filePath)).toBe(true);
      const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      const parsed = RouteTraceTrainingRowSchema.parse(JSON.parse(lines[0]!));
      expect(parsed.trainingDigest).toBe(row.trainingDigest);
      expect(parsed.labelSource).toBe('REPLAY');
      expect(parsed.policyBudget).toBe('MEDIUM');
    } finally {
      fs.rmSync(datasetDir, { recursive: true, force: true });
    }
  });

  it('builds a search-runtime training row from live rerank provenance', () => {
    const row = buildSearchRuntimeTrainingRow({
      traceId: 'trace:search:1',
      query: 'how does retry logic route?',
      queryHash: 'q:search:1',
      policyState: makePolicyState(),
      policyDecision: makeDecision(),
      rerankProvenance: {
        cacheStatus: 'hit',
        modelVersion: 'mixedbread-v2',
        rendererVersion: 'search-runtime-v1',
        authScope: 'public',
        topK: 5,
        maxLength: 2048,
        crossEncoderAttempted: true,
        crossEncoderUsed: true,
        fallbackUsed: false,
      },
      revisions: makeRevision(),
      labelProvenance: {
        source: 'EXECUTION',
        sourceRevision: 'mixedbread-v2',
        sourceRefs: ['packet:1', 'packet:2'],
      },
      candidatePacketKeys: ['packet:1', 'packet:2'],
      sourceRefs: ['source:1', 'source:2'],
      executionId: 'exec:search:1',
      labelConfidence: 0.9,
    });

    expect(row.selectedToolName).toBe('GRAPH_TRACE');
    expect(row.sourceRefs).toEqual(['source:1', 'source:2']);
    expect(row.labelSource).toBe('EXECUTION');
    expect(row.finalOutcome).toBe('success');
  });

  it('loads replay rows and skips malformed lines', async () => {
    const datasetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-training-load-'));
    try {
      const filePath = path.join(datasetDir, '2026-08-10.jsonl');
      const row = buildRouteTraceTrainingRow({
        trace: makeTrace(),
        policyState: makePolicyState(),
        decision: makeDecision(),
        revisions: makeRevision(),
        labelProvenance: {
          source: 'AUDIT',
          sourceRevision: 'audit:1',
          sourceRefs: ['audit-ledger:1'],
        },
      });
      fs.writeFileSync(filePath, `${JSON.stringify(row)}\nnot-json\n`, 'utf8');

      const loaded = await loadRouteTraceTrainingRows({ datasetDir });
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.trainingDigest).toBe(row.trainingDigest);
      expect(loaded[0]?.labelSource).toBe('AUDIT');
    } finally {
      fs.rmSync(datasetDir, { recursive: true, force: true });
    }
  });
});
