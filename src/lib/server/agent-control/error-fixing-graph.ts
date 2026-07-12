/**
 * Error Fixing Control Plane: LangGraph State Machine
 *
 * Durable workflow orchestrating the three learning circuit layers
 */

import { StateGraph, GraphState, RunnableConfig } from '@langchain/langgraph';
import {
  ErrorFixingGraphState,
  ClassifiedError,
  EvidenceRecord,
  Recommendation,
  RerankResult,
  ObservationClassificationEngine,
  EvidenceResearchWorker,
  RecommendationExecutionEngine,
  recordOutcome,
  getOutcomeStats
} from './learning-circuit.js';
import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════════════════
// Graph Node: OBSERVE (Parse raw error)
// ═══════════════════════════════════════════════════════════════════

async function observeErrorNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[OBSERVE] Processing error:', state.errorText?.substring(0, 100));

  return {
    runId: uuidv4(),
    hmmState: 'OBSERVE',
    traceId: uuidv4(),
    targetFiles: state.targetFiles || []
  };
}

// ═══════════════════════════════════════════════════════════════════
// Graph Node: CLASSIFY (Layer 1: Observation/Classification Engine)
// ═══════════════════════════════════════════════════════════════════

async function classifyErrorNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[CLASSIFY] Using Observation/Classification Engine (Port 8091)');

  const engine = new ObservationClassificationEngine();

  try {
    const classified = await engine.classifyError(state.errorText || '', state.targetFiles);
    console.log('[CLASSIFY] Result:', JSON.stringify(classified, null, 2));

    return {
      hmmState: 'CLASSIFY',
      classifiedError: classified
    };
  } catch (error) {
    console.error('[CLASSIFY] Failed:', error);
    return {
      hmmState: 'BLOCKED',
      validationResults: [{ testName: 'classification', passed: false, duration: 0 }]
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Graph Node: RETRIEVE (Fetch candidates from local sources)
// ═══════════════════════════════════════════════════════════════════

async function retrieveLocalNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[RETRIEVE] Fetching candidates from local sources');

  // Placeholder: In real implementation, call go-retrieval, AST symbol search, packet registry, graph expansion
  const candidatePacketKeys = ['packet:1', 'packet:2', 'packet:3', 'packet:4', 'packet:5'];

  return {
    hmmState: 'RETRIEVE',
    candidatePacketKeys
  };
}

// ═══════════════════════════════════════════════════════════════════
// Graph Node: VALIDATE_EVIDENCE (Layer 2: Evidence Research Worker)
// ═══════════════════════════════════════════════════════════════════

async function validateEvidenceNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[VALIDATE_EVIDENCE] Using Evidence Research Worker (Port 8092)');

  if (!state.classifiedError) {
    return {
      hmmState: 'BLOCKED',
      validationResults: [{ testName: 'evidence-validation', passed: false, duration: 0 }]
    };
  }

  const researcher = new EvidenceResearchWorker();

  try {
    const evidence = await researcher.investigateEvidence(state.classifiedError, state.targetFiles);
    console.log('[VALIDATE_EVIDENCE] Evidence collected:', evidence.length, 'records');

    return {
      hmmState: 'VALIDATE_EVIDENCE',
      evidence: evidence
    };
  } catch (error) {
    console.error('[VALIDATE_EVIDENCE] Failed:', error);
    return {
      hmmState: 'BLOCKED',
      validationResults: [{ testName: 'evidence-gathering', passed: false, duration: 0 }]
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Graph Node: RECOMMEND (Layer 3: Recommendation/Execution Engine)
// ═══════════════════════════════════════════════════════════════════

async function recommendNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[RECOMMEND] Using Recommendation/Execution Engine (Port 8093)');

  const engine = new RecommendationExecutionEngine();

  try {
    const recommendations = await engine.generateRecommendations(state.evidence, state.candidatePacketKeys);
    console.log('[RECOMMEND] Generated', recommendations.length, 'recommendations');

    // Score recommendations via RRF
    const rerankResults = await engine.scoreRecommendations(recommendations);
    rerankResults.sort((a, b) => b.rerankScore - a.rerankScore);

    return {
      hmmState: 'RECOMMEND',
      recommendations,
      rerankResults
    };
  } catch (error) {
    console.error('[RECOMMEND] Failed:', error);
    return {
      hmmState: 'BLOCKED',
      validationResults: [{ testName: 'recommendation', passed: false, duration: 0 }]
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Graph Node: AUTHORIZE (Permission gate)
// ═══════════════════════════════════════════════════════════════════

async function authorizeNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[AUTHORIZE] Permission gate check');

  // In production: check Kanban card, PR review status, etc.
  // For now: default to read-only
  const permission: 'read-only' | 'dry-run' | 'approved' | 'blocked' = 'dry-run';

  if (permission === 'blocked') {
    return {
      hmmState: 'BLOCKED',
      permission
    };
  }

  return {
    hmmState: 'AUTHORIZE',
    permission
  };
}

// ═══════════════════════════════════════════════════════════════════
// Graph Node: EXECUTE (Dry-run or actual execution)
// ═══════════════════════════════════════════════════════════════════

async function executeNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[EXECUTE] Executing selected recommendation');

  if (!state.selectedRecommendationId) {
    return {
      hmmState: 'BLOCKED'
    };
  }

  // Placeholder: Run edits, capture output
  const executionResult = {
    success: true,
    filesChanged: ['src/lib/file1.ts', 'src/lib/file2.ts'],
    stdout: 'Edits applied successfully'
  };

  return {
    hmmState: 'EXECUTE',
    executionResult
  };
}

// ═══════════════════════════════════════════════════════════════════
// Graph Node: TEST (Run test suite)
// ═══════════════════════════════════════════════════════════════════

async function testNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[TEST] Running test suite');

  // Placeholder: Run npm test, capture results
  const validationResults = [
    { testName: 'unit-tests', passed: true, duration: 250 },
    { testName: 'integration-tests', passed: true, duration: 450 },
    { testName: 'e2e-tests', passed: true, duration: 1200 }
  ];

  const allPassed = validationResults.every((r) => r.passed);

  return {
    hmmState: allPassed ? 'COMPLETE' : 'DIAGNOSE',
    validationResults
  };
}

// ═══════════════════════════════════════════════════════════════════
// Graph Node: DIAGNOSE (Analyze test failures)
// ═══════════════════════════════════════════════════════════════════

async function diagnoseNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[DIAGNOSE] Analyzing test failures');

  const failedTests = state.validationResults.filter((r) => !r.passed);
  console.log('[DIAGNOSE] Failed tests:', failedTests.length);

  if (state.retryCount < state.maxRetries) {
    return {
      hmmState: 'RETRIEVE',
      retryCount: state.retryCount + 1
    };
  } else {
    return {
      hmmState: 'BLOCKED'
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Graph Node: COMPLETE (Record outcome and learn)
// ═══════════════════════════════════════════════════════════════════

async function completeNode(state: ErrorFixingGraphState): Promise<Partial<ErrorFixingGraphState>> {
  console.log('[COMPLETE] Workflow complete, recording outcome');

  const outcome = {
    runId: state.runId,
    recommendationType: state.recommendations[0]?.approach || 'unknown',
    selectedTool: state.classifiedError?.suggestedApproaches[0] || 'unknown',
    selectedAgent: 'learning-circuit-v1',

    evidenceTypes: state.evidence.map((e) => e.sourceRef),
    sourceRefValidity: 0.95,

    executionSucceeded: state.executionResult?.success || false,
    testsPassed: state.validationResults.every((r) => r.passed),
    regressionDetected: false,

    latencyMs: 5000, // Placeholder
    timestamp: new Date()
  };

  await recordOutcome(outcome);

  // Update success priors
  const stats = await getOutcomeStats(outcome.recommendationType);
  console.log('[COMPLETE] Success rate for', outcome.recommendationType, ':', stats.successRate);

  return {
    hmmState: 'COMPLETE'
  };
}

// ═══════════════════════════════════════════════════════════════════
// Build the Graph
// ═══════════════════════════════════════════════════════════════════

const stateSchema: GraphState<ErrorFixingGraphState> = {
  runId: { value: (existing, update) => update || existing },
  queryId: { value: (existing, update) => update || existing },
  traceId: { value: (existing, update) => update || existing },
  hmmState: { value: (existing, update) => update || existing },
  errorText: { value: (existing, update) => update || existing },
  targetFiles: { value: (existing, update) => update || existing },
  classifiedError: { value: (existing, update) => update || existing },
  candidatePacketKeys: { value: (existing, update) => update || existing },
  evidence: { value: (existing, update) => update || existing },
  recommendations: { value: (existing, update) => update || existing },
  rerankResults: { value: (existing, update) => update || existing },
  selectedRecommendationId: { value: (existing, update) => update || existing },
  permission: { value: (existing, update) => update || existing },
  executionResult: { value: (existing, update) => update || existing },
  validationResults: { value: (existing, update) => update || existing },
  retryCount: { value: (existing, update) => update ?? existing ?? 0 },
  maxRetries: { value: (existing, update) => update ?? existing ?? 2 }
};

export function createErrorFixingGraph() {
  const workflow = new StateGraph<ErrorFixingGraphState>(stateSchema);

  // Add nodes
  workflow.addNode('observe', observeErrorNode);
  workflow.addNode('classify', classifyErrorNode);
  workflow.addNode('retrieve', retrieveLocalNode);
  workflow.addNode('validate_evidence', validateEvidenceNode);
  workflow.addNode('recommend', recommendNode);
  workflow.addNode('authorize', authorizeNode);
  workflow.addNode('execute', executeNode);
  workflow.addNode('test', testNode);
  workflow.addNode('diagnose', diagnoseNode);
  workflow.addNode('complete', completeNode);

  // Add edges (linear main path)
  workflow.addEdge('START', 'observe');
  workflow.addEdge('observe', 'classify');
  workflow.addEdge('classify', 'retrieve');
  workflow.addEdge('retrieve', 'validate_evidence');
  workflow.addEdge('validate_evidence', 'recommend');
  workflow.addEdge('recommend', 'authorize');
  workflow.addEdge('authorize', 'execute');
  workflow.addEdge('execute', 'test');

  // Conditional edge: test results
  workflow.addConditionalEdges(
    'test',
    (state: ErrorFixingGraphState) => {
      const allPassed = state.validationResults.every((r) => r.passed);
      return allPassed ? 'complete' : 'diagnose';
    },
    { complete: 'complete', diagnose: 'diagnose' }
  );

  // Diagnose can retry or block
  workflow.addConditionalEdges(
    'diagnose',
    (state: ErrorFixingGraphState) => {
      return state.retryCount < state.maxRetries ? 'retrieve' : 'complete';
    },
    { retrieve: 'retrieve', complete: 'complete' }
  );

  workflow.addEdge('complete', 'END');

  return workflow.compile();
}

// ═══════════════════════════════════════════════════════════════════
// API Endpoint Handler
// ═══════════════════════════════════════════════════════════════════

export async function invokeErrorFixingGraph(input: Partial<ErrorFixingGraphState>) {
  const graph = createErrorFixingGraph();

  const finalState = await graph.invoke(
    {
      runId: uuidv4(),
      queryId: uuidv4(),
      traceId: uuidv4(),
      hmmState: 'OBSERVE',
      targetFiles: input.targetFiles || [],
      candidatePacketKeys: [],
      evidence: [],
      recommendations: [],
      validationResults: [],
      retryCount: 0,
      maxRetries: 2,
      ...input
    },
    { configurable: { max_concurrency: 1 } } as RunnableConfig
  );

  return finalState;
}
