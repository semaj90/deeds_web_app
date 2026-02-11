import { EventEmitter } from 'events';
import { cpus } from 'os';

/**
 * Context7 Multicore Service
 * Provides multi-worker text processing with legal AI capabilities
 * Optimized for TypeScript strict mode with full type safety
 */

export interface Context7MulticoreConfig {
	workerCount?: number;
	basePort?: number;
	loadBalancerPort?: number;
	enableGPU?: boolean;
	enableGoLlama?: boolean;
	enableLegalBert?: boolean;
	maxConcurrentTasks?: number;
	enableMCP?: boolean;
}

export interface WorkerInfo {
	id: string;
	port: number;
	status: 'initializing' | 'healthy' | 'busy' | 'error';
	lastHealth: Date;
	tasksProcessed: number;
	currentLoad: number;
	capabilities: string[];
}

export interface ProcessingTask {
	id: string;
	type:
		| 'tokenize'
		| 'semantic_analysis'
		| 'legal_classification'
		| 'tensor_parse'
		| 'json_parse'
		| 'recommendation';
	data: Record<string, unknown>;
	priority: 'low' | 'medium' | 'high' | 'critical';
	createdAt: Date;
	workerId?: string;
	status: 'queued' | 'processing' | 'completed' | 'failed';
	result?: unknown;
	error?: string;
}

export interface LoadBalancerStatus {
	totalWorkers: number;
	healthyWorkers: number;
	totalRequests: number;
	requestsPerSecond: number;
	averageResponseTime: number;
	strategy: string;
	systemLoad: number;
}

export interface TensorData {
	shape: number[];
	dtype: 'float32' | 'float64' | 'int32' | 'int64';
	data: number[];
	metadata?: Record<string, unknown>;
}

export interface JSONParsingResult {
	valid: boolean;
	data?: unknown;
	error?: string;
	schema?: string;
	warnings?: number;
}

export interface RecommendationRequest {
	context: string;
	errorType?: string;
	codeSnippet?: string;
	stackTrace?: string;
	priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface RecommendationResult {
	recommendations: Array<unknown>;
	context7Insights: string[];
	relatedErrors: string[];
	bestPractices: string[];
}

// Typed fetch function
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Mock EventEmitter for environments without Node.js events module
 */
class MockEventEmitter {
	private listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

	on(event: string, listener: (...args: unknown[]) => void): this {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		this.listeners.get(event)!.push(listener);
		return this;
	}

	emit(event: string, ...args: unknown[]): boolean {
		const eventListeners = this.listeners.get(event);
		if (!eventListeners) return false;
		eventListeners.forEach((listener) => listener(...args));
		return true;
	}

	removeAllListeners(): this {
		this.listeners.clear();
		return this;
	}
}

// Use real EventEmitter in Node.js, mock otherwise
const EventEmitterBase: typeof MockEventEmitter =
	typeof EventEmitter !== 'undefined' ? (EventEmitter as unknown as typeof MockEventEmitter) : MockEventEmitter;

export class Context7MulticoreService extends EventEmitterBase {
	private config: Required<Context7MulticoreConfig>;
	private workers: Map<string, WorkerInfo> = new Map();
	private taskQueue: ProcessingTask[] = [];
	private activeTasks: Map<string, ProcessingTask> = new Map();
	private loadBalancerHealth: LoadBalancerStatus | null = null;
	private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
	private taskProcessorInterval: ReturnType<typeof setInterval> | null = null;
	private metrics = {
		totalTasks: 0,
		completedTasks: 0,
		failedTasks: 0,
		averageProcessingTime: 0,
		systemUptime: 0
	};

	constructor(config: Context7MulticoreConfig = {}) {
		super();

		this.config = {
			workerCount: config.workerCount ?? Math.min(8, cpus().length),
			basePort: config.basePort ?? 4100,
			loadBalancerPort: config.loadBalancerPort ?? 8099,
			enableGPU: config.enableGPU ?? true,
			enableGoLlama: config.enableGoLlama ?? true,
			enableLegalBert: config.enableLegalBert ?? true,
			maxConcurrentTasks: config.maxConcurrentTasks ?? 50,
			enableMCP: config.enableMCP ?? true
		};

		// Defer full initialization so constructor remains sync-friendly
		void this.initialize();
	}

