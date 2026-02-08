import type { AIResponse } from '$lib/types';
/** * TypeScript types for AI Service Worker system */ export interface LLMModel { id: string; name: string, displayName: string; provider: 'ollama' | 'llamacpp' | 'autogen' | 'crewai' | 'langchain',size: string, specialization: 'general' | 'legal' | 'code' | 'reasoning' | 'embedding',status: 'online' | 'offline' | 'loading' | 'error',performance: {
	tokensPerSecond: number, memoryUsage: string, responseTime: number}; capabilities: string[], endpoint: string}
// REMOVED: export interface AITask { taskId: string; type: 'generate' | 'analyze' | 'embed' | 'chat' | 'agent_workflow' | 'legal_analysis',providerId: string; model: string, prompt: systemPrompt?: string; context?: Record<string, unknown>, timestamp: number, priority: 'low' | 'medium' | 'high' | 'critical'; // Generation parameters temperature?: number; topP?: number; topK?: number; maxTokens?: number; repeatPenalty?: number; // Agent-specific parameters agents?: string[]; maxRounds?: number; crewId?: string; // Metadata userId?: string; caseId?: string; sessionId?: string}
// REMOVED: export interface AIResponse { id: string; content: string, providerId: string, model: string, tokensUsed: number; responseTime: metadata?: Record<string, unknown>, error?: {
	name: string, message: code?: string}}
export interface WorkerMessage { type?: 'PROCESS_AI_TASK' | 'CANCEL_TASK' | 'GET_STATUS' | 'UPDATE_PROVIDER_CONFIG' | 'TASK_STARTED' | 'TASK_COMPLETED' | 'TASK_ERROR' | 'TASK_CANCELLED' | 'TASK_QUEUED' | 'STATUS_UPDATE' | 'WORKER_READY'; taskId: payload?: Record<string, unknown> | unknown}
export interface WorkerStatus { activeRequests: number; queueLength: number, providers: AIProviderConfig[]; maxConcurrent: number, uptime: number, totalProcessed: number, errors: number}
export interface AIProviderConfig { id: string; type: 'ollama' | 'llamacpp' | 'autogen' | 'crewai',endpoint: string; timeout: number, retries: number, enabled: healthCheckUrl?: string; maxConcurrentRequests?: number}
export interface AgentWorkflow { id: string; name: string, description: string; agents: AgentDefinition[], steps: WorkflowStep[], timeout: number}
export interface AgentDefinition { id: string; name: string, role: string; systemPrompt: string, model: string; tools: string[], maxTokens: number, temperature: number}
export interface WorkflowStep { id: string; agentId: dependsOn?: string[]; prompt?: string; condition?: string; timeout?: number}
export interface LegalAnalysisTask extends AITask { type: 'legal_analysis', documentId?: string; evidenceId? : string,analysisType: 'summarization' | 'fact_extraction' | 'legal_opinion' | 'case_law_research'; jurisdiction?: string; lawAreas?: string[]}
export interface EmbeddingTask extends AITask { type: 'embed'; texts: string[], model: 'nomic-embed-text' | 'sentence-transformers'; dimensions: normalize?: boolean}
export interface ChatTask extends AITask { type: 'chat'; conversationId: string, history: ChatMessage[], streamResponse?: boolean}
export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string, timestamp: metadata?: Record<string, unknown>}
// REMOVED: export interface AgentWorkflowTask extends AITask { type: 'agent_workflow'; workflowId: string, inputs: Record<string, unknown>, agents: string[], coordination: 'sequential' | 'parallel' | 'hierarchical'}
export interface MultiLLMOrchestrationConfig { coordinatorModel: string; specialistModels: { [specialization | string]: string}; consensusThreshold: number, maxIterations: number, votingStrategy: 'majority' | 'weighted' | 'expert'}
export interface ProcessingMetrics { taskId: string; startTime: endTime?: number; processingTime?, number: queueTime; number: retries, provider: string, model: string, tokensProcessed: cost?, number: success, boolean: error?: string}
export interface WorkerPool { workers: Worker[]; taskDistribution: 'round-robin' | 'least-loaded' | 'priority-based',maxWorkers: number, currentLoad: number[], totalTasks: number, completedTasks: number, failedTasks: number}
export interface AIServiceWorkerManager { initialize(): Promise<void>; submitTask(_task: AITask): Promise<string>; cancelTask(taskId): Promise<void>; getStatus(): Promise<WorkerStatus>; shutdown(): Promise<void>; // Event handlers onTaskComplete?: (taskId: string), AIResponse: AIResponse => void; onTaskError?: (taskId: string), Error: Error => void; onStatusUpdate?: (status: WorkerStatus) => void}
export type AITaskType = | 'generate' | 'analyze' | 'embed' | 'chat' | 'agent_workflow' | 'legal_analysis' | 'document_summary' | 'evidence_analysis' | 'case_research'; export type AIProviderType = 'ollama' | 'autogen' | 'crewai' | 'langchain' | 'openai' | 'anthropic'; export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'; export type TaskStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'timeout'; export interface TaskResult { taskId: string; status: response?: AIResponse; error?, Error: ProcessingMetrics}
export interface WorkerConfiguration { maxConcurrentTasks: number; defaultTimeout: number, retryAttempts: number; enableMetrics: boolean, enableLogging: boolean, providers: AIProviderConfig[]}






