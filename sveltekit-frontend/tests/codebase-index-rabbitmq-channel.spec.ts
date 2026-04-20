// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockChunkFiles,
	mockIndexChunksIncremental,
	mockReaddir,
	mockAmqpConnect,
} = vi.hoisted(() => ({
	mockChunkFiles: vi.fn(),
	mockIndexChunksIncremental: vi.fn(),
	mockReaddir: vi.fn(),
	mockAmqpConnect: vi.fn(),
}));

vi.mock('$lib/server/indexer/ast-chunker.js', () => ({
	chunkFiles: (...args: unknown[]) => mockChunkFiles(...args),
}));

vi.mock('$lib/server/indexer/dual-embedder.js', () => ({
	indexChunksIncremental: (...args: unknown[]) => mockIndexChunksIncremental(...args),
}));

vi.mock('fs/promises', () => ({
	readdir: (...args: unknown[]) => mockReaddir(...args),
}));

vi.mock('amqplib', () => ({
	default: {
		connect: (...args: unknown[]) => mockAmqpConnect(...args),
	},
	connect: (...args: unknown[]) => mockAmqpConnect(...args),
}));

vi.mock('../src/lib/server/redis.js', () => ({
	getRedis: vi.fn(() => null),
}));

vi.mock('../src/lib/server/db/client.js', () => ({
	db: {},
}));

function createChannel() {
	return {
		assertExchange: vi.fn(),
		assertQueue: vi.fn(),
		bindQueue: vi.fn(),
		consume: vi.fn(),
		publish: vi.fn(),
		ack: vi.fn(),
		nack: vi.fn(),
		prefetch: vi.fn(),
		close: vi.fn(),
		on: vi.fn().mockReturnThis(),
	};
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mockChunkFiles.mockReturnValue([]);
	mockReaddir.mockResolvedValue([]);
	mockIndexChunksIncremental.mockResolvedValue({
		chunksProcessed: 0,
		skippedExisting: 0,
		embeddingsGenerated: 0,
		storedInQdrant: 0,
		failed: 0,
		durationMs: 1,
	});
	mockAmqpConnect.mockReset();
});

const {
	mockTraceQueue,
	mockTraceLLM,
} = vi.hoisted(() => ({
	mockTraceQueue: vi.fn(async (_op: string, _queue: string, _meta: unknown, fn: () => Promise<unknown>) => fn()),
	mockTraceLLM: vi.fn(async (_name: string, _meta: unknown, fn: (gen: { end: () => void }) => Promise<unknown>) =>
		fn({ end: () => {} }),
	),
}));

vi.mock('$lib/server/observability/langfuse.js', () => ({
	traceQueue: (a: string, b: string, c: unknown, fn: () => Promise<unknown>) => mockTraceQueue(a, b, c, fn),
	traceLLM: (a: string, b: unknown, fn: (gen: { end: () => void }) => Promise<unknown>) => mockTraceLLM(a, b, fn),
}));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		OLLAMA_BASE_URL: 'http://localhost:11434',
		OLLAMA_CHAT_MODEL: 'gemma4-legal',
		QDRANT_URL: 'http://localhost:6333',
	},
}));

vi.mock('$lib/server/ace/context-assembler.js', () => ({
	assembleACEContext: vi.fn(async () => ({
		ragChunks: [],
		kagNeighbors: [],
		persona: 'neutral',
		codebaseContext: null,
		evidenceMetadata: null,
		glossaryMatches: null,
		caseContext: null,
		webSearchContext: null,
	})),
	buildACEPromptCached: vi.fn(async () => ({
		systemPrompt: 'You are a legal assistant.',
		contextWindow: 'Context: test',
	})),
}));

vi.mock('$lib/server/retrieval/document-dag.js', () => ({
	orderByDependency: vi.fn(() => ({ ordered: [] })),
	extractCitationRefs: vi.fn(() => new Set()),
}));

vi.mock('$lib/server/ollama.js', () => ({
	ollamaFetch: vi.fn(async () => ({
		ok: true,
		json: async () => ({
			message: { content: 'Legal analysis result.' },
			eval_count: 42,
			prompt_eval_count: 10,
		}),
	})),
}));

vi.mock('$lib/server/observability/inference-log.js', () => ({
	logLLMInference: vi.fn(),
}));

vi.mock('$lib/server/ace/self-prompt.js', () => ({
	evaluateResponse: vi.fn(async () => ({
		quality: 0.85,
		hallucination: 0.1,
		relevance: 0.9,
	})),
}));

