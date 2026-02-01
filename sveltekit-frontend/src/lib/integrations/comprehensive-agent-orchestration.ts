import {
    getContext7MulticoreService,
    type ProcessingTask,
    type RecommendationRequest
} from '../services/context7-multicore.js';

/**
 * Comprehensive Agent Orchestration with Context7 Multicore Integration
 * Wires together all agents (Claude, AutoGen, CrewAI) with the Context7 multicore service
 * Based on FULL_STACK_INTEGRATION_COMPLETE.md specifications
 */

// Agent interfaces
export interface ClaudeAgentRequest {
	prompt: string;
	context?: unknown;
	options?: unknown;
}

export interface CrewAIAgentRequest {
	prompt: string;
	context?: unknown;
	options?: unknown;
}

export interface AutoGenAgentRequest {
	prompt: string;
	context?: unknown;
	options?: unknown;
}

export interface ComprehensiveAgentRequest {
	prompt: string;
	context?: unknown;
	options?: {
		agents?: Array<'claude' | 'crewai' | 'autogen'>;
		priority?: 'low' | 'medium' | 'high' | 'critical';
		analysisType?:
			| 'case_review'
			| 'evidence_analysis'
			| 'legal_research'
			| 'document_processing';
		useMulticoreAnalysis?: boolean;
		includeContext7?: boolean;
		autoFix?: boolean;
		errorAnalysis?: boolean;
		caseId?: string;
		evidenceIds?: string[];
	};
}

// Type definitions
type Priority = 'low' | 'medium' | 'high' | 'critical';

export type AgentResult = {
	output: string;
	score: number;
	metadata: Record<string, unknown>;
};

export interface ComprehensiveAgentResponse {
	bestResult: {
		output: string;
		score: number;
		agent: string;
		metadata: Record<string, unknown>;
	};
	allResults: Array<{
		agent: string;
		output: string;
		score: number;
		metadata: Record<string, unknown>;
	}>;
	multicoreAnalysis?: MulticoreAnalysis;
	systemStatus: {
		agentsExecuted: number;
		totalProcessingTime: number;
		multicoreTasksCompleted: number;
		errorReduction?: number;
	};
}

interface WorkerStatus {
	id?: string;
	status: 'healthy' | 'unhealthy' | string;
	[key: string]: unknown;
}

interface SystemStatus {
	workers: WorkerStatus[];
	metrics?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface TaskWaitResult {
	status: 'pending' | 'completed' | 'failed';
	result?: unknown;
}

export interface MulticoreAnalysis {
	recommendations: string[];
	errorPatterns?: unknown;
	performanceMetrics?: Record<string, unknown>;
	tasksCompleted?: number;
}

export interface ErrorAnalysisResult {
	analysis: unknown;
	recommendations: string[];
	fixSuggestions: string[];
	taskId?: string;
	status?: TaskWaitResult['status'];
}

interface Context7MulticoreService {
	getSystemStatus(): SystemStatus;
	processText(
		text: string,
		taskType: string,
		priority?: Priority
	): Promise<ProcessingTask>;
	generateRecommendations(
		req: RecommendationRequest,
		priority?: Priority
	): Promise<ProcessingTask>;
	waitForTask(taskId: string, timeoutMs?: number): Promise<TaskWaitResult>;
}

/**
 * Comprehensive Agent Orchestrator
 * Manages multiple AI agents and coordinates with Context7 multicore service
 */
export class ComprehensiveAgentOrchestrator {
	private multicoreService: Context7MulticoreService;
	private isInitialized = false;

	constructor() {
		this.multicoreService = getContext7MulticoreService({
			workerCount: 6,
			enableLegalBert: true,
			enableGoLlama: true,
			maxConcurrentTasks: 25,
			enableGPU: true
		}) as unknown as Context7MulticoreService;
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		console.log('🚀 Initializing Comprehensive Agent Orchestrator...');

		// Wait for multicore service to be ready
		await new Promise<void>((resolve) => {
			const checkReady = (): void => {
				const status: SystemStatus = this.multicoreService.getSystemStatus();
				if (
					status.workers.length > 0 &&
					status.workers.some((w: WorkerStatus) => w.status === 'healthy')
				) {
					resolve();
				} else {
					setTimeout(checkReady, 1000);
				}
			};
			checkReady();
		});

		this.isInitialized = true;
		console.log('✅ Comprehensive Agent Orchestrator initialized');
	}

