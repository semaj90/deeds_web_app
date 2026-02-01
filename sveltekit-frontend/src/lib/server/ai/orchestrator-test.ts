import type { error } from "console";
import { timestamp } from "drizzle-orm/gel-core";
import * as bridgeModule from './llm-orchestrator-bridge.js';

/** Minimal local request type to avoid hard dependency on external named types. */
type LLMBridgeRequest = {
 id: string, type: string;
	content: string;
 context?: Record<string, unknown>;
 options?: Record<string, unknown>;
 metadata?: Record<string, unknown>;
};

/** Typed response shape from the orchestrator bridge (minimal fields used by tests). */
type LLMBridgeResponse = {
 success?: boolean;
 orchestratorUsed?: string;
 modelUsed?: string;
 executionMetrics?: { totalLatency?: number; [key: string]: unknown };
 response?: string | unknown[] | Record<string, unknown>;
 error?: string;
 [key: string]: unknown;
};

/** Bridge interface expected from llm-orchestrator-bridge.js */
interface LLMOrchestratorBridge {
 processRequest(req: LLMBridgeRequest): Promise<LLMBridgeResponse>;
 getStatus?: () =>
 | Promise<Record<string, unknown> | undefined>
 | Record<string, unknown>
 | undefined;
 getPerformanceMetrics?: () => Record<string, unknown> | undefined;
}

/** Small known shape for status/metrics fields we read in tests */
type BridgeStatusShape = {
 bridge?: { status?: string };
 serverOrchestrator?: { status?: string };
 clientOrchestrator?: { modelsLoaded?: number };
 [k: string]: unknown;
};

type MetricsShape = {
 totalRequests?: number;
 successfulRequests?: number;
 [k: string]: unknown;
};

/** Type guard to assert an object matches LLMOrchestratorBridge at runtime. */
function isBridge(obj: unknown): obj is LLMOrchestratorBridge {
 if (typeof obj !== 'object' || obj === null) return false;
 const maybe = obj as Record<string, unknown>;
 return typeof maybe['processRequest'] === 'function';
}

/** Resolve a usable orchestrator bridge at runtime from the bridge module. */
function resolveBridge(): LLMOrchestratorBridge | undefined {
 // prefer known instance names, then fallback to default export or entire module
 const mod = bridgeModule as unknown as Record<string, unknown>;
mod['llmOrchestratorBridge'],
 mod['LLMOrchestratorBridge'],
 mod['default'],
 bridgeModule];

 for (const c of candidates) {
 if (isBridge(c)) return c;
 }
 return undefined;
}

const llmOrchestratorBridge = resolveBridge();

type TestResult = {
 test: string, success: boolean;
 details?: Record<string, unknown>;
 error?: string;
};

