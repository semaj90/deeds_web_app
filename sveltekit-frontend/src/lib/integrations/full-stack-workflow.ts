/**
 * Full Stack Legal AI Workflow Integration
 * Orchestrates the complete system: VS Code tasks + Agent orchestration + GPU processing
 * Designed to work seamlessly with .vscode/tasks.json
 */

import {
    comprehensiveOrchestrator,
    type ComprehensiveAgentRequest
} from './comprehensive-agent-orchestration.js';
import {
    flashAttentionMulticoreBridge,
    type FlashAttentionMulticoreRequest,
    type FlashAttentionMulticoreResponse
} from './flashattention-multicore-bridge.js';

// Interfaces

export interface FullStackWorkflowRequest {
	mode: 'error_analysis' | 'legal_processing' | 'system_diagnostic' | 'performance_test';
	data?: unknown;
	options?: {
		useGPU?: boolean;
		enableAgents?: boolean;
		priority?: 'low' | 'medium' | 'high' | 'critical';
		maxProcessingTime?: number;
	};
}

export interface FullStackWorkflowResult {
	mode: string;
	success: boolean;
	results: {
		agentOrchestration?: unknown;
		gpuProcessing?: unknown;
		multicoreAnalysis?: unknown;
		systemMetrics?: unknown;
		error?: string;
	};
	performance: {
		totalTime: number;
		gpuUtilization: number;
		agentsUsed: number;
		multicoreWorkers: number;
	};
	recommendations: string[];
	nextSteps: string[];
}

// Type helpers

interface ErrorAnalysisData {
	totalErrors: number;
	categories?: Record<string, number>;
	sampleErrors?: string[];
	[key: string]: unknown;
}

interface LegalProcessingData {
	text?: string;
	context?: string[];
	[key: string]: unknown;
}

interface TypedResult {
	type: string;
	result: unknown;
}

interface ProcessingPayload {
	type: string;
	result: unknown;
}

interface OrchestratorStatus {
	supportedAgents?: string[];
	systemStatus?: {
		agentsExecuted?: number;
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

interface MulticoreStatus {
	workers?: Array<{
		status?: string;
		[k: string]: unknown;
	}>;
	[k: string]: unknown;
}

interface FlashAttentionStatus {
	flashattention_status?: {
		gpuEnabled?: boolean;
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

// Utility functions

function now(): number {
	if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
		return performance.now();
	}
	return Date.now();
}

function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === 'string') return err;
	try {
		return JSON.stringify(err);
	} catch {
		return String(err);
	}
}

function normalizeErrorData(input: unknown): ErrorAnalysisData {
	if (typeof input === 'object' && input !== null) {
		const obj = input as Record<string, unknown>;
		return {
			totalErrors: typeof obj.totalErrors === 'number' ? obj.totalErrors : 0,
			categories: (obj.categories as Record<string, number>) ?? {},
			sampleErrors: Array.isArray(obj.sampleErrors)
				? obj.sampleErrors.filter((s): s is string => typeof s === 'string')
				: [],
			...obj
		};
	}
	return { totalErrors: 0, categories: {}, sampleErrors: [] };
}

function asLegalProcessingData(input: unknown): LegalProcessingData {
	if (typeof input === 'object' && input !== null) {
		const obj = input as Record<string, unknown>;
		return {
			text: typeof obj.text === 'string' ? obj.text  | undefined,
			context: Array.isArray(obj.context)
				? obj.context.filter((c): c is string => typeof c === 'string')
				 | undefined,
			...obj
		};
	}
	return {};
}

/**
 * Full Stack Legal AI Workflow
 * Coordinates all AI/ML services for comprehensive legal document processing
 */
export class FullStackLegalAIWorkflow {
	private isInitialized = false;
	private systemStatus = {
		orchestrator: false,
		flashattention: false,
		multicore: false
	};
	private _multicoreWorkers = 0;

	constructor() {
		console.log('🗂️ Initializing Full Stack Legal AI Workflow...');
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		console.log('🚀 Starting comprehensive system initialization...');
		const startTime = now();

		try {
			await Promise.all([
				this.initializeOrchestrator(),
				this.initializeFlashAttention(),
				this.initializeMulticore()
			]);

			this.isInitialized = true;
			const initTime = now() - startTime;
			console.log(`✅ Full Stack Legal AI Workflow initialized in ${initTime.toFixed(2)}ms`);
			console.log('📊 System Status:', this.getSystemStatus());
		} catch (error: unknown) {
			const msg = getErrorMessage(error);
			console.error('❌ Full Stack initialization failed:', msg);
			throw new Error(`Full Stack initialization failed: ${msg}`);
		}
	}

