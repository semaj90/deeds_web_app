/**
 * MCP GPU Orchestrator - Advanced Multi-Protocol AI Task Dispatcher
 * Coordinates GPU processing: RAG analysis, and autosolve remediation
 * Integrates existing 37 Go services and Ollama cluster
 */

import { productionServiceClient, type ServiceResponse } from '$lib/api/production-service-client';

export interface GPUTask {
	id: string;
	type?:
		| 'legal_analysis'
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
			name: 'gemma3-legal, latest',
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
			name: 'nomic-embed-text, latest',
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

			// Clean up
			this.taskQueue.delete(task.id);
			this.activeGPUTasks.delete(task.id);

			// Extract common values from the ServiceResponse
			const payload = this.getNested<unknown>(result, ['data'], () => true) ?? result;
			const protocol = this.getNested<string>(result, ['protocol'], this.isString) ??
				this.getNested<string>(result, ['data', 'protocol'], this.isString) ??
				'http';

			const riskScore = this.getNested<number>(result, ['data', 'riskScore'], this.isNumber);
			const securityScore = this.getNested<number>(result, ['data', 'securityScore'], this.isNumber);
			const legalVerification = this.getNested(result, ['data', 'legalVerification'], () => true);

			return {
				taskId: task.id,
				success: true,
				result: payload,
				metrics: { processingTime: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime,
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
				metrics: { processingTime: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime,
					gpuUtilization: 0,
					memoryUsage: 0,
					protocol: 'failed',
					model: 'failed'
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
		const prompt = this.buildLegalPrompt(task.data, task.context);

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
			const docData = uploadResult.data as { documentId: string, extractedText: string };
			await productionServiceClient.callService('/api/v1/vector/index', {
				documentId: docData.documentId,
				content: docData.extractedText
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

			const baseRiskScore = this.getNested<number>(response, ['data', 'riskScore'], this.isNumber) ?? 0.1;
			const compositeRiskScore = Math.min(1.0, baseRiskScore);

			return {
				success: true,
				data: { riskScore: compositeRiskScore,
					securityScore: Math.round((1 - compositeRiskScore) * 100),
					analysis: this.getNested<unknown>(response, ['data', 'analysis'], () => true) ?? undefined,
					recommendations: [],
					flags: this.getNested<unknown[]>(response, ['data', 'flags'], this.isArray) ?? []
				},
				protocol: this.getNested<string>(response, ['protocol'], this.isString) ?? 'http',
				latency: this.getNested<number>(response, ['latency'], this.isNumber) ?? 0
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
		const { email, firstName, lastName, role, department, jurisdiction, badgeNumber } = task.data ?? {};

		try {
			const response = await productionServiceClient.callService(
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

			return response;
		} catch (error) {
			console.error('Security validation failed:', error);
			throw error;
		}
	}

	// Helper methods
	private getNested<T>(obj: unknown, path: string[], validator: (val: unknown) => boolean): T | undefined {
		let current = obj;
		for (const key of path) {
			if (current && typeof current === 'object' && key in current) {
				current = (current as Record<string, unknown>)[key];
			} else {
				return undefined;
			}
		}
		return validator(current) ? current as T: undefined;
	}

	private isString(val: unknown): boolean {
		return typeof val === 'string';
	}

	private isNumber(val: unknown): boolean {
		return typeof val === 'number';
	}

	private isArray(val: unknown): boolean {
		return Array.isArray(val);
	}

	private async getGPUUtilization(): Promise<number> {
		return 0.45; // Placeholder
	}

	private async getMemoryUsage(): Promise<number> {
		return 1024 * 1024 * 512; // Placeholder
	}

	private async generateRecommendations(task: GPUTask, result: ServiceResponse): Promise<string[]> {
		return ['Optimize prompt', 'Use lower precision']; // Placeholder
	}

	private buildLegalPrompt(data: Record<string, unknown>, context?: Record<string, unknown>): string {
		return `Analyze: ${JSON.stringify(data)}`;
	}

	private async getContext7Documentation(query: string): Promise<string> {
		return 'Documentation...';
	}

	private buildRemediationPrompt(error: string, context: string): string {
		return `Fix error: ${error}`;
	}

	private normalizeProtocol(protocol?: string): 'http' | 'grpc' | 'quic' {
		if (protocol === 'grpc' || protocol === 'quic') return protocol;
		return 'http';
	}
}

export const mcpGPUOrchestrator = new MCPGPUOrchestrator();
