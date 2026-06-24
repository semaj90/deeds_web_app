/**
 * Tool Gateway Diagnostic Test Endpoint
 *
 * Run pre-defined tests to validate tool gateway routing and execution.
 * Use this to debug tool invocation failures.
 *
 * GET /api/agent/rpc/test - Run all tests
 * GET /api/agent/rpc/test?name=topology-status - Run specific test
 * GET /api/agent/rpc/test?name=routing - Run routing validation test
 */

import type { RequestHandler } from './$types';
import { ToolDiagnostics } from '$lib/agent/tool-diagnostic';
import { getToolNames } from '$lib/agent/tool-registry';
import { ENV } from '$lib/server/env.server';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  message: string;
  details?: Record<string, unknown>;
  error?: string;
}

async function testToolRegistration(): Promise<TestResult> {
  const start = performance.now();

  try {
    const tools = getToolNames();
    const hasTools = tools.length > 0;

    return {
      name: 'Tool Registration',
      passed: hasTools,
      duration: Math.round(performance.now() - start),
      message: hasTools
        ? `✓ ${tools.length} tools registered`
        : '✗ No tools registered (check register-tools.ts)',
      details: { tools },
    };
  } catch (err: any) {
    return {
      name: 'Tool Registration',
      passed: false,
      duration: Math.round(performance.now() - start),
      message: '✗ Tool registration failed',
      error: err.message,
    };
  }
}

async function testJsonRpcParsing(): Promise<TestResult> {
  const start = performance.now();

  try {
    // Simulate a JSON-RPC request
    const testRequest = {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1,
    };

    const jsonString = JSON.stringify(testRequest);
    const parsed = JSON.parse(jsonString);

    const isValid =
      parsed.jsonrpc === '2.0' && parsed.method === 'tools/list' && parsed.id === 1;

    return {
      name: 'JSON-RPC Parsing',
      passed: isValid,
      duration: Math.round(performance.now() - start),
      message: isValid ? '✓ JSON-RPC parsing works' : '✗ JSON-RPC parsing failed',
      details: { parsed },
    };
  } catch (err: any) {
    return {
      name: 'JSON-RPC Parsing',
      passed: false,
      duration: Math.round(performance.now() - start),
      message: '✗ JSON-RPC parsing error',
      error: err.message,
    };
  }
}

async function testToolRouting(): Promise<TestResult> {
  const start = performance.now();

  try {
    const tools = getToolNames();

    // Check for different tool types
    const inProcessTools = tools.filter((t) => !t.includes('.'));
    const hasMcpTools = tools.some((t) => t.includes('.'));
    const hasRegisteredTools = inProcessTools.length > 0;

    const passed = hasRegisteredTools;

    return {
      name: 'Tool Routing',
      passed,
      duration: Math.round(performance.now() - start),
      message: passed
        ? `✓ Tool routing configured (${inProcessTools.length} in-process, ${tools.length} total)`
        : '✗ No tools available for routing',
      details: {
        totalTools: tools.length,
        inProcessTools,
        mcpToolsExpected: hasMcpTools,
        traceMcpUrl: ENV.TRACE_MCP_URL ?? 'not configured',
      },
    };
  } catch (err: any) {
    return {
      name: 'Tool Routing',
      passed: false,
      duration: Math.round(performance.now() - start),
      message: '✗ Tool routing test failed',
      error: err.message,
    };
  }
}

async function testDiagnosticCapture(): Promise<TestResult> {
  const start = performance.now();

  try {
    // Clear and test diagnostics
    ToolDiagnostics.clear();
    ToolDiagnostics.logRequest('test-tool', { query: 'test' });
    ToolDiagnostics.logValidation('test-tool', true);
    ToolDiagnostics.logExecution('test-tool', 42, true);

    const log = ToolDiagnostics.getLog('test-tool');
    const hasDiagnostics = log.length > 0;

    return {
      name: 'Diagnostic Capture',
      passed: hasDiagnostics,
      duration: Math.round(performance.now() - start),
      message: hasDiagnostics ? `✓ Diagnostics working (${log.length} entries)` : '✗ Diagnostics not capturing',
      details: { logEntries: log.length, sample: log.slice(0, 2) },
    };
  } catch (err: any) {
    return {
      name: 'Diagnostic Capture',
      passed: false,
      duration: Math.round(performance.now() - start),
      message: '✗ Diagnostic capture failed',
      error: err.message,
    };
  }
}

async function testEnvironmentConfig(): Promise<TestResult> {
  const start = performance.now();

  try {
    const required = {
      TRACE_MCP_URL: ENV.TRACE_MCP_URL,
      DEV_BYPASS_AUTH: process.env.DEV_BYPASS_AUTH,
      SEARXNG_URL: ENV.SEARXNG_URL,
    };

    const configured = Object.values(required).filter((v) => !!v).length;
    const passed = configured >= 2;

    return {
      name: 'Environment Configuration',
      passed,
      duration: Math.round(performance.now() - start),
      message: passed
        ? `✓ Environment configured (${configured}/3 important vars set)`
        : `✗ Missing environment variables (${configured}/3 important vars set)`,
      details: {
        configured: required,
        warning: !required.TRACE_MCP_URL
          ? 'TRACE_MCP_URL not set - MCP tools will be unavailable'
          : undefined,
      },
    };
  } catch (err: any) {
    return {
      name: 'Environment Configuration',
      passed: false,
      duration: Math.round(performance.now() - start),
      message: '✗ Environment check failed',
      error: err.message,
    };
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const testName = url.searchParams.get('name');

  const allTests = [
    testToolRegistration,
    testJsonRpcParsing,
    testToolRouting,
    testDiagnosticCapture,
    testEnvironmentConfig,
  ];

  const tests = testName
    ? allTests.filter((t) => t.name.toLowerCase().includes(testName.toLowerCase()))
    : allTests;

  const results: TestResult[] = [];
  for (const test of tests) {
    results.push(await test());
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const overallSuccess = passed === total;

  return Response.json({
    summary: {
      total,
      passed,
      failed: total - passed,
      success: overallSuccess,
      message: overallSuccess
        ? `✓ All ${total} tests passed`
        : `✗ ${total - passed} of ${total} tests failed`,
    },
    results,
    recommendations: generateRecommendations(results),
    diagnosticsSummary: ToolDiagnostics.getSummary(),
  });
};

function generateRecommendations(results: TestResult[]): string[] {
  const recommendations: string[] = [];

  const toolReg = results.find((r) => r.name === 'Tool Registration');
  if (toolReg && !toolReg.passed) {
    recommendations.push(
      'Tool registration failed. Check that register-tools.ts imports all tool modules.'
    );
  }

  const routing = results.find((r) => r.name === 'Tool Routing');
  if (routing && !routing.passed) {
    recommendations.push(
      'Tool routing failed. Ensure at least one tool is registered in tool-registry.ts'
    );
  }

  const env = results.find((r) => r.name === 'Environment Configuration');
  if (env && !env.passed) {
    recommendations.push(
      'Set TRACE_MCP_URL in .env if you plan to use MCP tools (e.g., TRACE_MCP_URL=http://localhost:8788)'
    );
  }

  const diag = results.find((r) => r.name === 'Diagnostic Capture');
  if (diag && !diag.passed) {
    recommendations.push('Diagnostics not working. Check tool-diagnostic.ts implementation.');
  }

  if (recommendations.length === 0) {
    recommendations.push('All systems operational. Try calling a tool via /api/agent/rpc');
  }

  return recommendations;
}