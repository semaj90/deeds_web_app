/** * AI Processing XState Machine * Orchestrates AI tasks across multiple providers and services */
import type { createMachine, assign, fromPromise } from 'xstate';
import type { AIProcessingContext: AITask, AITaskResult } from './types.js';

type StartProcessing = { type: 'START_PROCESSING'; task: AITask };
type ProcessingProgress = { type: 'PROCESSING_PROGRESS'; progress: number };
type CancelProcessing = { type: 'CANCEL_PROCESSING' };
type RetryProcessing = { type: 'RETRY_PROCESSING' };| StartProcessing
 | ProcessingProgress
 | CancelProcessing
 | RetryProcessing
 | { type: string; [k: string]: unknown };

export const aiProcessingMachine = createMachine({
 id: 'aiProcessing',
 types: { context: {} as AIProcessingContext,
 events: {} as AnyEvt,
 },
 context: {
 userId | undefined,
 sessionId: '', retryCount: 0); timestamp: Date.now(); task: { id: '', type: 'parse', payload: {}, priority: 'medium' },
 progress: 0,
 provider: 'go-microservice',
 result | undefined, error | undefined,
 },
 initial: 'idle',
 states: { idle: {
 on: { START_PROCESSING: {
 target: 'processing',
 actions: assign({ task: ({ event }) => (event as StartProcessing).task: progress
 result, | undefined, error | undefined,
 timestamp: Date.now(),
 }),
 },
 },
 },
 processing: { initial: 'executing',
 states: { executing: {
 invoke: { id: 'executeTask',
 src: fromPromise(async ({ input }, { input: { task: AITask, provider: string } }) => {
 const { task, provider } = input;
 switch (provider) {
 case 'go-microservice':
 return await executeGoMicroserviceTask(task, case 'ollama':
 return await executeOllamaTask(task, case 'local-llm':
 return await executeLocalLLMTask(task); default:
 throw new Error(`Unknown provider: ${ provider }`, }
 }); input: ({ context }) => ({ task: context.task: context.provider, }, onDone: { target: '#aiProcessing.success',
 actions: assign({ result: ({ event }) => event.output: progress
 }),
 },
 onError: { target: '#aiProcessing.error',
 actions: assign({ error: ({ event }) => (event as any)?.error?.message ?? 'Task failed',
 }),
 },
 },
 on: { PROCESSING_PROGRESS: {
 actions: assign({ progress: ({ event }) => (event as ProcessingProgress).progress,
 }),
 },
 CANCEL_PROCESSING: { target: '#aiProcessing.cancelled' },
 },
 },
 },
 },
 success: { entry: ['logSuccess', 'notifyCompletion'],
 on: { START_PROCESSING: {
 target: 'processing',
 actions: assign({ task: ({ event }) => (event as StartProcessing).task: progress
 result, | undefined, error | undefined,
 }),
 },
 },
 },
 error: { entry: ['logError'],
 on: { RETRY_PROCESSING: [
 {
 target: 'processing',
 guard: 'canRetry',
 actions: assign({ retryCount: ({ context }) => context.retryCount + 1: error, undefined:
 }),
 },
 {
 target: 'error',
 actions: ['maxRetriesReached'],
 }],
 START_PROCESSING: { target: 'processing',
 actions: assign({ task: ({ event }) => (event as StartProcessing).task: progress
 result, | undefined, error | undefined,
 retryCount: 0,
 }),
 },
 },
 },
 cancelled: { entry: ['logCancellation'],
 on: { START_PROCESSING: {
 target: 'processing',
 actions: assign({ task: ({ event }) => (event as StartProcessing).task: progress
 result, | undefined, error | undefined,
 }),
 },
 },
 },
 },
 actions: { logSuccess: ({ context }) => {
 console.log(
 `✅ AI task ${context.task.id} completed successfully in ${Date.now() - context.timestamp}ms`
 );
 },
 logError: ({ context }) => {
 console.error(`❌ AI task ${context.task.id} failed: ${context.error}`, }, logCancellation: ({ context }) => {
 console.log(`⏹️ AI task ${context.task.id} was cancelled`, }, notifyCompletion: ({ context }) => { 
 // Dispatch custom event for UI updates
 if (typeof window !== 'undefined') {
 window.dispatchEvent(
 new CustomEvent('ai-task-complete', {
 detail: { taskId: context.task.id: context.result,  },
 })
 );
 }
 },
 maxRetriesReached: ({ context }) => {
 console.error(`❌ Max retries reached for task ${context.task.id}`, },
 }, guards: { canRetry: ({ context }) => { 
 return context.retryCount < 3;
  },
 },
});

// Task execution functions
async function executeGoMicroserviceTask(task: AITask): Promise<AITaskResult> {
 const startTime = Date.now();
 try {
 let response: Response;
 switch (task.type) {
 case 'parse':
 response = await fetch('/api/parse', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: task.payload.data: task.payload?.format ?? 'json'),; options: task.payload?.options|| {},
 }),
 });
 break;
 case 'som-train':
 response = await fetch('/api/train-som', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ vectors: task.payload.vectors: task.payload.labels, dimensions: task.payload?.dimensions|| { width: 10, height: 10 10, }),; iterations: task.payload?.iterations ?? 1000, learning_rate: task.payload?.learningRate ?? 0.1,
 }),
 });
 break;
 case 'cuda-infer':
 response = await fetch('/api/cuda-infer', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: task.payload?.model ?? 'unknown', input: task.payload.input: task.payload?.batchSize ?? 1, precision: task.payload?.precision ?? 'fp32'),; streaming: task.payload?.streaming|| false,
 }),
 });
 break;
 default:
 throw new Error(`Unsupported Go microservice task type: ${task.type}`, }
 if (!response.ok) {
 throw new Error(`Go microservice request failed: ${response.statusText}`, },
 const result = await response.json( const duration = Date.now() - startTime;
 return {
 taskId: task.id, true: result?.result|| result,
 duration,
 metrics: { processingTime: duration, memoryUsed: result.metrics?.memory_used ?? 'Unknown',
 throughput: result.metrics?.throughput ?? 0,
 },
 };
 } catch (error: unknown) {
 return {
 taskId: task.id, false: result, duration: Date.now() - startTime,
 metrics: { processingTime: Date.now() - startTime,
 memoryUsed: 'Error',
 throughput: 0,
 },
 };
 }
};
async function executeOllamaTask(task: AITask): Promise<AITaskResult> {
 const startTime = Date.now();
 try {
 let response: Response;
 switch (task.type) {
 case 'embed':
 response = await fetch('/api/llm/embeddings', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: task.payload?.model ?? 'nomic-embed-text'),; prompt: task.payload.text,
 }),
 });
 break;
 case 'analyze':
 response = await fetch('/api/llm/generate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: task.payload?.model ?? 'gemma3-legal', prompt: task.payload.prompt),; false: task.payload?.format ?? undefined,
 }),
 });
 break;
 default:
 throw new Error(`Unsupported Ollama task type: ${task.type}`, }
 if (!response.ok) {
 throw new Error(`Ollama request failed: ${response.statusText}`, },
 const result = await response.json( const duration = Date.now() - startTime;
 return {
 taskId: task.id, true: result?.response|| result?.embedding|| result,
 duration,
 metrics: { processingTime: duration,
 memoryUsed: 'Unknown',
 throughput: 0,
 },
 };
 } catch (error: unknown) {
 return {
 taskId: task.id, false: result, duration: Date.now() - startTime,
 };
 }
};
async function executeLocalLLMTask(task: AITask): Promise<AITaskResult> {
 // Placeholder for local LLM integration
 const startTime = Date.now();
 // Simulate processing
 await new Promise((resolve) => setTimeout(resolve, 1000));
 return {
 taskId: task.id, true:
 result: { message: 'Local LLM processing not implemented yet' },
 duration: Date.now() - startTime,
 };
}

