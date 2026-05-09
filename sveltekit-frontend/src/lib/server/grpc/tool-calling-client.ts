/**
 * gRPC ToolCallingService Client — server-only.
 *
 * Lazy-loaded gRPC client for the ToolCallingService defined in
 * proto/active/tool_calling.proto.  Follows the same lazy-singleton +
 * 30s retry-backoff pattern as embedding-client.ts / chr97-agent-client.ts.
 *
 * All addresses resolved via ENV.* getters in env.server.ts.
 *
 * When disabled or unavailable every method returns an empty / error result
 * so callers can fall through to the inline HTTP pipeline unchanged.
 */
import { resolve } from 'path';
import { ENV } from '$lib/server/env.server.js';

// ── Public types (mirror proto/active/tool_calling.proto) ────────────────

export interface ToolParameter {
	name: string;
	type: 'string' | 'number' | 'boolean';
	description: string;
	required: boolean;
	defaultValue?: string;
	minLength?: number;
	maxLength?: number;
	minValue?: number;
	maxValue?: number;
	pattern?: string;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: ToolParameter[];
	timeoutMs: number;
	category: 'retrieval' | 'search' | 'graph' | 'authority' | 'analysis' | 'cache';
}

export interface ToolCallRequest {
	requestId: string;
	toolName: string;
	arguments: Record<string, string>;
	caseId?: string;
	userId?: string;
	retrievalConfidence?: number;
	message?: string;
}

export interface ToolCallResponse {
	requestId: string;
	ok: boolean;
	toolName: string;
	result: string;
	durationMs: number;
	resultCount: number;
	scores: number[];
	metadata: Record<string, string>;
	error?: string;
}

export interface ToolCallBatchRequest {
	calls: ToolCallRequest[];
	parallel: boolean;
}

export interface ToolCallBatchResponse {
	results: ToolCallResponse[];
	totalDurationMs: number;
}

export interface ToolCallEvent {
	requestId: string;
	eventType: 'start' | 'progress' | 'result' | 'error' | 'done';
	toolName: string;
	data: string;
	elapsedMs: number;
}

// ── gRPC lazy singleton ──────────────────────────────────────────────────

let _grpcClient: unknown = null;
let _loadFailed = false;
let _retryAt = 0;

async function _getGrpcClient(): Promise<unknown> {
	if (!ENV.TOOL_GRPC_ENABLED) return null;
	if (_loadFailed) {
		if (Date.now() < _retryAt) return null;
		_loadFailed = false;
		_grpcClient = null;
	}
	if (_grpcClient) return _grpcClient;

	try {
		const grpc = await import('@grpc/grpc-js');
		const protoLoader = await import('@grpc/proto-loader');

		const PROTO_PATH = resolve(process.cwd(), '../proto/active/tool_calling.proto');
		const pkg = protoLoader.loadSync(PROTO_PATH, {
			keepCase: false,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true,
		});
		const grpcPkg = grpc.loadPackageDefinition(pkg) as Record<string, unknown>;
		const yorha = grpcPkg['yorha'] as Record<string, unknown>;
		const tools = yorha['tools'] as Record<string, unknown>;
		const ServiceCtor = tools['ToolCallingService'] as new (
			addr: string,
			creds: unknown,
		) => unknown;

		_grpcClient = new ServiceCtor(
			ENV.TOOL_GRPC_URL,
			grpc.credentials.createInsecure(),
		);
		return _grpcClient;
	} catch (err) {
		console.error('[tool-calling-grpc] init failed:', err);
		_loadFailed = true;
		_retryAt = Date.now() + 30_000;
		return null;
	}
}

// ── gRPC unary helper ────────────────────────────────────────────────────

type GrpcCallback<T> = (err: Error | null, res: T) => void;
type GrpcUnaryMethod<Req, Res> = (req: Req, opts: { deadline: Date }, cb: GrpcCallback<Res>) => void;

function _unary<Req, Res>(
	client: unknown,
	method: string,
	req: Req,
	deadlineMs: number,
): Promise<Res | null> {
	return new Promise((resolve) => {
		const fn = (client as Record<string, GrpcUnaryMethod<Req, Res>>)[method];
		if (typeof fn !== 'function') { resolve(null); return; }
		fn.call(client, req, { deadline: new Date(Date.now() + deadlineMs) }, (err, res) => {
			if (err) { resolve(null); return; }
			resolve(res);
		});
	});
}

