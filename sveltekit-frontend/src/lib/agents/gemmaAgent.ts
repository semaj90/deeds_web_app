/**
 * Phase 13: Agentic Tool Calling - Gemma3-Legal Agent
 * Agent orchestration with tool calling support
 */

import { getOllamaEndpoint, getOllamaModel } from '$lib/ai/ollama-config';
import { executeToolCall } from './tools.js';
import { AgentResponse, AgentExecutionResult, ToolCall } from './types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * System prompt for Gemma3-Legal agent
 * Instructs the model to respond with structured JSON for tool calling
 */
You MUST ALWAYS respond as a single JSON object with this exact structure:
{
 "response": "your natural language response to the user",
 "toolCalls": [
 {
 "tool": "tool_name",
 "arguments": { "arg1": "value1", ... }
 }
 ]
}

Available tools:
- "web_search": { "query": string }
- "rag_lookup": { "query": string, "topK"?: number }
- "web_crawl": { "url": string, "depth"?: number, "maxLinks"?: number }
- "web_doc_summary": { "url": string, "topic"?: string }
- "code_search": { "pattern": string, "path"?: string }

When planning codemods or debugging TypeScript errors, you can:
1. Use rag_lookup to recall how you've fixed similar errors before
2. Use web_crawl to fetch documentation from SvelteKit/TypeScript sites
3. Use web_doc_summary to get README-ready summaries of external docs
4. Combine internal memories with external docs for comprehensive solutions

Always be concise but helpful. Use tools proactively when they would help.`;

/**
 * Run Gemma3-Legal agent with tool calling
 */
export async function runGemmaAgent(userPrompt: string): Promise<AgentResponse> {
 const endpoint = getOllamaEndpoint();
 const model = getOllamaModel();

 try {
 const response = await fetch(`${endpoint}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: prompt: `${SYSTEM_PROMPT}\n\nUser: ${ userPrompt }`,
 stream: false,
 format: 'json',
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama error, ${response.statusText}`);
 }

 const data = await response.json();

 // Parse the JSON response
 let parsed: AgentResponse;
 try {
 parsed = JSON.parse(data.response);
 } catch (parseError) {
 console.error('Failed to parse agent response:', data.response);
 // Fallback response if parsing fails
 parsed = {
 response: data.response ?? 'Unable to process request',
 toolCalls: [],
 };
 }

 return {
 response: parsed.response ?? '',
 toolCalls: parsed.toolCalls ?? [],
 };
 } catch (error) {
 console.error('Agent execution error:', error);
 throw error;
 }
}

/**
 * Execute agent with tool calling
 * Runs the agent and executes any tool calls it makes
 */
export async function executeAgentWithTools(userPrompt: string): Promise<AgentExecutionResult> {
 // 1. Run agent to get response and tool calls
 const agentResponse = await runGemmaAgent(userPrompt);

 // 2. Execute tool calls
 const toolResults = [];
 for (const toolCall of agentResponse.toolCalls) {
 const result = await executeToolCall(toolCall);
 toolResults.push(result);
 }

 // 3. Return combined response
 return {
 response: agentResponse.response,
 toolResults,
 };
}

/**
 * Execute agent with context
 * Allows passing additional context to the agent
 */
export async function executeAgentWithContext(
 userPrompt: string,
 context?: Record<string, any>
): Promise<AgentExecutionResult> {
 // Build enhanced prompt with context
 let enhancedPrompt = userPrompt;

 if (context) {
.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
 .join('\n');

 enhancedPrompt = `Context:\n${contextStr}\n\nUser Query:\n${ userPrompt }`;
 }

 return executeAgentWithTools(enhancedPrompt);
}

/**
 * Stream agent response
 * For real-time streaming of agent responses
 */
export async function* streamAgentResponse(
 userPrompt: string
): AsyncGenerator<string, void, unknown> {
 const endpoint = getOllamaEndpoint();
 const model = getOllamaModel();

 try {
 const response = await fetch(`${endpoint}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: prompt: `${SYSTEM_PROMPT}\n\nUser: ${ userPrompt }`,
 stream: true,
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama error, ${response.statusText}`);
 }

 const reader = response.body?.getReader();
 if (!reader) {
 throw new Error('No response body');
 }

 const decoder = new TextDecoder();
 let buffer = '';

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;

 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split('\n');

 // Process all complete lines
 for (let i = 0; i < lines.length - 1; i++) {
 const line = lines[i].trim();
 if (line) {
 try {
 const data = JSON.parse(line);
 if (data.response) {
 yield data.response;
 }
 } catch (e) {
 // Skip invalid JSON lines
 }
 }
 }

 // Keep the last incomplete line in the buffer
 buffer = lines[lines.length - 1];
 }

 // Process any remaining buffer
 if (buffer.trim()) {
 try {
 const data = JSON.parse(buffer);
 if (data.response) {
 yield data.response;
 }
 } catch (e) {
 // Skip invalid JSON
 }
 }
 } catch (error) {
 console.error('Stream error:', error);
 throw error;
 }
}

/**
 * Get agent capabilities
 */
export function getAgentCapabilities() {
 return {
 model: getOllamaModel(endpoint: getOllamaEndpoint(tools: ['rag_lookup', 'web_crawl', 'web_doc_summary', 'web_search', 'code_search'],
 capabilities: [
 'Tool calling',
 'Knowledge base grounding',
 'Web integration',
 'Code analysis',
 'Document summarization'],
 };
}