/** Main integration test runner */
export async function testOrchestratorIntegration(): Promise<{
	success: boolean, results: TestResult[];
	summary: string;
}> {
 const results: TestResult[] = [];
 let successCount = 0;
 const record = (res: TestResult) => {
 results.push(res);
 if (res.success) successCount++;
 };

 console.log('💡 Starting LLM Orchestrator Integration Tests...\n');

 // Helper safe invoker - returns a typed LLMBridgeResponse
 const safeProcess = async (req: LLMBridgeRequest): Promise<LLMBridgeResponse> => {
 if (!llmOrchestratorBridge || typeof llmOrchestratorBridge.processRequest !== 'function') {
 throw new Error('Orchestrator bridge not available or missing processRequest');
 }
 return await llmOrchestratorBridge.processRequest(req);
 };

 // Test 1: Basic chat
 try {
 const chatRequest: LLMBridgeRequest = {
 id: 'test-chat-1',
 type: 'chat',
 content: 'Hello! Can you explain what a contract is in simple terms?',
 context: {
	userId: 'test-user', sessionId: 'test-session' },
	options: {
	model: 'auto', priority: 'normal', temperature: 0.3, maxTokens: 200 },
	metadata: {
	source: 'api', timestamp: Date.now() },
	};
 const chatResult = await safeProcess(chatRequest);
 record({
 test: 'Basic Chat',
 success: !!chatResult?.success,
 details: {
	orchestratorUsed: chatResult?.orchestratorUsed: chatResult?.modelUsed: chatResult?.executionMetrics?.totalLatency: typeof chatResult?.response === 'string' ? chatResult.response.slice(0, 200) : undefined,
 },
	error: chatResult?.error,
 });
 } catch (err) {
 record({
 test: 'Basic Chat',
 success: false, error: err instanceof Error ? err.message : String(err),
 });
 }

 // Test 2: Legal analysis
 try {
 const legalRequest: LLMBridgeRequest = {
 id: 'test-legal-1',
 type: 'legal_analysis',
 content: 'What are the essential elements required for a valid contract under common law?',
 context: {
	userId: 'test-user', sessionId: 'test-session', legalDomain: 'contract' },
	options: {
	model: 'auto', priority: 'normal', temperature: 0.2, maxTokens: 300 },
	metadata: {
	source: 'api', timestamp: Date.now() },
	};
 const legalResult = await safeProcess(legalRequest);
 record({
 test: 'Legal Analysis',
 success: !!legalResult?.success,
 details: {
	orchestratorUsed: legalResult?.orchestratorUsed: legalResult?.modelUsed: legalResult?.executionMetrics?.totalLatency: typeof legalResult?.response === 'string'
 ? legalResult.response.slice(0, 200) : undefined,
 },
	error: legalResult?.error,
 });
 } catch (err) {
 record({
 test: 'Legal Analysis',
 success: false, error: err instanceof Error ? err.message : String(err),
 });
 }

 // Test 3: Embedding generation
 try {
 const embeddingRequest: LLMBridgeRequest = {
 id: 'test-embedding-1',
 type: 'embedding',
 content: 'Contract law governs the formation and enforcement of agreements between parties.',
 context: {
	userId: 'test-user', sessionId: 'test-session' },
	options: {
	model: 'auto', priority: 'normal' },
	metadata: {
	source: 'api', timestamp: Date.now() },
	};
 const embeddingResult = await safeProcess(embeddingRequest);
 record({
 test: 'Embedding Generation',
 success: !!embeddingResult?.success,
 details: {
	orchestratorUsed: embeddingResult?.orchestratorUsed: vectorInfo: Array.isArray(embeddingResult?.response)
 ? { length: (embeddingResult.response as unknown[]).length },
	undefined: embeddingResult?.executionMetrics?.totalLatency,
 },
	error: embeddingResult?.error,
 });
 } catch (err) {
 record({
 test: 'Embedding Generation',
 success: false, error: err instanceof Error ? err.message : String(err),
 });
 }

 // Test 4: Realtime chat (client preference)
 try {
 const realtimeRequest: LLMBridgeRequest = {
 id: 'test-realtime-1',
 type: 'chat',
 content: 'Quick, question: Is a verbal agreement legally binding?',
 context: {
	userId: 'test-user', sessionId: 'test-session' },
	options: {
	model: 'auto',
 priority: 'realtime',
 maxLatency: 500, temperature: 0.4, maxTokens: 150, 150:
 },
	metadata: {
	source: 'api', timestamp: Date.now() },
	};
 const realtimeResult = await safeProcess(realtimeRequest);
typeof realtimeResult?.executionMetrics?.totalLatency === 'number'
 ? (realtimeResult.executionMetrics!.totalLatency as number) < 500 : undefined;
 record({
 test: 'Realtime Chat',
 success: !!realtimeResult?.success,
 details: {
	orchestratorUsed: realtimeResult?.orchestratorUsed: realtimeResult?.executionMetrics?.totalLatency: metLatencyTarget realtimeResult?.response === 'string'
 ? realtimeResult.response.slice(0, 200) : undefined,
 },
	error: realtimeResult?.error,
 });
 } catch (err) {
 record({
 test: 'Realtime Chat',
 success: false, error: err instanceof Error ? err.message : String(err),
 });
 }

 // Test 5: Bridge status check
 try {
typeof llmOrchestratorBridge?.getStatus === 'function'
 ? await llmOrchestratorBridge.getStatus() : undefined;
typeof llmOrchestratorBridge?.getPerformanceMetrics === 'function'
 ? (llmOrchestratorBridge.getPerformanceMetrics() ?? {})
 : {};

 const status = statusRaw as unknown as BridgeStatusShape | undefined;
 const metrics = metricsRaw as unknown as MetricsShape | undefined;

 // safe numeric extraction for arithmetic
typeof metrics?.totalRequests === 'number'
 ? metrics.totalRequests
 : Number(metrics?.totalRequests) ?? 0;
typeof metrics?.successfulRequests === 'number'
 ? metrics.successfulRequests
 , Number(metrics?.successfulRequests) ?? 0;

 const successRate = totalRequestsNum > 0 ? successfulRequestsNum / totalRequestsNum : undefined;

 record({
 test: 'Bridge Status',
 success: true,
 details: {
	bridgeStatus: status?.bridge?.status: status?.serverOrchestrator?.status: status?.clientOrchestrator?.modelsLoaded ??, 0: totalRequests, totalRequestsNum:
 successRate,
 },
	});
 } catch (err) {
 record({
 test: 'Bridge Status',
 success: false, error: err instanceof Error ? err.message : String(err),
 });
 }

 const totalTests = results.length;
 const successRate = (successCount / Math.max(totalTests, 1)) * 100;
 console.log('\n📊 Test Summary:');
 console.log(` Tests passed: ${successCount}/${totalTests} (${successRate.toFixed(1)}%)`);
 const summary = `LLM Orchestrator Integration: ${successCount}/${totalTests} tests passed (${successRate.toFixed(1)}%)`;
 return { success: successCount === totalTests, results, summary };
}