	private async initialize(): Promise<void> {
		try {
			await this.discoverWorkers();
			this.startHealthMonitoring();
			this.startTaskProcessor();
			await this.checkLoadBalancer();
			this.emit('initialized', { workerCount: this.workers.size });
		} catch (e: unknown) {
			console.warn('Context7MulticoreService initialization warning:', e);
		}
	}

	private async discoverWorkers(): Promise<void> {
		const discoveries: Promise<boolean>[] = [];

		for (let i = 0; i < this.config.workerCount; i++) {
			const port = this.config.basePort + i;
			const workerId = `worker_${i + 1}`;
			discoveries.push(this.checkWorker(workerId, port));
		}

		const results = await Promise.allSettled(discoveries);

		results.forEach((result, index) => {
			if (result.status === 'fulfilled' && result.value) {
				const workerId = `worker_${index + 1}`;
				const port = this.config.basePort + index;
				this.workers.set(workerId, {
					id: workerId,
					port,
					status: 'healthy',
					lastHealth: new Date(),
					tasksProcessed: 0,
					currentLoad: 0,
					capabilities: this.getWorkerCapabilities()
				});
			}
		});
	}

	private async checkWorker(workerId: string, port: number): Promise<boolean> {
		const url = `http://localhost:${port}/health`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2000);

		try {
			const fetchFn: FetchFn =
				(globalThis as unknown as { fetch?: FetchFn }).fetch ??
				((await import('node-fetch')).default as unknown as FetchFn);

			const res = await fetchFn(url, {
				method: 'GET',
				signal: controller.signal
			});

			clearTimeout(timeout);
			return res.ok;
		} catch (e: unknown) {
			clearTimeout(timeout);
			return false;
		}
	}

	private getWorkerCapabilities(): string[] {
		const capabilities = ['tokenize', 'semantic_analysis'];

		if (this.config.enableLegalBert) {
			capabilities.push('legal_classification', 'legal_ner', 'legal_sentiment');
		}

		if (this.config.enableGoLlama) {
			capabilities.push('llm_processing', 'text_generation');
		}

		if (this.config.enableGPU) {
			capabilities.push('gpu_acceleration', 'tensor_processing');
		}

		capabilities.push('json_parsing', 'recommendation_generation');
		return capabilities;
	}

	private startHealthMonitoring(): void {
		if (this.healthCheckInterval) return;

		this.healthCheckInterval = setInterval(() => {
			void this.performHealthChecks();
		}, 10000);
	}

	private async performHealthChecks(): Promise<void> {
		const healthPromises = Array.from(this.workers.entries()).map(
			async ([workerId, worker]) => {
				const isHealthy = await this.checkWorker(workerId, worker.port);

				if (isHealthy) {
					worker.status = worker.currentLoad > 0.8 ? 'busy' : 'healthy';
					worker.lastHealth = new Date();
				} else {
					worker.status = 'error';
				}

				return { workerId, healthy: isHealthy };
			}
		);

		const results = await Promise.allSettled(healthPromises);

		let healthyCount = 0;
		for (const r of results) {
			if (r.status === 'fulfilled' && r.value?.healthy) {
				healthyCount++;
			}
		}

		this.emit('health_check_completed', {
			total: this.workers.size,
			healthy: healthyCount,
			timestamp: new Date()
		});
	}

	private async checkLoadBalancer(): Promise<void> {
		this.loadBalancerHealth = null;
	}

	private startTaskProcessor(): void {
		if (this.taskProcessorInterval) return;

		this.taskProcessorInterval = setInterval(() => {
			void this.processQueuedTasks();
		}, 1000);
	}

