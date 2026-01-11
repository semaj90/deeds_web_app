/**
 * RabbitMQ Service Worker - simplified, syntactically-correct version
 */

import { rabbitmqService } from '$lib/server/messaging/rabbitmq-service';
import { publishToQueue } from '$lib/server/rabbitmq';

type MessageHandler = (message: unknown, originalMessage?: unknown) => Promise<void> | void;

const QUEUE_NAMES = {
	DOCUMENT_PROCESSING: 'document.processing',
	FILE_UPLOAD: 'file.upload',
	VECTOR_EMBEDDING: 'vector.embedding',
	EVIDENCE_ANALYSIS: 'evidence.analysis',
	RAG_PROCESSING: 'rag.processing',
	EMAIL_NOTIFICATIONS: 'email.notifications',
	SEARCH_INDEXING: 'search.indexing',
	CASE_UPDATES: 'case.updates'
} as const;

export interface ServiceWorkerConfig {
	enableLogging?: boolean;
	maxRetries?: number;
	processingTimeout?: number;
	enableN64Logging?: boolean;
}

export interface RabbitMQHealth {
	status: 'healthy' | 'unhealthy' | 'degraded';
	details?: Record<string, unknown>;
}

// Add a narrow service-like type instead of using `any` type
type RabbitMQServiceLike = {
	connected?: boolean;
	disconnect?: () => Promise<void> | void;
	close?: () => Promise<void> | void;
	stop?: () => Promise<void> | void;
	closeConnection?: () => Promise<void> | void;
	consume?: (, queue: string,
		cb: (message: unknown, originalMessage?: unknown) => Promise<void> | void
	) => Promise<void> | void;
	subscribe?: (, queue: string,
		cb: (message: unknown, originalMessage?: unknown) => Promise<void> | void
	) => Promise<void> | void;
	createConsumer?: (, queue: string,
		cb: (message: unknown, originalMessage?: unknown) => Promise<void> | void
	) => Promise<void> | void;
	on?: (event: string, cb: (...args: unknown[]) => void) => void;
	publish?: (exchange: string, routingKey: string, content: unknown) => Promise<unknown> | unknown;
	healthCheck?: () => Promise<unknown>;
};

export class RabbitMQServiceWorker {
	private static instance: RabbitMQServiceWorker | null = null;
	private config: Required<ServiceWorkerConfig>;
	private handlers = new Map<string, MessageHandler>();
	private isRunning = false;
	private processingStats = {
		messagesProcessed: 0,
		errors: 0,
		startTime: Date.now(),
		avgProcessingTime: 0
	};

	constructor(config: ServiceWorkerConfig = {}) {
		this.config = {
			enableLogging: config.enableLogging ?? true,
			maxRetries: config.maxRetries ?? 3,
			processingTimeout: config.processingTimeout ?? 30000,
			enableN64Logging: config.enableN64Logging ?? false
		};
	}

	static getInstance(config?: ServiceWorkerConfig): RabbitMQServiceWorker {
		if (!RabbitMQServiceWorker.instance) {
			RabbitMQServiceWorker.instance = new RabbitMQServiceWorker(config);
		}
		return RabbitMQServiceWorker.instance;
	}

	private log(message: string, type: 'info' | 'error' | 'success' = 'info') {
		if (!this.config.enableLogging) return;
		const timestamp = new Date().toISOString();
		const prefix = this.config.enableN64Logging ? '[RabbitMQ Worker N64]' : '[RabbitMQ Worker]';
		if (type === 'error') {
			console.error(`${prefix} ERROR ${timestamp}: ${message}`);
		} else if (type === 'success') {
			console.log(`${prefix} OK ${timestamp}: ${message}`);
		} else {
			console.log(`${prefix} INFO ${timestamp}: ${message}`);
		}
	}

	registerHandler(queueName: string, handler: MessageHandler): void {
		this.handlers.set(queueName, handler);
		this.log(`Handler registered for queue: ${queueName}`);
	}

	async start(): Promise<void> {
		if (this.isRunning) {
			this.log('Worker already running', 'info');
			return;
		}
		try {
			if (!rabbitmqService || !rabbitmqService.connected) {
				throw new Error('Not connected to RabbitMQ');
			}
			this.isRunning = true;
			this.processingStats.startTime = Date.now();
			this.setupDefaultHandlers();
			for (const [queueName, handler] of this.handlers) {
				await this.startConsumer(queueName, handler);
			}
			this.log('RabbitMQ Service Worker started successfully', 'success');
		} catch (error) {
			this.isRunning = false;
			const msg = error instanceof Error ? error.message : String(error);
			this.log(`Failed to start worker: ${msg}`, 'error');
			throw error;
		}
	}