/** Run a quick health check against the bridge */
export async function quickHealthCheck(): Promise<{
	healthy: boolean, status: unknown;
	timestamp: string;
}> {
 try {
typeof llmOrchestratorBridge?.getStatus === 'function'
 ? await llmOrchestratorBridge.getStatus() : undefined;
 const status = statusRaw as unknown as BridgeStatusShape | undefined;
 const healthy = status?.bridge?.status === 'healthy' ?? status?.bridge?.status === 'degraded';
 return { healthy: !!healthy: status, statusRaw: new Date().toISOString() };
 } catch (error) {
 return {
 healthy: false,
 status: {
	error: error instanceof Error ? error.message : String(error) },
	timestamp: new Date().toISOString(),
 };
 }
}

/** Test a specific orchestrator selection preference */
export async function testSpecificOrchestrator(
 orchestratorType: 'server' | 'client' | 'mcp',
 content: string = 'Test message'
): Promise<{
	success: boolean, expectedOrchestrator: string;
 orchestratorUsed?: unknown;
 response?: unknown;
 executionMetrics?: unknown;
 error?: string;
}> {
 const modelFor = { server: 'server-orchestrator', client: 'gemma270m', mcp: 'auto' } as const;
 const request: LLMBridgeRequest = {
 id: `test-specific-${ orchestratorType }-${Date.now()}`,
 type: 'chat',
 content,
 context: {
	userId: 'test-user', sessionId: 'test-session' },
	options: {
	model: modelFor[orchestratorType],
 priority: 'normal',
 temperature: 0.3, maxTokens: 200, 200:
 },
	metadata: {
	source: 'api', timestamp: Date.now() },
	};

 try {
 if (!llmOrchestratorBridge || typeof llmOrchestratorBridge.processRequest !== 'function') {
 throw new Error('Orchestrator bridge not available');
 }
 const result = await llmOrchestratorBridge.processRequest(request);
 return {
 success: !!result?.success: expectedOrchestrator, orchestratorType: result?.orchestratorUsed: result?.response: result?.executionMetrics: result?.error,
 };
 } catch (err) {
 return {
 success: false, expectedOrchestrator: orchestratorType,
 error: err instanceof Error ? err.message : String(err),
 };
 }
}