// ── Proto message ↔ TypeScript conversion ────────────────────────────────

function _toProtoRequest(req: ToolCallRequest): Record<string, unknown> {
	return {
		requestId:           req.requestId,
		toolName:            req.toolName,
		arguments:           req.arguments,
		caseId:              req.caseId ?? '',
		userId:              req.userId ?? '',
		retrievalConfidence: req.retrievalConfidence ?? 0,
		message:             req.message ?? '',
	};
}

function _fromProtoResponse(raw: Record<string, unknown>): ToolCallResponse {
	return {
		requestId:   String(raw['requestId'] ?? ''),
		ok:          Boolean(raw['ok']),
		toolName:    String(raw['toolName'] ?? ''),
		result:      String(raw['result'] ?? ''),
		durationMs:  Number(raw['durationMs'] ?? 0),
		resultCount: Number(raw['resultCount'] ?? 0),
		scores:      Array.isArray(raw['scores']) ? (raw['scores'] as unknown[]).map(Number) : [],
		metadata:    (raw['metadata'] ?? {}) as Record<string, string>,
		error:       raw['error'] ? String(raw['error']) : undefined,
	};
}

function _fromProtoTool(raw: Record<string, unknown>): ToolDefinition {
	return {
		name:        String(raw['name'] ?? ''),
		description: String(raw['description'] ?? ''),
		parameters:  Array.isArray(raw['parameters'])
			? (raw['parameters'] as Record<string, unknown>[]).map((p) => ({
					name:         String(p['name'] ?? ''),
					type:         String(p['type'] ?? 'string') as ToolParameter['type'],
					description:  String(p['description'] ?? ''),
					required:     Boolean(p['required']),
					defaultValue: p['defaultValue'] ? String(p['defaultValue']) : undefined,
					minLength:    p['minLength'] != null ? Number(p['minLength']) : undefined,
					maxLength:    p['maxLength'] != null ? Number(p['maxLength']) : undefined,
					minValue:     p['minValue'] != null ? Number(p['minValue']) : undefined,
					maxValue:     p['maxValue'] != null ? Number(p['maxValue']) : undefined,
					pattern:      p['pattern'] ? String(p['pattern']) : undefined,
				}))
			: [],
		timeoutMs: Number(raw['timeoutMs'] ?? 30_000),
		category:  String(raw['category'] ?? 'retrieval') as ToolDefinition['category'],
	};
}

function _errorResponse(req: ToolCallRequest, message: string): ToolCallResponse {
	return {
		requestId:   req.requestId,
		ok:          false,
		toolName:    req.toolName,
		result:      '',
		durationMs:  0,
		resultCount: 0,
		scores:      [],
		metadata:    {},
		error:       message,
	};
}

// ── ToolCallingClient class ───────────────────────────────────────────────

export class ToolCallingClient {
	get isEnabled(): boolean {
		return ENV.TOOL_GRPC_ENABLED;
	}

	/**
	 * Execute a single tool call via gRPC ExecuteTool RPC.
	 */
	async executeTool(req: ToolCallRequest, timeoutMs = 30_000): Promise<ToolCallResponse> {
		const client = await _getGrpcClient();
		if (!client) return _errorResponse(req, 'ToolCallingService unavailable');

		const raw = await _unary<Record<string, unknown>, Record<string, unknown>>(
			client, 'executeTool', _toProtoRequest(req), timeoutMs,
		);
		if (!raw) return _errorResponse(req, 'gRPC ExecuteTool failed');
		return _fromProtoResponse(raw);
	}

	/**
	 * Batch execute multiple tool calls via gRPC ExecuteToolBatch RPC.
	 */
	async executeBatch(req: ToolCallBatchRequest, timeoutMs = 60_000): Promise<ToolCallBatchResponse> {
		const client = await _getGrpcClient();
		if (!client) {
			return {
				results: req.calls.map((c) => _errorResponse(c, 'ToolCallingService unavailable')),
				totalDurationMs: 0,
			};
		}

		const proto = {
			calls:    req.calls.map(_toProtoRequest),
			parallel: req.parallel,
		};
		const raw = await _unary<Record<string, unknown>, Record<string, unknown>>(
			client, 'executeToolBatch', proto, timeoutMs,
		);
		if (!raw) {
			return {
				results: req.calls.map((c) => _errorResponse(c, 'gRPC ExecuteToolBatch failed')),
				totalDurationMs: 0,
			};
		}

		const rawResults = Array.isArray(raw['results'])
			? (raw['results'] as Record<string, unknown>[])
			: [];
		return {
			results:         rawResults.map(_fromProtoResponse),
			totalDurationMs: Number(raw['totalDurationMs'] ?? 0),
		};
	}