	private async initializeOrchestrator(): Promise<void> {
		try {
			await comprehensiveOrchestrator.initialize();
			this.systemStatus.orchestrator = true;
			console.log('✅ Agent Orchestrator Ready');
		} catch (error: unknown) {
			console.warn('⚠️ Agent Orchestrator failed to initialize:', getErrorMessage(error));
			this.systemStatus.orchestrator = false;
		}
	}

	private async initializeFlashAttention(): Promise<void> {
		try {
			await flashAttentionMulticoreBridge.initialize();
			this.systemStatus.flashattention = true;
			console.log('✅ FlashAttention2 + Multicore Bridge Ready');
		} catch (error: unknown) {
			console.warn('⚠️ FlashAttention2 Bridge failed to initialize:', getErrorMessage(error));
			this.systemStatus.flashattention = false;
		}
	}

	private async initializeMulticore(): Promise<void> {
		try {
			let attempts = 0;
			while (attempts < 10) {
				const status = flashAttentionMulticoreBridge.getStatus() as FlashAttentionStatus;
				const multicoreStatus = status as unknown as MulticoreStatus;

				const workers = Array.isArray(multicoreStatus?.workers)
					? multicoreStatus.workers
					: [];

				if (workers.length > 0 && workers.some((w) => w.status === 'healthy')) {
					this.systemStatus.multicore = true;
					this._multicoreWorkers = workers.length;
					console.log('✅ Context7 Multicore Service Ready');
					return;
				}

				await new Promise((resolve) => setTimeout(resolve, 500));
				attempts++;
			}

			console.warn('⚠️ Context7 Multicore Service: Timeout waiting for workers');
		} catch (error: unknown) {
			console.warn('⚠️ Context7 Multicore Service failed to initialize:', getErrorMessage(error));
			this.systemStatus.multicore = false;
		}
	}

	/**
	 * Execute full stack workflow based on mode
	 */
	async executeWorkflow(request: FullStackWorkflowRequest): Promise<FullStackWorkflowResult> {
		await this.initialize();

		const startTime = now();
		console.log(`🔄 Executing Full Stack Workflow: ${request.mode}`);

		try {
			let result: FullStackWorkflowResult;

			switch (request.mode) {
				case 'error_analysis':
					result = await this.executeErrorAnalysis(request);
					break;
				case 'legal_processing':
					result = await this.executeLegalProcessing(request);
					break;
				case 'system_diagnostic':
					result = await this.executeSystemDiagnostic(request);
					break;
				case 'performance_test':
					result = await this.executePerformanceTest(request);
					break;
				default:
					throw new Error(`Unknown workflow mode: ${request.mode}`);
			}

			const totalTime = now() - startTime;
			if (!result.performance) {
				result.performance = {
					totalTime: 0,
					gpuUtilization: 0,
					agentsUsed: 0,
					multicoreWorkers: 0
				};
			}
			result.performance.totalTime = totalTime;

			console.log(`✅ Workflow '${request.mode}' completed in ${totalTime.toFixed(2)}ms`);
			return result;
		} catch (error: unknown) {
			const msg = getErrorMessage(error);
			console.error(`❌ Workflow '${request.mode}' failed:`, msg);
			return this.createErrorResult(request.mode, error, now() - startTime);
		}
	}