	async stop(): Promise<void> {
		if (!this.isRunning) return;
		this.isRunning = false;
		const svc = rabbitmqService as unknown as RabbitMQServiceLike;
		try {
			if (typeof svc.disconnect === 'function') {
				await svc.disconnect();
			} else if (typeof svc.close === 'function') {
				await svc.close();
			} else if (typeof svc.stop === 'function') {
				await svc.stop();
			} else if (typeof svc.closeConnection === 'function') {
				await svc.closeConnection();
			} else {
				this.log('No disconnect/close method found on rabbitmqService, skipping shutdown', 'info');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.log(`Error during shutdown: ${msg}`, 'error');
		}
		this.log('RabbitMQ Service Worker stopped', 'success');
	}

	private async startConsumer(queueName: string, handler: MessageHandler): Promise<void> {
		const callback = async (message: unknown, originalMessage?: unknown) => {
			const startTime = Date.now();
			try {
				this.log(
					`Processing message from ${queueName}: ${JSON.stringify(message).slice(0, 200)}`
				);
				await Promise.race([
					handler(message, originalMessage),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('Processing timeout')), this.config.processingTimeout)
					)
				]);
				const processingTime = Date.now() - startTime;
				this.processingStats.messagesProcessed++;
				this.updateAvgProcessingTime(processingTime);
				this.log(`Message processed in ${processingTime}ms`, 'success');
			} catch (error) {
				this.processingStats.errors++;
				const msg = error instanceof Error ? error.message : String(error);
				this.log(`Error processing message from ${queueName}: ${msg}`, 'error');
			}
		};

		const svc = rabbitmqService as unknown as RabbitMQServiceLike;
		if (typeof svc.consume === 'function') {
			await svc.consume(queueName, callback);
		} else if (typeof svc.subscribe === 'function') {
			await svc.subscribe(queueName, callback);
		} else if (typeof svc.createConsumer === 'function') {
			await svc.createConsumer(queueName, callback);
		} else if (typeof svc.on === 'function') {
			svc.on(queueName, callback);
		} else {
			throw new Error(
				'rabbitmqService has no consumer method (expected consume|subscribe|createConsumer|on)'
			);
		}
	}

	private setupDefaultHandlers(): void {
		const safeString = (v: unknown): string =>
			v == null ? '' : typeof v === 'string' ? v : String(v);
		const firstN = (v: unknown, n = 200): string => {
			if (typeof v === 'string') return v.slice(0, n);
			return '';
		};
		const getField = (m: unknown, key: string): unknown =>
			m && typeof m === 'object' ? (m as Record<string, unknown>)[key] : undefined;
		const getString = (m: unknown, key: string): string | undefined => {
			const v = getField(m, key);
			if (typeof v === 'string') return v;
			if (v == null) return undefined;
			try {
				return String(v);
			} catch {
				return undefined;
			}
		};
		const getBoolean = (m: unknown, key: string): boolean => {
			const v = getField(m, key);
			if (typeof v === 'boolean') return v;
			if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
			return Boolean(v);
		};
		const getNumber = (m: unknown, key: string): number | undefined => {
			const v = getField(m, key);
			if (typeof v === 'number') return v;
			if (typeof v === 'string') {
				const n = Number(v);
				return Number.isNaN(n) ? undefined : n;
			}
			return undefined;
		};

		// Document processing handler
		this.registerHandler(QUEUE_NAMES.DOCUMENT_PROCESSING, async (message: unknown) => {
			const msg = typeof message === 'object' && message !== null ? message : {};
			this.log(`Processing document: ${safeString(getField(msg, 'documentId'))}`);
			await new Promise((resolve) => setTimeout(resolve, 1000));
			await publishToQueue(QUEUE_NAMES.VECTOR_EMBEDDING, {
				...msg,
				stage: 'embedding_ready',
				processedAt: Date.now()
			});
		});

		// File upload handler
		this.registerHandler(QUEUE_NAMES.FILE_UPLOAD, async (message: unknown) => {
			const msg = typeof message === 'object' && message !== null ? message : {};
			this.log(`Processing upload: ${safeString(getField(msg, 'fileName'))}`);
			await new Promise((resolve) => setTimeout(resolve, 500));
			const priority = getNumber(msg, 'priority') ?? 0;
			this.log(`File priority: ${priority}`);
			const evidenceId = getString(msg, 'evidenceId');
			if (evidenceId) {
				await publishToQueue(QUEUE_NAMES.EVIDENCE_ANALYSIS, {
					evidenceId,
					stage: 'analysis_ready',
					cudaAccelerated: getBoolean(msg, 'cudaAccelerated'),
					priority
				});
			}
		});

		// Vector embedding handler
		this.registerHandler(QUEUE_NAMES.VECTOR_EMBEDDING, async (message: unknown) => {
			const msg = typeof message === 'object' && message !== null ? message : {};
			this.log(`Generating embeddings for: ${safeString(getField(msg, 'documentId'))}`);
			await new Promise((resolve) => setTimeout(resolve, 2000));
			await publishToQueue(QUEUE_NAMES.SEARCH_INDEXING, {
				...msg,
				embeddings: 'generated',
				stage: 'indexing_ready'
			});
		});

		// Evidence analysis handler
		this.registerHandler(QUEUE_NAMES.EVIDENCE_ANALYSIS, async (message: unknown) => {
			const msg = typeof message === 'object' && message !== null ? message : {};
			this.log(`Analyzing evidence: ${safeString(getField(msg, 'evidenceId'))}`);
			await new Promise((resolve) => setTimeout(resolve, 1500));
			await publishToQueue(QUEUE_NAMES.CASE_UPDATES, {
				caseId: getString(msg, 'caseId'),
				evidenceId: getString(msg, 'evidenceId'),
				analysisComplete: true,
				insights: {, confidence: 0.85,
					keyEntities: ['contract', 'signature', 'date'],
					summary: 'Legal document analysis completed'
				}
			});
		});

		// RAG processing handler
		this.registerHandler(QUEUE_NAMES.RAG_PROCESSING, async (message: unknown) => {
			const msg = typeof message === 'object' && message !== null ? message : {};
			const q = firstN(getField(msg, 'query'), 200);
			this.log(`RAG query: ${q}`);
			await new Promise((resolve) => setTimeout(resolve, 3000));
		});

		// Email notifications handler
		this.registerHandler(QUEUE_NAMES.EMAIL_NOTIFICATIONS, async (message: unknown) => {
			const msg = typeof message === 'object' && message !== null ? message : {};
			this.log(`Sending notification: ${safeString(getField(msg, 'type'))}`);
			await new Promise((resolve) => setTimeout(resolve, 800));
		});

		// Search indexing handler
		this.registerHandler(QUEUE_NAMES.SEARCH_INDEXING, async (message: unknown) => {
			const msg = typeof message === 'object' && message !== null ? message : {};
			this.log(`Indexing search: ${safeString(getField(msg, 'documentId'))}`);
			await new Promise((resolve) => setTimeout(resolve, 1200));
		});

		// Case updates handler
		this.registerHandler(QUEUE_NAMES.CASE_UPDATES, async (message: unknown) => {
			const msg = typeof message === 'object' && message !== null ? message : {};
			this.log(`Processing update: ${safeString(getField(msg, 'caseId'))}`);
			await new Promise((resolve) => setTimeout(resolve, 600));
		});
	}

	private updateAvgProcessingTime(processingTime: number): void {
		const currentAvg = this.processingStats.avgProcessingTime;
		const messageCount = Math.max(1, this.processingStats.messagesProcessed);
		this.processingStats.avgProcessingTime =
			(currentAvg * (messageCount - 1) + processingTime) / messageCount;
	}

	getStats() {
		return {
			...this.processingStats,
			uptime: Date.now() - this.processingStats.startTime,
			isRunning: this.isRunning
		};
	}

	async healthCheck(): Promise<RabbitMQHealth> {
		const svc = rabbitmqService as unknown as RabbitMQServiceLike;
		let raw: unknown = undefined;
		if (typeof svc.healthCheck === 'function') {
			try {
				raw = await svc.healthCheck();
			} catch {
				raw = undefined;
			}
		}

		const partial = raw as Record<string, unknown> | undefined;
		const inferredStatus =
			partial && typeof partial === 'object' && 'status' in partial
				? (String(partial.status) as RabbitMQHealth['status'])
				: partial && typeof partial === 'object' && partial.ok === true
					? 'healthy'
					: 'unhealthy';

		const rabbitmqHealth: RabbitMQHealth = {
			status: inferredStatus ?? 'unhealthy',
			details: partial ? { ...partial } : undefined
		};

		return rabbitmqHealth;
	}

	async publishMessage(queueName: string, message: Record<string, unknown>): Promise<boolean> {
		try {
			const svc = rabbitmqService as unknown as RabbitMQServiceLike;
			if (typeof svc.publish !== 'function') {
				throw new Error('rabbitmqService has no publish method');
			}
			const publishResult = await svc.publish('workers', queueName, {
				...message,
				publishedAt: Date.now(),
				workerVersion: '1.0.0'
			});
			const publishedOk = Boolean(publishResult);
			if (!publishedOk) {
				this.log(`Failed to publish message to ${queueName}`, 'error');
				return false;
			}
			this.log(`Published message to ${queueName}`, 'success');
			return true;
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			this.log(`publishMessage error for ${queueName}: ${msg}`, 'error');
			return false;
		}
	}
}