	private async processQueuedTasks(): Promise<void> {
		if (
			this.taskQueue.length === 0 ||
			this.activeTasks.size >= this.config.maxConcurrentTasks
		)
			return;

		const priorityOrder: Record<string, number> = {
			critical: 4,
			high: 3,
			medium: 2,
			low: 1
		};

		this.taskQueue.sort((a, b) => {
			const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
			if (priorityDiff !== 0) return priorityDiff;
			return a.createdAt.getTime() - b.createdAt.getTime();
		});

		const availableWorkers = Array.from(this.workers.values()).filter(
			(w) => w.status === 'healthy' && w.currentLoad < 0.8
		);

		if (availableWorkers.length === 0) return;

		const tasksToProcess = Math.min(
			this.taskQueue.length,
			availableWorkers.length,
			this.config.maxConcurrentTasks - this.activeTasks.size
		);

		for (let i = 0; i < tasksToProcess; i++) {
			const task = this.taskQueue.shift();
			if (!task) break;

			const worker = this.selectBestWorker(task, availableWorkers);
			if (worker) {
				void this.assignTaskToWorker(task, worker);
			} else {
				this.taskQueue.unshift(task);
				break;
			}
		}
	}

	private selectBestWorker(
		task: ProcessingTask,
		availableWorkers: WorkerInfo[]
	): WorkerInfo | null {
		const capableWorkers = availableWorkers.filter((worker) =>
			this.workerCanHandleTask(worker, task)
		);

		if (capableWorkers.length === 0) return null;

		return capableWorkers.reduce((best, current) =>
			current.currentLoad < best.currentLoad ? current : best
		);
	}

	private workerCanHandleTask(worker: WorkerInfo, task: ProcessingTask): boolean {
		const requiredCapabilities = this.getRequiredCapabilities(task.type);
		return requiredCapabilities.every((cap) => worker.capabilities.includes(cap));
	}

	private getRequiredCapabilities(taskType: ProcessingTask['type']): string[] {
		switch (taskType) {
			case 'tokenize':
				return ['tokenize'];
			case 'semantic_analysis':
				return ['semantic_analysis'];
			case 'legal_classification':
				return ['legal_classification'];
			case 'tensor_parse':
				return ['tensor_processing'];
			case 'json_parse':
				return ['json_parsing'];
			case 'recommendation':
				return ['recommendation_generation'];
			default:
				return [];
		}
	}

	private async assignTaskToWorker(task: ProcessingTask, worker: WorkerInfo): Promise<void> {
		task.status = 'processing';
		task.workerId = worker.id;
		this.activeTasks.set(task.id, task);
		worker.currentLoad = Math.min(1, worker.currentLoad + 0.2);

		try {
			const result = await this.executeTaskOnWorker(task, worker);
			task.status = 'completed';
			task.result = result;
			this.metrics.completedTasks++;
			this.emit('task_completed', { task, result });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
			task.status = 'failed';
			task.error = message;
			this.metrics.failedTasks++;
			this.emit('task_failed', { task, error: task.error });
		} finally {
			this.activeTasks.delete(task.id);
			worker.currentLoad = Math.max(0, worker.currentLoad - 0.2);
			worker.tasksProcessed++;
		}
	}