	/**
	 * Execute error analysis workflow
	 */
	private async executeErrorAnalysis(
		request: FullStackWorkflowRequest
	): Promise<FullStackWorkflowResult> {
		console.log('🔍 Starting comprehensive error analysis...');
		const startTime = now();

		const errorData = normalizeErrorData(
			request?.data ?? {
				totalErrors: 1962,
				categories: {
					svelte5_migration: 800,
					ui_component_mismatch: 600,
					css_unused_selectors: 400,
					binding_issues: 162
				},
				sampleErrors: [
					'TS2322: Type mismatch in component props',
					'Svelte: Object literal may only specify known properties',
					'CSS: Unused selector warning',
					'Binding: Cannot use with non-bindable property'
				]
			}
		);

		const analysisPromises: Promise<TypedResult>[] = [];

		// Agent orchestration
		if (this.systemStatus.orchestrator && request.options?.enableAgents !== false) {
			const orchestrationRequest: ComprehensiveAgentRequest = {
				prompt: `Analyze and fix ${errorData.totalErrors} TypeScript/Svelte errors in legal AI application`,
				context: errorData,
				options: {
					agents: ['claude', 'crewai', 'autogen'],
					priority: request.options?.priority ?? 'high',
					analysisType: 'document_processing',
					useMulticoreAnalysis: true,
					errorAnalysis: true,
					autoFix: false
				}
			};

			analysisPromises.push(
				comprehensiveOrchestrator
					.executeComprehensiveAnalysis(orchestrationRequest)
					.then((res) => ({ type: 'orchestration', result: res as unknown }))
			);
		}

		// GPU analysis
		if (this.systemStatus.flashattention && request.options?.useGPU !== false) {
			const codeContext = [
				'Svelte 5 component with runes',
				'TypeScript strict mode',
				'Legal AI integration'
			];

			analysisPromises.push(
				flashAttentionMulticoreBridge
					.analyzeErrorsWithAttention(errorData, codeContext)
					.then((res) => ({ type: 'gpu', result: res as unknown }))
			);
		}

		// Multicore analysis
		if (this.systemStatus.multicore) {
			analysisPromises.push(
				comprehensiveOrchestrator
					.analyzeErrors(errorData)
					.then((res) => ({ type: 'multicore', result: res as unknown }))
			);
		}

		const analysisResults = await Promise.allSettled(analysisPromises);
		const results: Record<string, unknown> = {};
		let agentsUsed = 0;
		let gpuUtilization = 0;

		analysisResults.forEach((r) => {
			if (r.status === 'fulfilled') {
				const { type, result } = r.value;
				results[type] = result;

				if (type === 'orchestration') {
					const sysStatus = (result as Record<string, unknown>)?.systemStatus as
						| Record<string, unknown>
						| undefined;
					agentsUsed =
						typeof sysStatus?.agentsExecuted === 'number' ? sysStatus.agentsExecuted : 0;
				}

				if (type === 'gpu') gpuUtilization = 0.75;
			}
		});

		const recommendations = this.generateErrorAnalysisRecommendations(results, errorData);
		const nextSteps = this.generateErrorAnalysisNextSteps(results, errorData);
		const totalTime = now() - startTime;

		return {
			mode: 'error_analysis',
			success: true,
			results: {
				agentOrchestration: results.orchestration,
				gpuProcessing: results.gpu,
				multicoreAnalysis: results.multicore,
				systemMetrics: this.getSystemMetrics()
			},
			performance: {
				totalTime,
				gpuUtilization,
				agentsUsed,
				multicoreWorkers: this.getSystemStatus().multicoreWorkers
			},
			recommendations,
			nextSteps
		};
	}