	async executeComprehensiveAnalysis(
		request: ComprehensiveAgentRequest
	): Promise<ComprehensiveAgentResponse> {
		await this.initialize();

		const startTime = Date.now();
		const agentsToUse = request.options?.agents ?? ['claude', 'crewai', 'autogen'];

		console.log(
			`🧠 Executing comprehensive analysis with agents: ${agentsToUse.join(', ')}`
		);

		// Step 1: Run multicore analysis if requested
		let multicoreAnalysis: MulticoreAnalysis | null = null;
		let multicoreTasksCompleted = 0;

		if (request.options?.useMulticoreAnalysis) {
			console.log('🔍 Running Context7 multicore analysis...');
			multicoreAnalysis = await this.runMulticoreAnalysis(request);
			multicoreTasksCompleted = multicoreAnalysis.tasksCompleted ?? 0;
		}

		// Step 2: Execute all requested agents in parallel
		const agentPromises = agentsToUse.map((agent) =>
			this.executeAgent(agent, request, multicoreAnalysis)
		);
		const agentResults = await Promise.allSettled(agentPromises);

		// Step 3: Process results and find the best one
		const allResults: ComprehensiveAgentResponse['allResults'] = [];
		let bestResult: ComprehensiveAgentResponse['bestResult'] | null = null;
		let bestScore = 0;

		agentResults.forEach((result, index) => {
			if (result.status === 'fulfilled') {
				const agentName = agentsToUse[index];
				const value = result.value as AgentResult;
				const agentResult = {
					agent: agentName,
					output: value.output,
					score: value.score,
					metadata: value.metadata
				};

				allResults.push(agentResult);

				if (value.score > bestScore) {
					bestScore = value.score;
					bestResult = agentResult;
				}
			} else {
				const reason = (result as PromiseRejectedResult).reason;
				console.error(`❌ Agent ${agentsToUse[index]} failed:`, reason);
				allResults.push({
					agent: agentsToUse[index],
					output: `Error: ${reason?.message ?? String(reason)}`,
					score: 0,
					metadata: { error: true }
				});
			}
		});

		// Ensure we have at least one result
		if (!bestResult && allResults.length > 0) {
			bestResult = allResults[0];
		} else if (!bestResult) {
			bestResult = {
				agent: 'none',
				output: 'No agents executed successfully',
				score: 0,
				metadata: { error: true }
			};
		}

		const totalProcessingTime = Date.now() - startTime;

		return {
			bestResult,
			allResults,
			multicoreAnalysis: multicoreAnalysis ?? undefined,
			systemStatus: {
				agentsExecuted: allResults.length,
				totalProcessingTime,
				multicoreTasksCompleted
			}
		};
	}

	private async runMulticoreAnalysis(
		request: ComprehensiveAgentRequest
	): Promise<MulticoreAnalysis> {
		const tasks: ProcessingTask[] = [];

		// Semantic analysis
		const semanticTask = await this.multicoreService.processText(
			request.prompt,
			'semantic_analysis',
			request.options?.priority ?? 'medium'
		);
		tasks.push(semanticTask);

		// Legal classification (if applicable)
		if (
			request.options?.analysisType === 'legal_research' ||
			request.options?.analysisType === 'case_review'
		) {
			const legalTask = await this.multicoreService.processText(
				request.prompt,
				'legal_classification',
				request.options?.priority ?? 'medium'
			);
			tasks.push(legalTask);
		}

		// Generate recommendations
		if (request.options?.errorAnalysis) {
			const recTask = await this.multicoreService.generateRecommendations(
				{
					context: request.prompt,
					errorType: 'general',
					priority: request.options?.priority ?? 'medium'
				},
				request.options?.priority ?? 'medium'
			);
			tasks.push(recTask);
		}

		// Wait for all tasks
		const results = await Promise.allSettled(
			tasks.map((task) => this.multicoreService.waitForTask(task.id, 30000))
		);

		const recommendations: string[] = [];
		let completedCount = 0;

		results.forEach((result) => {
			if (result.status === 'fulfilled' && result.value.status === 'completed') {
				completedCount++;
				const res = result.value.result as { recommendations?: string[] } | undefined;
				if (res?.recommendations && Array.isArray(res.recommendations)) {
					recommendations.push(...res.recommendations);
				}
			}
		});

		return {
			recommendations,
			tasksCompleted: completedCount,
			performanceMetrics: {
				totalTasks: tasks.length,
				completedTasks: completedCount
			}
		};
	}

