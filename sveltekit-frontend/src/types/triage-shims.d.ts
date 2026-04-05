/**
 * Minimal triage shims for local typechecking during Phase H integration.
 */

declare module '$lib/services/xstate-integration' {
	const xstateIntegration: unknown;
	export default xstateIntegration;
}

declare module '$lib/services/mcp-registry' {
	export type McpServerRecord = any;
	const registry: unknown;
	export default registry;
}

declare module '$lib/server/graph-service' {
	const graphService: unknown;
	export default graphService;
}

declare module '$lib/wasm/autoencoder-wasm' {
	const wasmModule: unknown;
	export default wasmModule;
}

declare module '$lib/services/redis-orchestrator' {
	const redisOrchestrator: unknown;
	export default redisOrchestrator;
}

declare module '$lib/server/queue/rabbitmq-workers' {
	const rabbitWorkers: unknown;
	export default rabbitWorkers;
}


declare module '$lib/server/services/analytics-bridge' {
	export function postAnalytics(event: {
		user_id: string;
		event_type: string;
		payload?: unknown;
		timestamp?: number;
	}): Promise<any>;
	export function fetchIntent(userId: string): Promise<any | null>;
}

declare module '$lib/machines/uploadMachine' {
	export function createUploadMachine(pipeline: any): any;
}

declare module '$lib/types/upload' {
	export type ProcessingPipeline = any;
}

// Minimal type stubs used in orchestrator
type TritonOutput = any;
type RedisOrchestrator = any;
type RabbitWorkers = any;
declare function fetchIntent(userId: string): Promise<any | null>;