	private async executeLegalProcessing(
		request: FullStackWorkflowRequest
	): Promise<FullStackWorkflowResult> {
		console.log('⚖️ Starting legal text processing...');
		const startTime = now();

		const lpData = asLegalProcessingData(request.data);
		const legalText =
			lpData?.text ??
			'Legal contract analysis with indemnification clauses and liability limitations.';
		const context = lpData?.context ?? ['contract law', 'evidence rules', 'liability'];

		const processingPromises: Promise<ProcessingPayload>[] = [];

		// Agent-based legal analysis
		if (this.systemStatus.orchestrator) {
			const legalRequest: ComprehensiveAgentRequest = {
				prompt: `Provide comprehensive legal analysis: ${legalText}`,
				context: { legalContext: context },
				options: {
					agents: ['claude', 'crewai'],
					analysisType: 'legal_research',
					priority: request.options?.priority ?? 'medium',
					useMulticoreAnalysis: true
				}
			};

			processingPromises.push(
				comprehensiveOrchestrator
					.executeComprehensiveAnalysis(legalRequest)
					.then((res) => ({ type: 'legal_orchestration', result: res as unknown }))
			);
		}

		// GPU-accelerated legal processing
		if (this.systemStatus.flashattention) {
			const flashRequest: FlashAttentionMulticoreRequest = {
				text: legalText,
				context,
				options: {
					analysisType: 'legal',
					enableGPU: request.options?.useGPU !== false,
					useAgentOrchestration: true,
					priority: request.options?.priority ?? 'medium'
				}
			};

			processingPromises.push(
				flashAttentionMulticoreBridge
					.processWithEnhancedAnalysis(flashRequest)
					.then((res) => ({ type: 'legal_gpu', result: res as unknown }))
			);
		}

		const processingResults = await Promise.allSettled(processingPromises);
		const results: Record<string, unknown> = {};

		processingResults.forEach((r) => {
			if (r.status === 'fulfilled') {
				const { type, result } = r.value;
				results[type] = result;
			}
		});

		const totalTime = now() - startTime;

		return {
			mode: 'legal_processing',
			success: true,
			results,
			performance: {
				totalTime,
				gpuUtilization: results['legal_gpu'] != null ? 0.8 : 0,
				agentsUsed:
					((results.legal_orchestration as Record<string, unknown>)?.systemStatus?.[
						'agentsExecuted'
					] as number) ?? 0,
				multicoreWorkers: this.getSystemStatus().multicoreWorkers
			},
			recommendations: this.generateLegalProcessingRecommendations(results),
			nextSteps: ['Review legal analysis results', 'Apply findings to case strategy']
		};
	}

	private async executeSystemDiagnostic(
		_request: FullStackWorkflowRequest
	): Promise<FullStackWorkflowResult> {
		console.log('🔧 Running system diagnostic...');
		const startTime = now();

		const diagnostics = {
			orchestrator: this.systemStatus.orchestrator
				? comprehensiveOrchestrator.getSystemStatus()
				: null,
			flashattention: this.systemStatus.flashattention
				? flashAttentionMulticoreBridge.getStatus()
				: null,
			multicore: this.systemStatus.multicore ? flashAttentionMulticoreBridge.getStatus() : null,
			systemHealth: this.getSystemHealth()
		};

		const totalTime = now() - startTime;

		const orchestratorStatus = diagnostics.orchestrator as OrchestratorStatus | null;
		const flashStatus = diagnostics.flashattention as FlashAttentionStatus | null;
		const agentsUsed = Array.isArray(orchestratorStatus?.supportedAgents)
			? orchestratorStatus.supportedAgents.length
			: 0;
		const gpuEnabled = !!flashStatus?.flashattention_status?.gpuEnabled;

		return {
			mode: 'system_diagnostic',
			success: true,
			results: { systemMetrics: diagnostics },
			performance: {
				totalTime,
				gpuUtilization: gpuEnabled ? 0.3 : 0,
				agentsUsed,
				multicoreWorkers: this.getSystemStatus().multicoreWorkers
			},
			recommendations: this.generateDiagnosticRecommendations(diagnostics),
			nextSteps: ['Review system health', 'Apply recommended optimizations']
		};
	}

	private async executePerformanceTest(
		_request: FullStackWorkflowRequest
	): Promise<FullStackWorkflowResult> {
		console.log('🚀 Running performance test...');
		const startTime = now();

		const testPromises: Promise<{ type: string; result: unknown }>[] = [];

		if (this.systemStatus.orchestrator) {
			testPromises.push(
				this.testAgentPerformance().then((result) => ({ type: 'agent_performance', result }))
			);
		}

		if (this.systemStatus.flashattention) {
			testPromises.push(
				this.testGPUPerformance().then((result) => ({ type: 'gpu_performance', result }))
			);
		}

		const testResults = await Promise.allSettled(testPromises);
		const results: Record<string, unknown> = {};

		testResults.forEach((r) => {
			if (r.status === 'fulfilled') {
				const { type, result } = r.value;
				results[type] = result;
			}
		});

		const totalTime = now() - startTime;

		return {
			mode: 'performance_test',
			success: true,
			results,
			performance: {
				totalTime,
				gpuUtilization:
					((results['gpu_performance'] as Record<string, unknown>)?.['utilization'] as
						| number
						| undefined) ?? 0,
				agentsUsed:
					((results['agent_performance'] as Record<string, unknown>)?.['agentCount'] as
						| number
						| undefined) ?? 0,
				multicoreWorkers: this.getSystemStatus().multicoreWorkers
			},
			recommendations: this.generatePerformanceRecommendations(results),
			nextSteps: ['Review performance metrics', 'Apply optimizations']
		};
	}