	/**
	 * Stream tool results via gRPC server-streaming ExecuteToolStream RPC.
	 */
	async *executeStream(req: ToolCallRequest): AsyncGenerator<ToolCallEvent> {
		const client = await _getGrpcClient();
		if (!client) {
			yield {
				requestId: req.requestId,
				eventType: 'error',
				toolName:  req.toolName,
				data:      'ToolCallingService unavailable',
				elapsedMs: 0,
			};
			return;
		}

		// Server-streaming via @grpc/grpc-js
		type StreamCall = {
			on(ev: 'data', cb: (chunk: Record<string, unknown>) => void): void;
			on(ev: 'end', cb: () => void): void;
			on(ev: 'error', cb: (err: Error) => void): void;
		};

		const callFn = (client as Record<string, (req: Record<string, unknown>) => StreamCall>)[
			'executeToolStream'
		];
		if (typeof callFn !== 'function') {
			yield { requestId: req.requestId, eventType: 'error', toolName: req.toolName, data: 'executeToolStream not found', elapsedMs: 0 };
			return;
		}

		const stream = callFn.call(client, _toProtoRequest(req));

		// Bridge gRPC event-emitter to async generator via a queue + signal
		const queue: (ToolCallEvent | null)[] = [];
		let done = false;
		let resolver: (() => void) | null = null;

		function notify() { resolver?.(); resolver = null; }

		stream.on('data', (chunk) => {
			queue.push({
				requestId: String(chunk['requestId'] ?? req.requestId),
				eventType: (chunk['eventType'] as ToolCallEvent['eventType']) ?? 'progress',
				toolName:  String(chunk['toolName'] ?? req.toolName),
				data:      String(chunk['data'] ?? ''),
				elapsedMs: Number(chunk['elapsedMs'] ?? 0),
			});
			notify();
		});
		stream.on('end', () => { done = true; queue.push(null); notify(); });
		stream.on('error', (err) => {
			queue.push({ requestId: req.requestId, eventType: 'error', toolName: req.toolName, data: err.message, elapsedMs: 0 });
			done = true;
			queue.push(null);
			notify();
		});

		while (true) {
			while (queue.length > 0) {
				const evt = queue.shift()!;
				if (evt === null) return;
				yield evt;
			}
			if (done) return;
			await new Promise<void>((res) => { resolver = res; });
		}
	}

	/**
	 * List available tools via gRPC ListTools RPC.
	 */
	async listTools(category?: string): Promise<{ tools: ToolDefinition[]; total: number }> {
		const client = await _getGrpcClient();
		if (!client) return { tools: [], total: 0 };

		const raw = await _unary<Record<string, unknown>, Record<string, unknown>>(
			client, 'listTools', { category: category ?? '' }, 5_000,
		);
		if (!raw) return { tools: [], total: 0 };

		const rawTools = Array.isArray(raw['tools'])
			? (raw['tools'] as Record<string, unknown>[])
			: [];
		return {
			tools: rawTools.map(_fromProtoTool),
			total: Number(raw['total'] ?? rawTools.length),
		};
	}

	/**
	 * Health check — true when gRPC is enabled and the channel is reachable.
	 */
	async health(): Promise<{ healthy: boolean; toolCount: number }> {
		if (!ENV.TOOL_GRPC_ENABLED) return { healthy: false, toolCount: 0 };
		try {
			const { tools, total } = await this.listTools();
			return { healthy: true, toolCount: total || tools.length };
		} catch {
			return { healthy: false, toolCount: 0 };
		}
	}
}

// ── Singleton ────────────────────────────────────────────────────────────

let _instance: ToolCallingClient | undefined;

export function getToolCallingClient(): ToolCallingClient {
	if (!_instance) _instance = new ToolCallingClient();
	return _instance;
}