	private async executeTaskOnWorker(task: ProcessingTask, worker: WorkerInfo): Promise<unknown> {
		const endpointPath = this.getWorkerEndpoint(task.type);
		const url = `http://localhost:${worker.port}${endpointPath}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);

		try {
			const fetchFn: FetchFn =
				(globalThis as unknown as { fetch?: FetchFn }).fetch ??
				((await import('node-fetch')).default as unknown as FetchFn);

			const res = await fetchFn(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					taskId: task.id,
					...task.data
				}),
				signal: controller.signal
			});

			clearTimeout(timeout);

			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(`Worker responded with status ${res.status}: ${text}`);
			}

			const contentType = res.headers.get?.('content-type') ?? '';
			if (contentType.includes('application/json')) {
				return await res.json();
			}

			return await res.text();
		} catch (err: unknown) {
			clearTimeout(timeout);
			if (err instanceof Error) throw err;
			throw new Error(String(err ?? 'Unknown error'));
		}
	}

	private getWorkerEndpoint(taskType: ProcessingTask['type']): string {
		switch (taskType) {
			case 'tokenize':
				return '/tokenize';
			case 'semantic_analysis':
				return '/semantic-analysis';
			case 'legal_classification':
				return '/legal-bert';
			case 'tensor_parse':
				return '/tensor-parse';
			case 'json_parse':
				return '/json-parse';
			case 'recommendation':
				return '/recommendation';
			default:
				throw new Error(`Unknown task type: ${taskType}`);
		}
	}

	// Public API Methods

	async processText(
		text: string,
		type: 'tokenize' | 'semantic_analysis' | 'legal_classification' = 'tokenize',
		priority: ProcessingTask['priority'] = 'medium'
	): Promise<ProcessingTask> {
		const task: ProcessingTask = {
			id: this.generateTaskId(),
			type,
			data: { text },
			priority,
			createdAt: new Date(),
			status: 'queued'
		};

		this.taskQueue.push(task);
		this.metrics.totalTasks++;
		this.emit('task_queued', { task });
		return task;
	}

	async parseJSON(
		jsonString: string,
		schema?: string,
		priority: ProcessingTask['priority'] = 'medium'
	): Promise<ProcessingTask> {
		const task: ProcessingTask = {
			id: this.generateTaskId(),
			type: 'json_parse',
			data: { jsonString, schema },
			priority,
			createdAt: new Date(),
			status: 'queued'
		};

		this.taskQueue.push(task);
		this.metrics.totalTasks++;
		return task;
	}

	async parseTensor(
		tensorData: TensorData,
		priority: ProcessingTask['priority'] = 'medium'
	): Promise<ProcessingTask> {
		const task: ProcessingTask = {
			id: this.generateTaskId(),
			type: 'tensor_parse',
			data: tensorData as unknown as Record<string, unknown>,
			priority,
			createdAt: new Date(),
			status: 'queued'
		};

		this.taskQueue.push(task);
		this.metrics.totalTasks++;
		return task;
	}

	async generateRecommendations(
		request: RecommendationRequest,
		priority?: ProcessingTask['priority']
	): Promise<ProcessingTask> {
		const task: ProcessingTask = {
			id: this.generateTaskId(),
			type: 'recommendation',
			data: request as unknown as Record<string, unknown>,
			priority: priority ?? request.priority,
			createdAt: new Date(),
			status: 'queued'
		};

		this.taskQueue.push(task);
		this.metrics.totalTasks++;
		return task;
	}

	async waitForTask(
		taskId: string,
		timeoutMs: number = 30000
	): Promise<{ status: ProcessingTask['status']; result?: unknown; error?: string }> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeoutMs) {
			const activeTask = this.activeTasks.get(taskId);
			if (activeTask) {
				if (activeTask.status === 'completed') {
					return { status: 'completed', result: activeTask.result };
				}
				if (activeTask.status === 'failed') {
					return { status: 'failed', error: activeTask.error };
				}
			}

			// Check if task is still queued
			const queuedTask = this.taskQueue.find((t) => t.id === taskId);
			if (!queuedTask && !activeTask) {
				return { status: 'failed', error: 'Task not found' };
			}

			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		return { status: 'failed', error: 'Task timeout' };
	}

	generateTaskId(): string {
		return `task_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
	}

	getSystemStatus(): {
		workers: WorkerInfo[];
		queued: number;
		active: number;
		metrics: typeof this.metrics;
	} {
		return {
			workers: Array.from(this.workers.values()),
			queued: this.taskQueue.length,
			active: this.activeTasks.size,
			metrics: this.metrics
		};
	}

	getWorkers(): WorkerInfo[] {
		return Array.from(this.workers.values());
	}

	stop(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
			this.healthCheckInterval = null;
		}

		if (this.taskProcessorInterval) {
			clearInterval(this.taskProcessorInterval);
			this.taskProcessorInterval = null;
		}
	}
}

// Singleton instance
let instance: Context7MulticoreService | null = null;

export function getContext7MulticoreService(
	config?: Context7MulticoreConfig
): Context7MulticoreService {
	if (!instance) {
		instance = new Context7MulticoreService(config ?? {});
	}
	return instance;
}

export default Context7MulticoreService;
