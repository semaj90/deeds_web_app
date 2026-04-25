/**
 * RabbitMQ Service Worker
 *
 * Thin orchestrator that initializes the RabbitMQ manager and provides
 * health/stats APIs. All consumer logic lives in rabbitmq-manager-fixed.ts.
 *
 * Usage:
 *   const worker = RabbitMQServiceWorker.getInstance();
 *   await worker.start();
 *   const health = await worker.healthCheck();
 *   await worker.stop();
 */

const QUEUE_NAMES = {
	CACHE_INVALIDATE: 'cache.invalidate',
	DOCUMENT_EMBED: 'document.embed',
	EVIDENCE_PROCESS: 'evidence.process',
	VECTOR_INDEX: 'vector.index',
	CHAT_CONTEXT: 'chat.context',
	ANALYTICS_TRACK: 'analytics.track',
	CODEBASE_INDEX: 'codebase.index'
} as const;

export interface ServiceWorkerConfig {
	enableLogging?: boolean;
	maxRetries?: number;
	processingTimeout?: number;
}

export interface WorkerHealth {
	status: 'healthy' | 'unhealthy' | 'stopped';
	uptime: number;
	isRunning: boolean;
	queues: string[];
	stats: {
		messagesProcessed: number;
		errors: number;
		startTime: number;
		avgProcessingTime: number;
	};
}

type MessageHandler = (message: unknown, originalMessage?: unknown) => Promise<void> | void;

export class RabbitMQServiceWorker {
	private static instance: RabbitMQServiceWorker | null = null;
	private config: Required<ServiceWorkerConfig>;
	private isRunning = false;
	private stats = {
		messagesProcessed: 0,
		errors: 0,
		startTime: 0,
		avgProcessingTime: 0
	};

	constructor(config: ServiceWorkerConfig = {}) {
		this.config = {
			enableLogging: config.enableLogging ?? true,
			maxRetries: config.maxRetries ?? 3,
			processingTimeout: config.processingTimeout ?? 30000
		};
	}

	static getInstance(config?: ServiceWorkerConfig): RabbitMQServiceWorker {
		if (!RabbitMQServiceWorker.instance) {
			RabbitMQServiceWorker.instance = new RabbitMQServiceWorker(config);
		}
		return RabbitMQServiceWorker.instance;
	}

	private log(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
		if (!this.config.enableLogging) return;
		const prefix = '[RabbitMQ Worker]';
		if (type === 'error') {
			console.error(`${prefix} ERROR: ${message}`);
		} else if (type === 'success') {
			console.log(`${prefix} OK: ${message}`);
		} else {
			console.log(`${prefix} ${message}`);
		}
	}

	async start(): Promise<void> {
		if (this.isRunning) {
			this.log('Worker already running');
			return;
		}

		try {
			this.log('Starting RabbitMQ Service Worker...');
			const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
			const ok = await rabbitmq.initialize();

			if (!ok) {
				throw new Error('RabbitMQ manager initialization failed');
			}

			this.isRunning = true;
			this.stats.startTime = Date.now();
			this.log('RabbitMQ Service Worker started — 7 consumers active', 'success');
		} catch (error) {
			this.isRunning = false;
			const msg = error instanceof Error ? error.message : String(error);
			this.log(`Failed to start worker: ${msg}`, 'error');
			throw error;
		}
	}

	async stop(): Promise<void> {
		if (!this.isRunning) return;

		try {
			const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
			await rabbitmq.close();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.log(`Error during shutdown: ${msg}`, 'error');
		}

		this.isRunning = false;
		this.log('RabbitMQ Service Worker stopped', 'success');
	}

	async healthCheck(): Promise<WorkerHealth> {
		let rabbitOk = false;
		try {
			const { healthCheck } = await import('$lib/server/rabbitmq.js');
			rabbitOk = await healthCheck();
		} catch {
			// RabbitMQ not reachable
		}

		return {
			status: this.isRunning && rabbitOk ? 'healthy' : this.isRunning ? 'unhealthy' : 'stopped',
			uptime: this.isRunning ? Date.now() - this.stats.startTime : 0,
			isRunning: this.isRunning,
			queues: Object.values(QUEUE_NAMES),
			stats: { ...this.stats }
		};
	}

	async publishMessage(queueName: string, message: Record<string, unknown>): Promise<boolean> {
		try {
			const { publishToQueue } = await import('$lib/server/rabbitmq.js');
			return await publishToQueue(queueName, {
				...message,
				publishedAt: Date.now()
			});
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			this.log(`publishMessage error for ${queueName}: ${msg}`, 'error');
			return false;
		}
	}

	getStats() {
		return {
			...this.stats,
			uptime: this.isRunning ? Date.now() - this.stats.startTime : 0,
			isRunning: this.isRunning
		};
	}
}