	// Recommendation generators

	private generateErrorAnalysisRecommendations(
		results: Record<string, unknown>,
		_errorData: ErrorAnalysisData
	): string[] {
		const recommendations: string[] = [];

		const orchestration = results['orchestration'] as Record<string, unknown> | undefined;
		const gpu = results['gpu'] as Record<string, unknown> | undefined;

		if (orchestration && typeof orchestration['bestResult'] !== 'undefined') {
			recommendations.push('Multi-agent analysis completed successfully');
		}

		if (gpu && Array.isArray(gpu['prioritizedErrors'])) {
			const count = gpu['prioritizedErrors'].length;
			recommendations.push(`GPU analysis prioritized ${count} critical errors`);
		}

		recommendations.push('Execute systematic Svelte 5 migration for 800+ prop errors');
		recommendations.push('Update UI component API usage for 600+ mismatches');
		recommendations.push('Clean up 400+ unused CSS selectors');

		return recommendations;
	}

	private generateErrorAnalysisNextSteps(
		_results: Record<string, unknown>,
		_errorData: ErrorAnalysisData
	): string[] {
		return [
			'Run automated fix scripts for high-priority errors',
			'Apply Svelte 5 migration patterns',
			'Update component prop usage',
			'Validate fixes with incremental testing'
		];
	}

	private generateLegalProcessingRecommendations(results: Record<string, unknown>): string[] {
		const recommendations: string[] = [];

		try {
			const gpu = results['legal_gpu'] as Record<string, unknown> | undefined;
			const orchestration = results['legal_orchestration'] as Record<string, unknown> | undefined;

			if (orchestration && typeof orchestration['bestResult'] !== 'undefined') {
				recommendations.push('Multi-agent legal analysis provides comprehensive insights');
			}

			if (gpu && Array.isArray(gpu['highlights'])) {
				recommendations.push('GPU-accelerated legal analysis completed');
			}

			const score =
				(orchestration?.['relevanceScore'] as number | undefined) ??
				(gpu?.['relevance'] as number | undefined);
			if (typeof score === 'number') {
				recommendations.push(`Relevance score: ${(score * 100).toFixed(1)}%`);
			}
		} catch {
			// Ignore errors
		}

		recommendations.push('Validate legal findings with domain experts');
		return recommendations;
	}

	private generateDiagnosticRecommendations(diagnostics: Record<string, unknown>): string[] {
		const recommendations: string[] = [];

		if (!diagnostics['orchestrator']) {
			recommendations.push('Initialize agent orchestrator for enhanced AI capabilities');
		}

		if (!diagnostics['flashattention']) {
			recommendations.push('Enable GPU acceleration for better performance');
		}

		const multicore = diagnostics['multicore'] as Record<string, unknown> | undefined;
		const workers = multicore?.['workers'] as unknown[] | undefined;
		const workerCount = Array.isArray(workers) ? workers.length : 0;

		if (workerCount < 4) {
			recommendations.push('Increase multicore worker count for better throughput');
		}

		return recommendations;
	}

	private generatePerformanceRecommendations(results: Record<string, unknown>): string[] {
		const recommendations: string[] = [];

		const gpuPerf = results['gpu_performance'] as Record<string, unknown> | undefined;
		const agentPerf = results['agent_performance'] as Record<string, unknown> | undefined;

		const gpuProcessingTime = (gpuPerf?.['processingTime'] as number | undefined) ?? 0;
		if (gpuProcessingTime > 5000) {
			recommendations.push('Consider GPU memory/kernel optimization for faster processing');
		}

		const avgResponse = (agentPerf?.['averageResponseTime'] as number | undefined) ?? 0;
		if (avgResponse > 3000) {
			recommendations.push('Optimize agent response times through caching and prioritization');
		}

		return recommendations;
	}

	// Performance testing

