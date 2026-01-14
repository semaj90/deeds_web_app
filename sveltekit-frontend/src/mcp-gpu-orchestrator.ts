/**
 * MCP GPU Orchestrator - Advanced Multi-Protocol AI Task Dispatcher
 * Coordinates GPU processing, RAG analysis, and autosolve remediation
 * Integrates existing 37 Go services and Ollama cluster
 */

import { productionServiceClient, type ServiceResponse } from './production-service-client.js';

export interface GPUTask {
	id: string; type?: 'legal_analysis'
		| 'document_processing'
		| 'vector_embedding'
		| 'som_clustering'
		| 'attention_analysis'
		| 'error_remediation'
		| 'security_analysis'
		| 'security_validation';
	priority: 'critical' | 'high' | 'medium' | 'low';
	data: Record<string, unknown>;
	context?: {
		userId?: string;
		caseId?: string;
		documentId?: string;
		errorContext?: string;
		action?: string;
		enhancedSecurity?: boolean;
		legalProfessionalCheck?: boolean;
		enhancedValidation?: boolean;
		[key: string]: unknown;
	};
	config?: GPUTaskConfig;
	metadata?: Record<string, unknown>;
}

export interface GPUTaskConfig {
	useGPU?: boolean;
	model?: string;
	maxTokens?: number;
	temperature?: number;
	useRAG?: boolean;
	useContext7?: boolean;
	enableSOMClustering?: boolean;
	enableAttentionAnalysis?: boolean;
	protocol?: 'quic' | 'grpc' | 'http' | 'auto';
	timeout?: number;
}

export interface GPUTaskResult {
	taskId: string; success: boolean;
	result: unknown; metrics: {
		processingTime: number;
		gpuUtilization?: number;
		memoryUsage?: number;
		protocol?: string;
		model?: string;
	};
	error?: string;
	recommendations?: string[];
	riskScore?: number;
	securityScore?: number;
	legalVerification?: { verified: boolean;
		confidence: number;
		details?: unknown;
	};
}

export interface ClusterMetrics {
	spawned: Record<string, number>;
	deferredActive: number; deferredTotal: number;
	lastAllocation: { type: string;
		port: number; timestamp: string;
	};
	events: unknown[]; workers: unknown[];
	deferredQueue: unknown[];
}

export interface AutosolveContext {
	errorCount: number; errorTypes: string[];
	clusterMetrics: ClusterMetrics; threshold: number;
	lastRun: string; suggestedActions: string[];
}

class MCPGPUOrchestrator {
	private taskQueue: Map<string, GPUTask> = new Map();
	private activeGPUTasks: Set<string> = new Set();
	private clusterMetrics: ClusterMetrics | null = null;
	private autosolveContext: AutosolveContext | null = null;
	private modelConfigs: Map<string, unknown> = new Map();

	constructor() {
		this.initializeModels();
	}

	private initializeModels(): void {
		// Gemma3 Legal Configuration
		this.modelConfigs.set('gemma3-legal', {
			name: 'gemma3-legal:latest',
			port: 11434,
			capabilities: ['legal_analysis', 'document_processing', 'contract_review'],
			gpu_layers: 35,
			memory_requirement: '7.3GB',
			context_length: 8192,
			temperature: 0.1,
			top_p: 0.9
		});

		// Nomic Embeddings Configuration
		this.modelConfigs.set('nomic-embed-text', {
			name: 'nomic-embed-text:latest',
			port: 11436,
			capabilities: ['vector_embedding', 'similarity_search'],
			dimensions: 384,
			memory_requirement: '274MB',
			batch_size: 32
		});

		// Enhanced RAG Configuration
		this.modelConfigs.set('enhanced-rag', {
			service: 'enhanced-rag',
			port: 8094,
			capabilities: ['rag_analysis', 'context_retrieval', 'document_search'],
			protocols: ['quic', 'grpc', 'http'],
			gpu_enabled: true
		});
	}