describe('RabbitMQ codebase index consumer', () => {
	it('skips ack when the consumer channel is recycled mid-run', async () => {
		const gate = createDeferred();
		mockIndexChunksIncremental.mockImplementation(async () => {
			await gate.promise;
			return {
				chunksProcessed: 0,
				skippedExisting: 0,
				embeddingsGenerated: 0,
				storedInQdrant: 0,
				failed: 0,
				durationMs: 1,
			};
		});

		const { RabbitMQManager } = await import('../src/lib/server/queue/rabbitmq-manager-fixed.js');
		const manager = new RabbitMQManager();
		const originalChannel = createChannel();
		const replacementChannel = createChannel();

		const redisState = new Map<string, string>([
			['codebase:index:latest:lib', 'job-1'],
			['codebase:index:job-1', JSON.stringify({ jobId: 'job-1', scope: 'lib', status: 'pending' })],
		]);

		manager['channel'] = originalChannel as never;
		manager['redisService'] = {
			get: vi.fn(async (key: string) => redisState.get(key) ?? null),
			set: vi.fn(async (key: string, value: string) => {
				redisState.set(key, value);
				return 'OK';
			}),
		};

		const msg = {
			content: Buffer.from(JSON.stringify({ scope: 'lib' })),
			fields: { deliveryTag: 1 },
			properties: {},
		};

		const runPromise = manager['handleCodebaseIndex'](msg as never);
		manager['channel'] = replacementChannel as never;
		gate.resolve();
		await runPromise;

		expect(originalChannel.ack).not.toHaveBeenCalled();
		expect(replacementChannel.ack).not.toHaveBeenCalled();
		expect(originalChannel.nack).not.toHaveBeenCalled();
	});

	it('acks on the snapshot channel when processing completes normally', async () => {
		mockReaddir.mockResolvedValue([]);
		mockChunkFiles.mockReturnValue([]);
		mockIndexChunksIncremental.mockResolvedValue({
			chunksProcessed: 0, skippedExisting: 0, embeddingsGenerated: 0,
			storedInQdrant: 0, failed: 0, durationMs: 1,
		});

		const { RabbitMQManager } = await import('../src/lib/server/queue/rabbitmq-manager-fixed.js');
		const manager = new RabbitMQManager();
		const channel = createChannel();

		manager['channel'] = channel as never;
		manager['redisService'] = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => 'OK'),
		};

		const msg = {
			content: Buffer.from(JSON.stringify({ scope: 'lib' })),
			fields: { deliveryTag: 1 },
			properties: {},
		};

		await manager['handleCodebaseIndex'](msg as never);

		// Channel was NOT recycled, so ack should fire on the snapshot
		expect(channel.ack).toHaveBeenCalledTimes(1);
		expect(channel.nack).not.toHaveBeenCalled();
	});

	it('initializes successfully on an empty broker without requiring deleteQueue calls', async () => {
		const channel = createChannel();
		const connection = {
			createChannel: vi.fn().mockResolvedValue(channel),
			close: vi.fn(),
			on: vi.fn().mockReturnThis(),
		};
		mockAmqpConnect.mockResolvedValue(connection);

		const { RabbitMQManager } = await import('../src/lib/server/queue/rabbitmq-manager-fixed.js');
		const manager = new RabbitMQManager();

		await expect(manager.initialize()).resolves.toBe(true);
		expect(mockAmqpConnect).toHaveBeenCalled();
		expect(connection.createChannel).toHaveBeenCalledTimes(1);
		expect(channel.assertQueue).toHaveBeenCalledWith('cache.invalidate', expect.any(Object));
		expect(channel.consume).toHaveBeenCalled();
	});
});

describe('RabbitMQ synthesis consumer — stale channel guard', () => {
	it('skips ack when channel is recycled during LLM inference', async () => {
		const gate = createDeferred();

		// Make traceLLM block on the gate to simulate long LLM call
		mockTraceLLM.mockImplementation(async (_name: string, _meta: unknown, fn: (gen: { end: () => void }) => Promise<unknown>) => {
			await gate.promise;
			return fn({ end: () => {} });
		});

		const { RabbitMQManager } = await import('../src/lib/server/queue/rabbitmq-manager-fixed.js');
		const manager = new RabbitMQManager();
		const originalChannel = createChannel();
		const replacementChannel = createChannel();

		manager['channel'] = originalChannel as never;
		manager['redisService'] = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => 'OK'),
		};
		manager['exchanges'] = { document_processing: 'document_processing' } as never;

		const msg = {
			content: Buffer.from(JSON.stringify({
				synthesisId: 'synth-1',
				query: 'What is hearsay evidence?',
				userId: 'user-1',
			})),
			fields: { deliveryTag: 1 },
			properties: {},
		};

		const runPromise = manager['handleSynthesisGenerate'](msg as never);

		// Simulate channel recycling mid-inference
		manager['channel'] = replacementChannel as never;
		gate.resolve();
		await runPromise;

		// Neither channel should have been acked — stale guard skipped it
		expect(originalChannel.ack).not.toHaveBeenCalled();
		expect(replacementChannel.ack).not.toHaveBeenCalled();
		expect(originalChannel.nack).not.toHaveBeenCalled();
	});

	it('acks normally when channel is stable throughout synthesis', async () => {
		const { RabbitMQManager } = await import('../src/lib/server/queue/rabbitmq-manager-fixed.js');
		const manager = new RabbitMQManager();
		const channel = createChannel();

		manager['channel'] = channel as never;
		manager['redisService'] = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => 'OK'),
		};
		manager['exchanges'] = { document_processing: 'document_processing' } as never;

		const msg = {
			content: Buffer.from(JSON.stringify({
				synthesisId: 'synth-2',
				query: 'What is hearsay?',
				userId: 'user-1',
			})),
			fields: { deliveryTag: 1 },
			properties: {},
		};

		await manager['handleSynthesisGenerate'](msg as never);

		expect(channel.ack).toHaveBeenCalledTimes(1);
		expect(channel.nack).not.toHaveBeenCalled();
	});
});