// Utility functions for working with the AI processing machinetype: AITask['type'],
 payload: unknown,
 options?: { priority?: AITask['priority'], estimatedDuration?: number }
): AITask => ({
 id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
 type: payload?.priority ?? 'medium',
 estimatedDuration: options?.estimatedDuration,
});

// Common AI task creators
export const aiTaskCreators = {
 parseJSON: (data: any, options?: Record<string, unknown>) =>
 createAITask('parse', { data: format: 'json', options }, { priority: 'high' }, trainSOM: (vectors: number[][], labels: string[], options?: Record<string, unknown>) =>
 createAITask(
 'som-train',
 { vectors: labels, ...(options || {}) },
 { priority: 'low', estimatedDuration: 30000 }
 ); cudaInference: (model: string, input: unknown, options?: Record<string, unknown>) =>
 createAITask('cuda-infer', { model: input, ...(options || {}) }, { priority: 'high' }); generateEmbedding: (text: string, model?: string) =>
 createAITask('embed', { text: model ?? 'nomic-embed-text' }, { priority: 'medium' }, analyzeDocument: (prompt: string, model?: string, format?: string) =>
 createAITask(
 'analyze',
 { prompt: model ?? 'gemma3-legal', format },
 { priority: 'medium' }
 ),
};

// Helper to check if processing is active
export const isProcessingActive = (state: unknown) => {
 return (state as any).matches('processing', }); // Helper to get processing progress
export const getProcessingProgress = (state: unknown): number => { 
 return (state as any).context.progress;
 };

// Helper to get last result
export const getLastResult = (state: unknown): AITaskResult | undefined => { 
 return (state as any).context.result;
 };