	private async testAgentPerformance(): Promise<Record<string, unknown>> {
		const startTime = now();

		try {
			const req: ComprehensiveAgentRequest = {
				prompt: 'Performance test query',
				context: {},
				options: {
					agents: ['claude'],
					priority: 'low'
				}
			};

			const result = await comprehensiveOrchestrator.executeComprehensiveAnalysis(req);
			const processingTime = now() - startTime;

			return {
				success: true,
				processingTime,
				agentCount: Array.isArray(req.options?.agents) ? req.options.agents.length : 1,
				averageResponseTime: processingTime,
				result
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: getErrorMessage(error),
				processingTime: now() - startTime
			};
		}
	}

	private async testGPUPerformance(): Promise<Record<string, unknown>> {
		const startTime = now();

		try {
			const flashReq: FlashAttentionMulticoreRequest = {
				text: 'GPU performance test text',
				context: [],
				options: {
					enableGPU: true,
					priority: 'low'
				}
			};

			const result = await flashAttentionMulticoreBridge.processWithEnhancedAnalysis(flashReq);
			const processingTime = now() - startTime;

			const utilization = (result as FlashAttentionMulticoreResponse)?.systemMetrics
				?.gpuUtilization;

			return {
				success: true,
				processingTime,
				utilization: typeof utilization === 'number' ? utilization : 0,
				result
			};
		} catch (error: unknown) {
			return {
				success: false,
				error: getErrorMessage(error),
				processingTime: now() - startTime,
				utilization: 0
			};
		}
	}

	// System status helpers

	private createErrorResult(
		mode: string,
		error: unknown,
		totalTime: number
	): FullStackWorkflowResult {
		return {
			mode,
			success: false,
			results: { error: getErrorMessage(error) },
			performance: {
				totalTime,
				gpuUtilization: 0,
				agentsUsed: 0,
				multicoreWorkers: 0
			},
			recommendations: ['Check system status and retry'],
			nextSteps: ['Review error logs', 'Initialize failed services']
		};
	}

	private getSystemStatus() {
		return {
			initialized: this.isInitialized,
			orchestrator: this.systemStatus.orchestrator,
			flashattention: this.systemStatus.flashattention,
			multicore: this.systemStatus.multicore,
			multicoreWorkers: this.systemStatus.multicore ? this._multicoreWorkers : 0
		};
	}

	private getSystemHealth(): 'excellent' | 'good' | 'degraded' | 'critical' {
		const activeServiceCount = Object.values(this.systemStatus).filter(Boolean).length;

		if (activeServiceCount === 3) return 'excellent';
		if (activeServiceCount === 2) return 'good';
		if (activeServiceCount === 1) return 'degraded';
		return 'critical';
	}

	private getSystemMetrics() {
		return {
			uptime: this.isInitialized ? Date.now() : 0,
			health: this.getSystemHealth(),
			services: this.systemStatus,
			capabilities: [
				this.systemStatus.orchestrator ? 'Agent Orchestration' : null,
				this.systemStatus.flashattention ? 'GPU Acceleration' : null,
				this.systemStatus.multicore ? 'Multicore Processing' : null
			].filter((c): c is string => c !== null)
		};
	}
}

// Global workflow instance
export const fullStackWorkflow = new FullStackLegalAIWorkflow();

// Helper functions for VS Code tasks and external callers

export async function initializeFullStack(): Promise<void> {
	await fullStackWorkflow.initialize();
}

export async function runErrorAnalysis(errorData?: unknown): Promise<FullStackWorkflowResult> {
	return await fullStackWorkflow.executeWorkflow({
		mode: 'error_analysis',
		data: errorData,
		options: {
			useGPU: true,
			enableAgents: true,
			priority: 'high'
		}
	});
}

export async function runLegalProcessing(
	text: string,
	context?: string[]
): Promise<FullStackWorkflowResult> {
	return await fullStackWorkflow.executeWorkflow({
		mode: 'legal_processing',
		data: { text, context },
		options: {
			useGPU: true,
			enableAgents: true,
			priority: 'medium'
		}
	});
}

export async function runSystemDiagnostic(): Promise<FullStackWorkflowResult> {
	return await fullStackWorkflow.executeWorkflow({
		mode: 'system_diagnostic',
		options: {
			priority: 'low'
		}
	});
}

export async function runPerformanceTest(): Promise<FullStackWorkflowResult> {
	return await fullStackWorkflow.executeWorkflow({
		mode: 'performance_test',
		options: {
			useGPU: true,
			enableAgents: true,
			priority: 'low'
		}
	});
}

export default fullStackWorkflow;