describe('RabbitMQ ACE evaluate consumer — stale channel guard', () => {
	it('skips ack when channel is recycled during evaluation', async () => {
		const gate = createDeferred();

		// Make traceQueue block on the gate to simulate long ACE eval
		mockTraceQueue.mockImplementation(async (_op: string, _queue: string, _meta: unknown, fn: () => Promise<unknown>) => {
			await gate.promise;
			return fn();
		});

		const { RabbitMQManager } = await import('../src/lib/server/queue/rabbitmq-manager-fixed.js');
		const manager = new RabbitMQManager();
		const originalChannel = createChannel();
		const replacementChannel = createChannel();

		manager['channel'] = originalChannel as never;
		manager['redisService'] = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => 'OK'),
		};

		const msg = {
			content: Buffer.from(JSON.stringify({
				responseId: 'resp-1',
				query: 'What is hearsay?',
				response: 'Hearsay is an out-of-court statement.',
			})),
			fields: { deliveryTag: 1 },
			properties: {},
		};

		const runPromise = manager['handleACEEvaluate'](msg as never);

		// Simulate channel recycling mid-evaluation
		manager['channel'] = replacementChannel as never;
		gate.resolve();
		await runPromise;

		expect(originalChannel.ack).not.toHaveBeenCalled();
		expect(replacementChannel.ack).not.toHaveBeenCalled();
	});
});

describe('RabbitMQ error-path stale channel guard', () => {
	it('skips retryOrDLQ when channel is recycled before error handling', async () => {
		// Force indexChunksIncremental to throw AFTER the gate releases
		const gate = createDeferred();
		mockIndexChunksIncremental.mockImplementation(async () => {
			await gate.promise;
			throw new Error('Simulated embedding failure');
		});

		const { RabbitMQManager } = await import('../src/lib/server/queue/rabbitmq-manager-fixed.js');
		const manager = new RabbitMQManager();
		const originalChannel = createChannel();
		const replacementChannel = createChannel();

		manager['channel'] = originalChannel as never;
		manager['redisService'] = {
			get: vi.fn(async (key: string) => {
				if (key === 'codebase:index:latest:lib') return 'job-err';
				if (key === 'codebase:index:job-err') return JSON.stringify({ jobId: 'job-err', scope: 'lib', status: 'pending' });
				return null;
			}),
			set: vi.fn(async () => 'OK'),
		};

		const msg = {
			content: Buffer.from(JSON.stringify({ scope: 'lib' })),
			fields: { deliveryTag: 1 },
			properties: { headers: {} },
		};

		const runPromise = manager['handleCodebaseIndex'](msg as never);

		// Recycle channel while embedding is in progress
		manager['channel'] = replacementChannel as never;
		gate.resolve();
		await runPromise;

		// Error path: neither channel should have been nacked/acked
		expect(originalChannel.ack).not.toHaveBeenCalled();
		expect(originalChannel.nack).not.toHaveBeenCalled();
		expect(replacementChannel.ack).not.toHaveBeenCalled();
		expect(replacementChannel.nack).not.toHaveBeenCalled();
	});

	it('retries via DLQ on the snapshot channel when error occurs normally', async () => {
		mockIndexChunksIncremental.mockRejectedValue(new Error('Simulated failure'));

		const { RabbitMQManager } = await import('../src/lib/server/queue/rabbitmq-manager-fixed.js');
		const manager = new RabbitMQManager();
		const channel = createChannel();

		manager['channel'] = channel as never;
		manager['redisService'] = {
			get: vi.fn(async () => null),
			set: vi.fn(async () => 'OK'),
		};

		const msg = {
			content: Buffer.from(JSON.stringify({ scope: 'lib' })),
			fields: { deliveryTag: 1 },
			properties: { headers: { 'x-retry-count': 5 } },
		};

		await manager['handleCodebaseIndex'](msg as never);

		// Channel was NOT recycled, so nack should fire (DLQ after max retries)
		expect(channel.nack).toHaveBeenCalledTimes(1);
		expect(channel.ack).not.toHaveBeenCalled();
	});
});