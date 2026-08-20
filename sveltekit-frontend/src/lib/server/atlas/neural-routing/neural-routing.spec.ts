import { describe, expect, it } from 'vitest';
import { buildGpuAdmissionReceipt, buildRuntimeIdentity } from './gpu-admission.js';
import { buildQueryRoutingSnapshot, buildToolRoutingReceipt } from './materializer.js';
import { buildToolTrainingExamples } from './training-example-builder.js';

const envelope = {
  maxVramBytes: 8_000_000_000,
  maxContextTokens: 8192,
  maxCandidates: 32,
  maxGraphHops: 4,
  maxHyperedges: 64,
  maxToolCalls: 8,
  maxWallMs: 3000,
};

const revisions = {
  workspaceRevision: 'w1',
  sourceRevision: 's1',
  graphRevision: 'g1',
  featureRevision: 'f1',
};

function snapshot() {
  return buildQueryRoutingSnapshot({
    requestId: 'req-1',
    revisions,
    toolRegistryRevision: 'tools-1',
    queryText: 'trace this compile error through the graph',
    deterministicFeatures: {
      tokenCount: 8,
      identifiers: ['CompileError'],
      filePaths: [],
      symbols: ['CompileError'],
      errorCodes: ['TS2345'],
      languages: ['typescript'],
      astKinds: ['call_expression'],
      requestedActions: ['TRACE'],
      negations: [],
      temporalTerms: [],
      capabilityMask: '0b0011',
      priorActionMask: '0b0001',
      activeFileIds: [],
    },
    retrievalSignals: { lexicalExact: 0.8, lexicalSparse: 0.6, semantic: 0.7, ast: 0.9, graph: 0.8, hyperedge: 0.3 },
    candidateTools: [
      {
        toolId: 'atlas.graph.expand',
        eligible: true,
        exclusionReasonCodes: [],
        signals: { lexicalExact: 0.9, lexicalSparse: 0.7, semantic: 0.8, ast: 0.9, graph: 1, hyperedge: 0.5 },
        intentProbability: 0.95,
        domainProbability: 0.95,
        capabilityMatch: 1,
        hammingMaskMatch: 1,
        historicalSuccessRate: 0.9,
        historicalFailureRate: 0.05,
        evidenceCoverage: 0.9,
        revisionFreshness: 1,
        estimatedLatencyMs: 50,
        estimatedVramBytes: 0,
        requiresWrite: false,
        requiresApproval: false,
        evidenceRefs: ['e2', 'e1'],
      },
      {
        toolId: 'atlas.patch.apply',
        eligible: false,
        exclusionReasonCodes: ['FSM_DISALLOWS_MUTATION'],
        signals: { lexicalExact: 0, lexicalSparse: 0, semantic: 0.1, ast: 0, graph: 0, hyperedge: 0 },
        intentProbability: 0.05,
        domainProbability: 0.5,
        capabilityMatch: 0,
        hammingMaskMatch: 0,
        historicalSuccessRate: 0.5,
        historicalFailureRate: 0.5,
        evidenceCoverage: 0,
        revisionFreshness: 1,
        estimatedLatencyMs: 100,
        estimatedVramBytes: 0,
        requiresWrite: true,
        requiresApproval: true,
        evidenceRefs: [],
      },
    ],
    resourceEnvelope: envelope,
  });
}

describe('Parent Atlas neural routing lineage', () => {
  it('builds a deterministic feature matrix and excludes FSM-masked tools', () => {
    const snap = snapshot();
    expect(snap.candidateFeatureMatrix.rows).toHaveLength(2);
    const receipt = buildToolRoutingReceipt({ snapshot: snap, topK: 3 });
    expect(receipt.selectedToolIds).toEqual(['atlas.graph.expand']);
    expect(receipt.excludedToolIds).toEqual(['atlas.patch.apply']);
    expect(receipt.routingMode).toBe('deterministic');
  });

  it('bounds neural scores as challenger evidence instead of overriding eligibility', () => {
    const snap = snapshot();
    const receipt = buildToolRoutingReceipt({
      snapshot: snap,
      topK: 1,
      neuralScores: { 'atlas.graph.expand': 0.1, 'atlas.patch.apply': 1 },
      neuralWeight: 0.5,
    });
    expect(receipt.selectedToolIds).toEqual(['atlas.graph.expand']);
    expect(receipt.excludedToolIds).toContain('atlas.patch.apply');
  });

  it('creates positive training labels only from verified successful execution', () => {
    const snap = snapshot();
    const receipt = buildToolRoutingReceipt({ snapshot: snap, topK: 1 });
    const examples = buildToolTrainingExamples({
      snapshot: snap,
      routingReceipt: receipt,
      outcome: {
        selectedToolId: 'atlas.graph.expand',
        success: true,
        verificationPassed: true,
        evidenceGain: 0.8,
        latencyMs: 40,
        peakVramBytes: null,
        tokenCost: 20,
        humanOutcome: 'ACCEPTED',
        evidenceRefs: ['exec-1'],
      },
    });
    expect(examples).toHaveLength(1);
    expect(examples[0].label).toBe(1);
    expect(examples[0].verified).toBe(true);
  });

  it('fails closed on GPU admission when VRAM headroom is insufficient', () => {
    const runtime = buildRuntimeIdentity({
      hostOs: 'Windows', executionOs: 'Linux/WSL2', wslDistro: 'Ubuntu',
      gpuUuid: 'GPU-1', deviceName: 'RTX', driverVersion: 'x', cudaRuntime: '13.3',
      pythonEnv: 'atlas-rapids-cu13', backendRevision: 'rev-1', telemetrySource: 'nvml',
    });
    const receipt = buildGpuAdmissionReceipt({
      requestId: 'req-gpu', runtime,
      telemetry: { totalVramBytes: 8_000, usedVramBytes: 7_000, freeVramBytes: 1_000 },
      requestedVramBytes: 900,
      reservedHeadroomBytes: 200,
    });
    expect(receipt.status).toBe('REJECT');
    expect(receipt.reasonCodes).toContain('INSUFFICIENT_VRAM_HEADROOM');
  });
});
