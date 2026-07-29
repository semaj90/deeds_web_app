/**
 * Atlas FSM Smoke Test
 *
 * Validates:
 * 1. Runtime context creation
 * 2. FSM state transitions
 * 3. Tool eligibility gating
 * 4. Observation → state inference
 */

import {
  AtlasState,
  createAtlasRuntimeContext,
  type RuntimeObservation,
} from './atlas-runtime-context.js';
import { estimateExecutionState, isTransitionAllowed } from './atlas-fsm-policy.js';

export async function runAtlasSmokeTest(): Promise<{
  passed: number;
  failed: number;
  results: Array<{ test: string; status: 'PASS' | 'FAIL'; message: string }>;
}> {
  const results: Array<{ test: string; status: 'PASS' | 'FAIL'; message: string }> = [];

  // Test 1: Create runtime context
  try {
    const runtime = createAtlasRuntimeContext({
      runId: 'test-001',
      threadId: 'thread-001',
      resourceId: 'resource-001',
      workspaceId: 'test-workspace',
      packetKey: 'atlas:packet:test:001',
      initialState: AtlasState.DISCOVER,
      tokenBudget: 8192,
    });

    if (
      runtime.runId === 'test-001' &&
      runtime.state === AtlasState.DISCOVER &&
      runtime.tokenBudget.maximumInput === 8192
    ) {
      results.push({
        test: 'Create runtime context',
        status: 'PASS',
        message: 'Context created with correct initial state',
      });
    } else {
      results.push({
        test: 'Create runtime context',
        status: 'FAIL',
        message: 'Context fields mismatch',
      });
    }
  } catch (err) {
    results.push({
      test: 'Create runtime context',
      status: 'FAIL',
      message: String(err),
    });
  }

  // Test 2: FSM state transitions
  try {
    const observation: RuntimeObservation = {
      lastTool: 'atlas.discover',
      lastToolSucceeded: true,
      retrievalConfidence: 0.8,
      evidenceCount: 5,
      validationStatus: 'PASS',
      authFailure: false,
      revisionMismatch: false,
      tokenPressure: 0.5,
      iterationNumber: 1,
    };

    const inference = estimateExecutionState(AtlasState.DISCOVER, observation);

    // DISCOVER should transition to RETRIEVE when evidence found
    if (inference.state === AtlasState.RETRIEVE && inference.confidence > 0.5) {
      results.push({
        test: 'FSM DISCOVER → RETRIEVE transition',
        status: 'PASS',
        message: `Transitioned with confidence ${(inference.confidence * 100).toFixed(1)}%`,
      });
    } else {
      results.push({
        test: 'FSM DISCOVER → RETRIEVE transition',
        status: 'FAIL',
        message: `Expected RETRIEVE, got ${inference.state}`,
      });
    }
  } catch (err) {
    results.push({
      test: 'FSM DISCOVER → RETRIEVE transition',
      status: 'FAIL',
      message: String(err),
    });
  }

  // Test 3: Tool eligibility gating and FSM chain
  try {
    // Full chain: DISCOVER → RETRIEVE → VERIFY → SYNTHESIZE → COMPLETE
    let currentState = AtlasState.DISCOVER;
    let step = 0;

    // Step 1: DISCOVER with low confidence (stay in DISCOVER)
    let obs: RuntimeObservation = {
      lastTool: 'atlas.discover',
      lastToolSucceeded: true,
      retrievalConfidence: 0.3,
      evidenceCount: 0,
      validationStatus: 'PASS',
      authFailure: false,
      revisionMismatch: false,
      tokenPressure: 0.2,
      iterationNumber: 1,
    };
    let inference = estimateExecutionState(currentState, obs);
    const step1Pass = inference.allowedTools.length > 0;

    // Step 2: DISCOVER with high evidence (→ RETRIEVE)
    obs = { ...obs, evidenceCount: 10, retrievalConfidence: 0.8 };
    inference = estimateExecutionState(currentState, obs);
    currentState = inference.state;
    const step2Pass = currentState === AtlasState.RETRIEVE;

    // Step 3: RETRIEVE with sufficient results (→ VERIFY)
    obs = {
      lastTool: 'atlas.retrieve',
      lastToolSucceeded: true,
      retrievalConfidence: 0.8,
      evidenceCount: 20,
      validationStatus: 'PASS',
      authFailure: false,
      revisionMismatch: false,
      tokenPressure: 0.4,
      iterationNumber: 2,
    };
    inference = estimateExecutionState(currentState, obs);
    currentState = inference.state;
    const step3Pass = currentState === AtlasState.VERIFY;

    // Step 4: VERIFY with PASS status (→ SYNTHESIZE)
    obs = {
      lastTool: 'atlas.validate_change',
      lastToolSucceeded: true,
      retrievalConfidence: 0.9,
      evidenceCount: 20,
      validationStatus: 'PASS',
      authFailure: false,
      revisionMismatch: false,
      tokenPressure: 0.6,
      iterationNumber: 3,
    };
    inference = estimateExecutionState(currentState, obs);
    currentState = inference.state;
    const step4Pass = currentState === AtlasState.SYNTHESIZE;

    if (step1Pass && step2Pass && step3Pass && step4Pass) {
      results.push({
        test: 'Tool eligibility gating & FSM chain',
        status: 'PASS',
        message: `Full chain validated: DISCOVER → RETRIEVE → VERIFY → SYNTHESIZE`,
      });
    } else {
      results.push({
        test: 'Tool eligibility gating & FSM chain',
        status: 'FAIL',
        message: `Steps: ${step1Pass ? '✓1' : '✗1'} ${step2Pass ? '✓2' : '✗2'} ${step3Pass ? '✓3' : '✗3'} ${step4Pass ? '✓4' : '✗4'}`,
      });
    }
  } catch (err) {
    results.push({
      test: 'Tool eligibility gating & FSM chain',
      status: 'FAIL',
      message: String(err),
    });
  }

  // Test 4: Transition validation
  try {
    const obs: RuntimeObservation = {
      lastTool: 'atlas.retrieve',
      lastToolSucceeded: true,
      retrievalConfidence: 0.9,
      evidenceCount: 20,
      validationStatus: 'PASS',
      authFailure: false,
      revisionMismatch: false,
      tokenPressure: 0.6,
      iterationNumber: 2,
    };

    const allowed = isTransitionAllowed(AtlasState.RETRIEVE, AtlasState.VERIFY, obs);

    if (allowed) {
      results.push({
        test: 'Transition validation RETRIEVE → VERIFY',
        status: 'PASS',
        message: 'Valid transition accepted',
      });
    } else {
      results.push({
        test: 'Transition validation RETRIEVE → VERIFY',
        status: 'FAIL',
        message: 'Valid transition rejected',
      });
    }
  } catch (err) {
    results.push({
      test: 'Transition validation RETRIEVE → VERIFY',
      status: 'FAIL',
      message: String(err),
    });
  }

  // Test 5: Authorization gates (mutation)
  try {
    const runtime = createAtlasRuntimeContext({
      runId: 'test-002',
      threadId: 'thread-002',
      resourceId: 'resource-002',
      workspaceId: 'test-workspace',
      packetKey: 'atlas:packet:test:002',
      initialState: AtlasState.MUTATE,
      tokenBudget: 4096,
    });

    // By default, mutation should be disabled
    if (!runtime.authority.mutationAllowed) {
      results.push({
        test: 'Authorization gate (mutation default disabled)',
        status: 'PASS',
        message: 'Mutation correctly disabled by default',
      });
    } else {
      results.push({
        test: 'Authorization gate (mutation default disabled)',
        status: 'FAIL',
        message: 'Mutation should be disabled by default',
      });
    }
  } catch (err) {
    results.push({
      test: 'Authorization gate (mutation default disabled)',
      status: 'FAIL',
      message: String(err),
    });
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  return { passed, failed, results };
}

// CLI invocation
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runAtlasSmokeTest().then((result) => {
    console.log('\n=== Atlas FSM Smoke Test ===\n');
    result.results.forEach((r) => {
      const icon = r.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${r.test}`);
      console.log(`   ${r.message}\n`);
    });
    console.log(`Results: ${result.passed} passed, ${result.failed} failed\n`);
    process.exit(result.failed > 0 ? 1 : 0);
  });
}
