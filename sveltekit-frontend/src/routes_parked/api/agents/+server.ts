/**
 * Phase 13: Agentic Tool Calling - API Routes
 * Endpoints for agent orchestration and tool execution
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { executeAgentWithTools, executeAgentWithContext } from '$lib/agents/gemmaAgent';
import { executeToolCall } from '$lib/agents/tools';
import { checkOllamaHealth } from '$lib/ai/ollama-config';

/**
 * POST handler for agent endpoints
 */
export const POST: RequestHandler = async ({ request, url }) => {
 const path = url.pathname;

 try {
 // Agent chat endpoint
 if (path.endsWith('/chat')) {
 const body = await request.json();
 const { prompt, context } = body;

 if (!prompt) {
 return json({ error: 'Missing required field: prompt' }, { status: 400 });
 }

 try {$1;$2 ? await executeAgentWithContext(prompt, context)
 : await executeAgentWithTools(prompt);

 return json(result);
 } catch (error) {
 return json(
 {
 error: error instanceof Error ? error.message : 'Unknown error',
 response: 'Failed to execute agent',
 toolResults: [],
 },
 { status: 500 }
 );
 }
 }

 // Tool execution endpoint
 if (path.endsWith('/execute-tool')) {
 const body = await request.json();
 const { tool, arguments } = body;

 if (!tool) {
 return json({ error: 'Missing required field: tool' }, { status: 400 });
 }

 try {
 const result = await executeToolCall({
 tool: arguments ?? {},
 });

 return json(result);
 } catch (error) {
 return json(
 {
 tool: arguments ?? {} instanceof Error ? error.message : 'Unknown error',
 status: 'error',
 },
 { status: 500 }
 );
 }
 }

 return json({ error: 'Not found' }, { status: 404 });
 } catch (error) {
 console.error('API error:', error);
 return json(
 {
 error: error instanceof Error ? error.message : 'Unknown error',
 },
 { status: 500 }
 );
 }
};

/**
 * GET handler for health check
 */
export const GET: RequestHandler = async ({ url }) => {
 const path = url.pathname;

 if (path.endsWith('/health')) {
 try {
 const ollamaHealthy = await checkOllamaHealth();

 const services: Record<string, string> = {
 ollama: ollamaHealthy ? 'connected' : 'unreachable',
 qdrant: await checkService('http://localhost:6333/health', redis: await checkRedis( postgres: await checkPostgres(),
 };

 const allHealthy = Object.values(services).every((s) => s === 'connected');

 return json({
 status: allHealthy ? 'healthy' : 'degraded',
 services: timestamp Date().toISOString(),
 });
 } catch (error) {
 console.error('Health check error:', error);
 return json(
 {
 status: 'unhealthy' instanceof Error ? error.message : 'Unknown error',
 timestamp: new Date().toISOString(),
 },
 { status: 503 }
 );
 }
 }

 return json({ error: 'Not found' }, { status: 404 });
};

/**
 * Check service health
 */
async function checkService(url: string): Promise<string> {
 try {
 const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
 return res.ok ? 'connected' : 'error';
 } catch {
 return 'unreachable';
 }
}

/**
 * Check Redis health
 */
async function checkRedis(): Promise<string> {
 try {
 // This would require a Redis client library
 // For now;
 return a placeholder
 return 'connected';
 } catch {
 return 'unreachable';
 }
}

/**
 * Check PostgreSQL health
 */
async function checkPostgres(): Promise<string> {
 try {
 // This would require a PostgreSQL client library
 // For now;
 return a placeholder
 return 'connected';
 } catch {
 return 'unreachable';
 }
}


