/**
 * Phase 13: Agentic Tool Calling - Type Definitions
 * TypeScript interfaces for tool calling framework
 */

/**
 * Represents a single tool call made by the agent
 */
export interface ToolCall {
 tool: string;
	arguments: Record<string, any>;
}

/**
 * Result of executing a tool
 */
export interface ToolResult {
 tool: string;
	arguments: Record<string, any>;
 result?: any;
 error?: string;
	status: 'success' | 'error';
}

/**
 * Response from the agent
 */
export interface AgentResponse {
 response: string;
	toolCalls: ToolCall[];
}

/**
 * Combined response with tool results
 */
export interface AgentExecutionResult {
 response: string;
	toolResults: ToolResult[];
}

/**
 * Tool registry entry
 */
export interface ToolDefinition {
 name: string;
	description: string;
	parameters: Record<string, any>;
 execute: (args: Record<string, any>) => Promise<any>;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
 status: 'healthy' | 'degraded' | 'unhealthy';
 services: Record<string, string>;
 timestamp: string;
}

/**
 * RAG lookup result
 */
export interface RagLookupResult {
 summary: string;
	matches: Array<{
	score: number;
 code?: string;
 message?: string;
 errorKey?: string;
 priority?: number;
 framework?: string;
 content?: string;
 tags?: string[];
 timestamp?: number;
 }>;
}

/**
 * Web crawl result
 */
export interface WebCrawlResult {
 url: string;
	status: number;
	text: string;
	links: string[];
}

/**
 * Web document summary result
 */
export interface WebDocSummaryResult {
 url: string;
	topic: string;
	summary: string;
}

/**
 * Web search result
 */
export interface WebSearchResult {
 query: string;
	results: Array<{
	title: string;
	url: string;
	snippet: string;
 }>;
}

/**
 * Code search result
 */
export interface CodeSearchResult {
 pattern: string;
	path: string;
	matches: Array<{
		file: string;
		line: number;
		content: string;
 }>;
}

/**
 * Visual state used by canvas / WebGPU agent renderers.
 * Keep this separate from task execution state so UI interpolation can evolve independently.
 */
export type AgentVisualStatus =
	| 'IDLE'
	| 'SEARCHING'
	| 'ANALYZING'
	| 'EDITING'
	| 'TESTING'
	| 'BLOCKED'
	| 'DONE';

export interface AgentVisualState {
	agentId: string;
	state: AgentVisualStatus;
	progress: number;
	confidence: number;
	evidence: number;
	activity: number;
	clusterX: number;
	clusterY: number;
	previousX: number;
	previousY: number;
	x: number;
	y: number;
	spriteId: number;
	paletteIndex: number;
	animationId: number;
	updatedAtMs: number;
}

export interface AgentVisualInstance extends AgentVisualState {
	interpolatedX: number;
	interpolatedY: number;
	alpha: number;
	ageMs: number;
}

export interface AgentSpriteManifest {
	spriteId: number;
	name: string;
	width: number;
	height: number;
	bitsPerPixel: 2 | 4;
	frameCount: number;
	frameDurationMs: number;
	atlasX: number;
	atlasY: number;
	allowedAgentStates: AgentVisualStatus[];
}

export interface AgentVisualFrame {
	frameTimeMs: number;
	instances: AgentVisualInstance[];
}