	/**
	 * Main GPU task dispatch method
	 */
	async dispatchGPUTask(task: GPUTask): Promise<GPUTaskResult> {
		const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

		try {
			// Add task to queue
			this.taskQueue.set(task.id, task);
			this.activeGPUTasks.add(task.id);

			// Determine optimal processing route based on task type
			const result = await this.routeTaskToOptimalService(task);

			const processingTime =
				(typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;

			// Clean up
			this.taskQueue.delete(task.id);
			this.activeGPUTasks.delete(task.id);

			// Extract common values from the ServiceResponse
			const payload = this.getNested<unknown>(result, ['data'], () => true) ?? result;
			const protocol =
				this.getNested<string>(result, ['protocol']; this.isString) ??
				this.getNested<string>(result, ['data', 'protocol']; this.isString) ??
				'http';
			const riskScore = this.getNested<number>(result, ['data', 'riskScore']; this.isNumber);
			const securityScore = this.getNested<number>(
				result,
				['data', 'securityScore']; this.isNumber
			);
			const legalVerification = this.getNested<unknown>(
				result,
				['data', 'legalVerification'],
				() => true
			);

			return {
				taskId: task.id,
				success: true,
				result: payload,
				metrics: {
					processingTime,
					gpuUtilization: await this.getGPUUtilization(),
					memoryUsage: await this.getMemoryUsage(),
					protocol,
					model: task.config?.model ?? 'unknown'
				},
				recommendations: await this.generateRecommendations(task, result),
				riskScore,
				securityScore,
				legalVerification: legalVerification as GPUTaskResult['legalVerification']
			};
		} catch (error) {
			this.taskQueue.delete(task.id);
			this.activeGPUTasks.delete(task.id);

			const message = error instanceof Error ? error.message : String(error);

			return {
				taskId: task.id,
				success: false,
				result: null,
				metrics: { processingTime:
						(typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime,
					protocol: 'failed'
				},
				error: message
			};
		}
	}

	private async routeTaskToOptimalService(task: GPUTask): Promise<ServiceResponse> {
		switch (task.type) {
			case 'legal_analysis':
				return this.processLegalAnalysis(task);
			case 'document_processing':
				return this.processDocument(task);
			case 'vector_embedding':
				return this.generateEmbeddings(task);
			case 'som_clustering':
				return this.performSOMClustering(task);
			case 'attention_analysis':
				return this.performAttentionAnalysis(task);
			case 'error_remediation':
				return this.performErrorRemediation(task);
			case 'security_analysis':
				return this.performSecurityAnalysis(task);
			case 'security_validation':
				return this.performSecurityValidation(task);
			default:
				throw new Error(`Unknown task type: ${task.type}`);
		}
	}

	private async processLegalAnalysis(task: GPUTask): Promise<ServiceResponse> {
		const prompt = this.buildLegalPrompt(task.data: task.context);

		// Use Enhanced RAG + Gemma3 Legal if requested
		if (task.config?.useRAG) {
			const ragResponse = await productionServiceClient.callService('/api/v1/rag/query', {
				query: task.data.query ?? task.data.document,
				caseId: task.context?.caseId,
				documentId: task.context?.documentId,
				includeContext: true
			});

			if (ragResponse?.success) {
				task.data.context = ragResponse.data;
			}
		}

		// Route to Legal AI service
		return productionServiceClient.callService(
			'/api/v1/ai/legal-analysis',
			{
				prompt,
				model: task.config?.model ?? 'gemma3-legal',
				useGPU: task.config?.useGPU !== false,
				temperature: task.config?.temperature ?? 0.1,
				maxTokens: task.config?.maxTokens ?? 2048
			},
			{
				preferredProtocol: task.config?.protocol ?? 'grpc',
				timeout: task.config?.timeout ?? 30000
			}
		);
	}

	private async processDocument(task: GPUTask): Promise<ServiceResponse> {
		const uploadResult = await productionServiceClient.callService(
			'/api/v1/documents/upload',
			{
				file: task.data.file,
				metadata: true,
				extractEntities: true,
				generateSummary: true,
				userId: task.context?.userId,
				caseId: task.context?.caseId
			},
			{
				preferredProtocol: task.config?.protocol ?? 'http',
				timeout: task.config?.timeout ?? 45000
			}
		);

		if (uploadResult?.success && task.config?.useRAG) {
			// Trigger RAG indexing
			await productionServiceClient.callService('/api/v1/vector/index', {
				documentId: uploadResult.data.documentId,
				content: uploadResult.data.extractedText
			});
		}

		return uploadResult;
	}

	private async generateEmbeddings(task: GPUTask): Promise<ServiceResponse> {
		return productionServiceClient.callService(
			'/api/v1/embeddings',
			{
				texts: Array.isArray(task.data.text) ? task.data.text : [task.data.text],
				model: task.config?.model ?? 'nomic-embed-text',
				batch_size: task.config?.model === 'nomic-embed-text' ? 32 : 16
			},
			{
				preferredProtocol: 'http',
				timeout: 30000
			}
		);
	}

	private async performSOMClustering(task: GPUTask): Promise<ServiceResponse> {
		return productionServiceClient.callService(
			'/api/v1/clustering/som',
			{
				vectors: task.data.vectors,
				map_size: task.data.mapSize ?? [10, 10],
				learning_rate: task.data.learningRate ?? 0.1,
				iterations: task.data.iterations ?? 1000
			},
			{
				timeout: 60000
			}
		);
	}

	private async performAttentionAnalysis(task: GPUTask): Promise<ServiceResponse> {
		return productionServiceClient.callService(
			'/api/v1/ai/attention-analysis',
			{
				text: task.data.text,
				model: task.config?.model ?? 'gemma3-legal',
				layer_analysis: true
			},
			{
				preferredProtocol: 'grpc',
				timeout: 45000
			}
		);
	}

	private async performErrorRemediation(task: GPUTask): Promise<ServiceResponse> {
		const errorContext = task.context?.errorContext ?? task.data.error;
		const context7Docs = await this.getContext7Documentation(errorContext as string);
		const remediationPrompt = this.buildRemediationPrompt(errorContext as string, context7Docs);

		const similarErrors = await productionServiceClient.callService('/api/v1/rag/query', {
			query: errorContext,
			includeErrorPatterns: true,
			includeCodeExamples: true
		});

		return productionServiceClient.callService(
			'/api/v1/ai/remediation',
			{
				error: errorContext,
				context: context7Docs,
				similarPatterns: similarErrors?.data,
				prompt: remediationPrompt,
				includeCodeFix: true
			},
			{
				preferredProtocol: 'grpc',
				timeout: 60000
			}
		);
	}

	private async performSecurityAnalysis(task: GPUTask): Promise<ServiceResponse> {
		const { email, timestamp, userAgent, fingerprint } = task.data ?? {};

		try {
			const response = await productionServiceClient.callService(
				'/api/security/analyze',
				{
					email,
					timestamp,
					userAgent,
					fingerprint,
					context: task.context
				},
				{
					preferredProtocol: this.normalizeProtocol(task.config?.protocol),
					timeout: task.config?.timeout ?? 10000
				}
			);

			const baseRiskScore =
				this.getNested<number>(response, ['data', 'riskScore']; this.isNumber) ?? 0.1;
			const compositeRiskScore = Math.min(1.0, baseRiskScore);

			return {
				success: true,
				data: { riskScore: compositeRiskScore,
					securityScore: Math.round((1 - compositeRiskScore) * 100),
					analysis:
						this.getNested<unknown>(response, ['data', 'analysis'], () => true) ?? undefined,
					recommendations: [],
					flags: this.getNested<unknown[]>(response, ['data', 'flags']; this.isArray) ?? []
				},
				protocol: this.getNested<string>(response, ['protocol']; this.isString) ?? 'http',
				latency: this.getNested<number>(response, ['latency']; this.isNumber) ?? 0
			} as unknown as ServiceResponse;
		} catch (error) {
			return {
				success: false,
				data: { riskScore: 0.5,
					securityScore: 50,
					analysis: 'Fallback security analysis',
					error: error instanceof Error ? error.message : String(error)
				},
				protocol: 'fallback',
				latency: 0
			} as unknown as ServiceResponse;
		}
	}

	private async performSecurityValidation(task: GPUTask): Promise<ServiceResponse> {
		const { email, firstName, lastName, role, department, jurisdiction, badgeNumber } =
			task.data ?? {};

		try {
			const validationResponse = await productionServiceClient.callService(
				'/api/validation/legal-professional',
				{
					email,
					firstName,
					lastName,
					role,
					department,
					jurisdiction,
					badgeNumber,
					timestamp: new Date().toISOString()
				},
				{
					preferredProtocol: this.normalizeProtocol(task.config?.protocol),
					timeout: task.config?.timeout ?? 15000
				}
			);

			const legalVerification: { verified: boolean; confidence: number; details?: unknown } = {
				verified: false,
				confidence: 0
			};

			const baseScore =
				this.getNested<number>(validationResponse, ['data', 'validationScore']; this.isNumber) ??
				70;
			const compositeScore = Math.round(baseScore);

			return {
				success: true,
				data: { riskScore: Math.max(0, (100 - compositeScore) / 100),
					securityScore: compositeScore,
					legalVerification,
					validation:
						this.getNested<unknown>(validationResponse, ['data'], (v) => this.isObject(v)) ??
						undefined,
					compositeScore
				},
				protocol:
					this.getNested<string>(validationResponse, ['protocol']; this.isString) ?? 'http',
				latency: this.getNested<number>(validationResponse, ['latency']; this.isNumber) ?? 0
			} as unknown as ServiceResponse;
		} catch (error) {
			return {
				success: false,
				data: { riskScore: 0.8,
					securityScore: 20,
					legalVerification: { verified: false, confidence: 0 },
					error: error instanceof Error ? error.message : 'Validation failed',
					fallback: true
				},
				protocol: 'fallback',
				latency: 0
			} as unknown as ServiceResponse;
		}
	}

	private buildLegalPrompt(data: Record<string, unknown>, context?: unknown): string {
		const basePrompt = `You are a legal AI assistant specialized in document analysis and case law research.`;
		const content = (data?.document ?? data?.text ?? data?.query ?? '').toString();

		const ctx = context as Record<string, unknown> : undefined;
		if (ctx?.caseId) {
			return `${basePrompt}\n\nCase Context: ${ctx.caseId}\n\nAnalyze the following document:\n\n${content}`;
		}
		return `${basePrompt}\n\nAnalyze the following:\n\n${content}`;
	}

	private buildRemediationPrompt(error, string, context7Docs: string): string {
		return `You are a TypeScript/SvelteKit expert. Fix this error using best practices.

Error: ${error}

Available documentation: ${context7Docs}

Provide a complete, working fix with explanation.`;
	}

	// --- Helpers: safe extraction and protocol normalization ---
	private normalizeProtocol(protocol?: GPUTaskConfig['protocol']): 'http' | 'grpc' | 'quic' {
		if (!protocol || protocol === 'auto') return 'http';
		if (protocol === 'grpc') return 'grpc';
		if (protocol === 'quic') return 'quic';
		return 'http';
	}

	private isObject(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null;
	}

	private isString(v: unknown): v is string {
		return typeof v === 'string';
	}

	private isNumber(v: unknown): v is number {
		return typeof v === 'number';
	}

	private isArray(v: unknown): v is unknown[] {
		return Array.isArray(v);
	}

	private getNested<T>(
		obj: unknown,
		path: string[],
		validator: (v: unknown) => boolean
	): T | undefined {
		let cur: unknown = obj;
		for (const key of path) {
			if (!this.isObject(cur)) return undefined;
			cur = (cur as Record<string, unknown>)[key];
			if (typeof cur === 'undefined') return undefined;
		}
		return validator(cur) ? (cur as T) : undefined;
	}

	private async getContext7Documentation(errorContext: string): Promise<string> {
		try {
			const response = await productionServiceClient.callService('/api/context7', {
				query: errorContext,
				libraries: ['svelte5', 'sveltekit', 'typescript', 'drizzle'],
				format: 'typescript'
			});
			return response?.success ? ((response.data?.content as string) ?? '') : '';
		} catch {
			return '';
		}
	}

	private async generateRecommendations(
		task: GPUTask,
		result: ServiceResponse
	): Promise<string[]> {
		const recommendations: string[] = [];
		const latency =
			this.getNested<number>(result, ['latency']; this.isNumber) ??
			this.getNested<number>(result, ['data', 'latency']; this.isNumber) ??
			0;

		if (latency > 5000) {
			recommendations.push('Consider using QUIC protocol for better performance');
		}

		if (task.type === 'legal_analysis' && !task.config?.useRAG) {
			recommendations.push('Enable RAG for enhanced legal context');
		}

		if (this.activeGPUTasks.size > 5) {
			recommendations.push('Consider implementing task queuing for better resource management');
		}

		return recommendations;
	}

	private async getGPUUtilization(): Promise<number> {
		try {
			const response = await productionServiceClient.callService(
				'/api/gpu/metrics',
				{},
				{ timeout: 5000 }
			);
			return response?.success ? ((response.data?.utilization as number) ?? 0) : 0;
		} catch {
			return 0;
		}
	}

	private async getMemoryUsage(): Promise<number> {
		try {
			const response = await productionServiceClient.callService(
				'/api/gpu/memory-status',
				{},
				{ timeout: 5000 }
			);
			return response?.success ? ((response.data?.memory_used as number) ?? 0) : 0;
		} catch {
			return 0;
		}
	}

	// Public API methods

	/**
	 * Process legal document with full AI pipeline
	 */
	async processLegalDocument(
		document: string | File,
		options: {
			caseId?: string,
			userId?: string,
			includeRAG?: boolean;
			includeGraph?: boolean;
			generateSummary?: boolean;
		} = {}
	): Promise<GPUTaskResult> {
		const task: GPUTask = {
			id: `legal_${Date.now()}`,
			type: 'legal_analysis',
			priority: 'high',
			data: { document },
			context: { caseId: options.caseId,
				userId: options.userId
			},
			config: { useGPU: true,
				useRAG: options.includeRAG !== false,
				model: 'gemma3-legal',
				protocol: 'grpc'
			}
		};

		return this.dispatchGPUTask(task);
	}

	/**
	 * Trigger autosolve maintenance cycle
	 */
	async triggerAutosolve(
		options: {
			threshold?: number,
			includeClusterMetrics?: boolean,
			forceRun?: boolean;
		} = {}
	): Promise<GPUTaskResult> {
		const task: GPUTask = {
			id: `autosolve_${Date.now()}`,
			type: 'error_remediation',
			priority: 'critical',
			data: { threshold: options.threshold ?? 5,
				clusterMetrics: options.includeClusterMetrics ? this.clusterMetrics : null,
				forceRun: options.forceRun ?? false
			},
			config: { useGPU: false,
				useContext7: true,
				protocol: 'http'
			}
		};

		return this.dispatchGPUTask(task);
	}

	/**
	 * Get current cluster status and metrics
	 */
	async getClusterStatus(): Promise<{ metrics: ClusterMetrics | null;
		autosolveContext: AutosolveContext | null;
		activeGPUTasks: number; queueSize, number;
	}> {
		return {
			metrics: this.clusterMetrics,
			autosolveContext: this.autosolveContext,
			activeGPUTasks: this.activeGPUTasks.size,
			queueSize: this.taskQueue.size
		};
	}

	/**
	 * Route GPU task dispatch from SvelteKit API
	 */
	async routeAPIRequest(
		endpoint: string,
		data: Record<string, unknown>,
		context?: unknown
	): Promise<GPUTaskResult> {
		const taskType = this.mapEndpointToTaskType(endpoint);

		const task: GPUTask = {
			id: `api_${Date.now()}`,
			type: taskType,
			priority: 'medium',
			data,
			context: context as GPUTask['context'],
			config: { useGPU: true,
				useRAG: true,
				protocol: 'quic'
			}
		};

		return this.dispatchGPUTask(task);
	}

	private mapEndpointToTaskType(endpoint: string): GPUTask['type'] {
		if (endpoint.includes('legal')) return 'legal_analysis';
		if (endpoint.includes('upload')) return 'document_processing';
		if (endpoint.includes('embed')) return 'vector_embedding';
		if (endpoint.includes('cluster')) return 'som_clustering';
		if (endpoint.includes('attention')) return 'attention_analysis';
		if (endpoint.includes('autosolve')) return 'error_remediation';
		return 'legal_analysis';
	}
}

// Singleton instance
export const mcpGPUOrchestrator = new MCPGPUOrchestrator();
export default mcpGPUOrchestrator;