	private async executeAgent(
		agent: 'claude' | 'crewai' | 'autogen',
		request: ComprehensiveAgentRequest,
		multicoreAnalysis: MulticoreAnalysis | null
	): Promise<AgentResult> {
		console.log(`🤖 Executing ${agent} agent...`);

		// Build enhanced prompt with multicore insights
		let enhancedPrompt = request.prompt;
		if (multicoreAnalysis?.recommendations && multicoreAnalysis.recommendations.length > 0) {
			enhancedPrompt += `\n\nContext7 Insights:\n${multicoreAnalysis.recommendations.slice(0, 3).join('\n')}`;
		}

		// Simulate agent execution (placeholder for actual agent implementations)
		try {
			const result = await this.simulateAgentExecution(agent, enhancedPrompt, request.context);
			return {
				output: result,
				score: 0.8 + Math.random() * 0.2,
				metadata: {
					agent,
					timestamp: new Date().toISOString(),
					multicoreEnhanced: !!multicoreAnalysis
				}
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`${agent} agent failed: ${message}`);
		}
	}

	private async simulateAgentExecution(
		agent: string,
		prompt: string,
		_context?: unknown
	): Promise<string> {
		// Placeholder implementation - replace with actual agent integrations
		await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

		return `[${agent.toUpperCase()}] Analysis of: ${prompt.substring(0, 100)}...\n\nKey findings:\n- Analysis complete\n- Recommendations generated\n- Context integrated`;
	}

	/**
	 * Analyze errors with multicore support
	 */
	async analyzeErrors(errorData: unknown): Promise<ErrorAnalysisResult> {
		await this.initialize();

		console.log('🔍 Analyzing errors with Context7 multicore...');

		const errorSnippet =
			typeof errorData === 'string'
				? errorData
				: (() => {
						try {
							return JSON.stringify(errorData).substring(0, 500);
						} catch {
							return String(errorData).substring(0, 500);
						}
					})();

		const task = await this.multicoreService.generateRecommendations(
			{
				context: 'TypeScript/Svelte error analysis',
				errorType: 'compilation_errors',
				codeSnippet: errorSnippet,
				priority: 'high'
			},
			'high'
		);

		const result = await this.multicoreService.waitForTask(task.id, 30000);

		const recommendations: string[] = [];
		const fixSuggestions: string[] = [];

		if (result.status === 'completed') {
			const res = result.result as
				| { recommendations?: string[]; fixSuggestions?: string[] }
				| undefined;
			if (res?.recommendations && Array.isArray(res.recommendations)) {
				recommendations.push(...res.recommendations);
			}
			if (res?.fixSuggestions && Array.isArray(res.fixSuggestions)) {
				fixSuggestions.push(...res.fixSuggestions);
			}
		}

		return {
			analysis: result.result,
			recommendations,
			fixSuggestions,
			taskId: task.id,
			status: result.status
		};
	}

	/**
	 * Get system status
	 */
	getSystemStatus(): {
		initialized: boolean;
		multicoreService: SystemStatus;
		supportedAgents: string[];
	} {
		return {
			initialized: this.isInitialized,
			multicoreService: this.multicoreService.getSystemStatus(),
			supportedAgents: ['claude', 'crewai', 'autogen']
		};
	}
}

// Singleton instance
export const comprehensiveOrchestrator = new ComprehensiveAgentOrchestrator();

// Helper function for quick agent execution
export async function executeAgents(
	prompt: string,
	options: ComprehensiveAgentRequest['options'] = {}
): Promise<ComprehensiveAgentResponse> {
	return await comprehensiveOrchestrator.executeComprehensiveAnalysis({
		prompt,
		options: {
			agents: ['claude', 'crewai', 'autogen'],
			useMulticoreAnalysis: true,
			includeContext7: true,
			...options
		}
	});
}

// Helper function for error-focused analysis
export async function analyzeAndFixErrors(errorData: unknown): Promise<{
	orchestrationResult: ComprehensiveAgentResponse;
	errorAnalysis: ErrorAnalysisResult;
}> {
	const snippet =
		typeof errorData === 'string'
			? errorData
			: (() => {
					try {
						return JSON.stringify(errorData).substring(0, 500);
					} catch {
						return String(errorData).substring(0, 500);
					}
				})();

	const [orchestrationResult, errorAnalysis] = await Promise.all([
		comprehensiveOrchestrator.executeComprehensiveAnalysis({
			prompt: `Analyze and provide fixes for TypeScript/Svelte errors: ${snippet}...`,
			options: {
				agents: ['claude', 'crewai'],
				priority: 'high',
				useMulticoreAnalysis: true,
				errorAnalysis: true,
				autoFix: true
			}
		}),
		comprehensiveOrchestrator.analyzeErrors(errorData)
	]);

	return { orchestrationResult, errorAnalysis };
}

export default comprehensiveOrchestrator;
