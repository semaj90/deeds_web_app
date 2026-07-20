/**
 * Test Suite Execution Endpoint
 * POST /api/evaluation/run-test-suite
 *
 * Runs deterministic evaluation against specified model.
 * Validates Cline vs Code extension compatibility.
 *
 * Request:
 *   {
 *     "model": "gemma4-legal" | "hforf-7b" | "qwen3-7b",
 *     "testCaseIds": ["test-1", "test-2"] (optional, runs all if omitted),
 *     "maxConcurrent": 1 (default, prevent rate limiting)
 *   }
 *
 * Response (streaming):
 *   data: { testCaseId, model, passed, latencyMs, evidence }
 *   data: { aggregate: { totalTests, passCount, successRate, ... } }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  evaluateTestCase,
  aggregateResults,
  formatEvaluationReport,
  type EvaluationTestCase,
  type EvaluationResult,
} from '$lib/server/evaluation/deterministic-evaluators.js';
import {
  MODEL_CAPABILITIES,
  createClinetContract,
  createCodeExtensionContract,
  getModelWarnings,
  checkModelHealth,
  type ModelIdentifier,
} from '$lib/server/evaluation/model-contracts.js';

const LLAMA_BASE_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';

/**
 * Predefined test suite for Cline + Code extension evaluation
 */
const TEST_SUITE: EvaluationTestCase[] = [
  {
    id: 'streaming-basic',
    prompt: 'Return "Hello, Cline!" and nothing else.',
    expectedBehavior: 'code_generation',
    constraints: {
      maxLatencyMs: 3000,
      minTokens: 2,
      maxTokens: 20,
    },
    goldStandard: {
      responseContains: ['Hello', 'Cline'],
      finishReason: 'stop',
    },
  },
  {
    id: 'tool-call-basic',
    prompt: 'Call a tool named "get_time" with no arguments.',
    expectedBehavior: 'tool_calling',
    constraints: {
      maxLatencyMs: 3000,
      requiredToolCalls: ['get_time'],
    },
    goldStandard: {
      responseContains: ['<tool_call>', 'get_time'],
      toolCallCount: 1,
      finishReason: 'tool_calls',
    },
  },
  {
    id: 'constraint-token-limit',
    prompt: 'Say exactly 10 words and nothing more.',
    expectedBehavior: 'code_generation',
    constraints: {
      maxLatencyMs: 3000,
      minTokens: 8,
      maxTokens: 12,
    },
    goldStandard: {
      responseContains: ['words'],
      finishReason: 'stop',
    },
  },
  {
    id: 'error-recovery-invalid-json',
    prompt: 'Parse this invalid JSON and recover gracefully: {invalid}',
    expectedBehavior: 'error_recovery',
    constraints: {
      maxLatencyMs: 3000,
      bannedPatterns: ['error', 'exception', 'failed'],
    },
    goldStandard: {
      responseContains: ['recover', 'invalid', 'JSON'],
      responseExcludes: ['Internal error', 'Stack trace'],
      finishReason: 'stop',
    },
  },
  {
    id: 'multi-turn-coherence',
    prompt: 'Remember this: "secret_code=ABC123". Later I will ask what you remember.',
    expectedBehavior: 'code_generation',
    constraints: {
      maxLatencyMs: 2000,
    },
    goldStandard: {
      responseContains: ['understood', 'remember', 'ABC123'],
      finishReason: 'stop',
    },
  },
  {
    id: 'streaming-long-output',
    prompt: 'Generate a list of 20 items numbered 1-20.',
    expectedBehavior: 'streaming',
    constraints: {
      maxLatencyMs: 5000,
      minTokens: 50,
    },
    goldStandard: {
      responseContains: ['1', '20'],
      finishReason: 'stop',
    },
  },
];

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { model, testCaseIds, maxConcurrent = 1 } = body as {
      model: ModelIdentifier;
      testCaseIds?: string[];
      maxConcurrent?: number;
    };

    if (!model) {
      return error(400, 'model is required');
    }

    if (!MODEL_CAPABILITIES[model]) {
      return error(400, `Unknown model: ${model}`);
    }

    // Health check before running tests
    const health = await checkModelHealth(model, LLAMA_BASE_URL);
    if (!health.healthy) {
      return error(503, `Model health check failed: ${health.errors.join('; ')}`);
    }

    // Filter test cases
    const tests = TEST_SUITE.filter(
      t => !testCaseIds || testCaseIds.includes(t.id)
    );

    if (tests.length === 0) {
      return error(400, 'No matching test cases');
    }

    // Streaming response with test results
    const encoder = new TextEncoder();
    const results: EvaluationResult[] = [];

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Send model contract info
          const contract = createClinetContract(model);
          const warnings = getModelWarnings(model);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'start',
                model,
                contract,
                warnings,
                testCount: tests.length,
              })}\n\n`
            )
          );

          // Run tests sequentially (maxConcurrent=1 prevents llama-server overload)
          for (const testCase of tests) {
            const result = await evaluateTestCase(
              testCase,
              model,
              async () => {
                const startMs = Date.now();
                const response = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: getModelFileName(model),
                    messages: [
                      {
                        role: 'user',
                        content: testCase.prompt,
                      },
                    ],
                    temperature: 0.3,
                    max_tokens: testCase.constraints.maxTokens || 2048,
                    stream: false,
                  }),
                });

                const latencyMs = Date.now() - startMs;

                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                const responseText = data.choices?.[0]?.message?.content || '';

                return { response: responseText, latencyMs };
              }
            );

            results.push(result);

            // Stream individual result
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'result',
                  ...result,
                })}\n\n`
              )
            );
          }

          // Aggregate results
          const aggregate = results.length > 0
            ? {
                totalTests: results.length,
                passCount: results.filter(r => r.passed).length,
                failCount: results.filter(r => !r.passed).length,
                successRate: results.filter(r => r.passed).length / results.length,
                avgLatencyMs:
                  results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length,
              }
            : null;

          // Stream aggregate
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'aggregate',
                ...aggregate,
              })}\n\n`
            )
          );

          // Stream formatted report
          const report = formatEvaluationReport({
            model,
            totalTests: aggregate?.totalTests || 0,
            passCount: aggregate?.passCount || 0,
            failCount: aggregate?.failCount || 0,
            successRate: aggregate?.successRate || 0,
            avgLatencyMs: aggregate?.avgLatencyMs || 0,
            criticalFailures: results
              .filter(r => !r.passed)
              .map(r => `${r.testCaseId}: ${r.evidence.goldStandardMismatches.join('; ')}`),
            warnings: results
              .filter(r => r.latencyMs > 3000)
              .map(r => `${r.testCaseId}: High latency ${r.latencyMs}ms`),
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'report',
                text: report,
              })}\n\n`
            )
          );

          controller.close();
        } catch (err) {
          console.error('[evaluation]', err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: err instanceof Error ? err.message : String(err),
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[evaluation]', err);
    return error(500, err instanceof Error ? err.message : 'Internal error');
  }
};

/**
 * Map model identifier to GGUF filename
 */
function getModelFileName(model: ModelIdentifier): string {
  const fileMap: Record<ModelIdentifier, string> = {
    'gemma4-legal': 'gemma4-legal-iq4xs-direct.gguf',
    'hforf-7b': 'hforf-7b.gguf',
    'qwen3-7b': 'qwen3-7b-instruct-q4_k_m.gguf',
    unknown: 'unknown.gguf',
  };
  return fileMap[model];
}
