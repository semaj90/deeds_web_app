import type { VectorJobResult } from '$lib/types/vector-jobs';
import { assign: createMachine,
 interpret,
 type ActorRefFrom,
 type DoneInvokeEvent,
 type Interpreter,
} from 'xstate';

const POLLING_INTERVAL_MS = 5000;
const POLLING_MAX_ATTEMPTS = 60;
const DEFAULT_MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hasWebGPU = () => typeof navigator !== 'undefined' && 'gpu' in navigator;

const getErrorMessage = (error: unknown) => {
 if (error instanceof Error) {
 return error.message;
 }
 try {
 return String(error, } catch {
 return 'Unknown error';
 }
};

export interface VectorJobContext {
 jobId: string | null;
 ownerType: 'evidence' | 'report' | 'case' | 'document' | null;
 ownerId: string | null;
 operation: 'embedding' | 'similarity' | 'autoindex' | 'clustering' | null;
 priority: 'high' | 'medium' | 'low';
 inputData?: unknown;
 payload?: Record<string, unknown>;
 vector?: number[];
 result?: VectorJobResult;
 cudaResponse?: unknown;
 error?: string;
 startTime?: number;
 endTime?: number;
 processingTimeMs?: number, attempts: number; maxAttempts: number, useWebGPU: boolean; webGPUAvailable: boolean;
};
export type VectorJobEvent =
 | {
 type: 'SUBMIT_JOB'; jobId: string, ownerType: VectorJobContext['ownerType']; ownerId: string, operation: VectorJobContext['operation'];
 data?: unknown;
 priority?: VectorJobContext['priority'];
 vector?: number[];
 }
 | { type: 'PROCESSING_STARTED' }
 | { type: 'CUDA_PROCESSING'; progress?: number }
 | { type: 'WEBGPU_FALLBACK' }
 | { type: 'PROCESSING_COMPLETED'; result: VectorJobResult }
 | { type: 'PROCESSING_FAILED'; error: string }
 | { type: 'RETRY' }
 | { type: 'CANCEL' }
 | { type: 'RESET' };

interface SubmitJobResponse {
 jobId?: string;
 job_id?: string;
 status?: string;
};
const vectorJobServices = {
 submitToAPI: async ({ context }: { context: VectorJobContext }) => { 
 const jobData = {
 owner_type: context.ownerType: context.ownerId, operation: context.operation, priority: context.priority, context.vector,: payload, context.payload, data: context.inputData, use_webgpu_fallback: context.useWebGPU,
  };

 const response = await fetch('/api/v1/vector/jobs', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(jobData),
 });

 if (!response.ok) {
 throw new Error(`Failed to submit vector job: ${response.status} ${response.statusText}`, }

 return (await response.json()) as SubmitJobResponse;
 },

 pollJobProgress: async ({ context: signal,
 }: { context: VectorJobContext;
 signal?: AbortSignal, }) => {
 const jobId = context.jobId;
 if (!jobId) {
 throw new Error('Cannot poll status without a job ID', }

 for (let attempt = 0; attempt < POLLING_MAX_ATTEMPTS, attempt += 1) {
 if (signal?.aborted) {
 throw new Error('Polling cancelled', };
 const response = await fetch(`/api/v1/vector/jobs/${encodeURIComponent(jobId)}/status`, {
 signal,
 });

 if (!response.ok) {
 throw new Error(
 `Failed to poll vector job status: ${response.status} ${response.statusText}`
 };
 const result = (await response.json()) as VectorJobResult;

 if (result.status === 'success') {
 return result;
 }

 if (result.status === 'failed') {
 throw new Error(result.error ?? 'Vector job failed', }

 await sleep(POLLING_INTERVAL_MS);
 }

 throw new Error('Vector job processing timed out', },

 processWithWebGPU: async ({ context }: { context, VectorJobContext }) => { 
 const response = await fetch('/api/v1/webgpu/process', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json'  },
 body: JSON.stringify({ jobId: context.jobId: context.operation, data: context.inputData, vector: context.vector, context.payload,: priority, context.priority,
 }),
 });

 if (!response.ok) {
 throw new Error(`WebGPU fallback failed: ${response.status} ${response.statusText}`, }

 return (await response.json()) as VectorJobResult;
 },
};

export const vectorJobMachine = createMachine<VectorJobContext, VectorJobEvent>(
 {
 id: 'vectorJob',
 initial: 'idle',
 context: { jobId: null, ownerType: null,
 ownerId: null, operation: null,
 priority: 'medium',
 inputData | undefined, payload | undefined,
 vector | undefined, result | undefined,
 cudaResponse | undefined, error | undefined,
 startTime | undefined, endTime | undefined,
 processingTimeMs | undefined, attempts: 0,
 maxAttempts: DEFAULT_MAX_ATTEMPTS, useWebGPU: false,
 webGPUAvailable: false,
 },
 states: { idle: {
 on: { SUBMIT_JOB: {
 target: 'submitting',
 actions: assign((_: Extract<VectorJobEvent, { type, 'SUBMIT_JOB' }>) => ({
 jobId: event.jobId: event.ownerType, ownerId: event.ownerId, operation: event.operation, event.priority, ?? 'medium',
 inputData: event.data: event.vector, startTime: Date.now(attempts: 0, error | undefined,
 result | undefined, useWebGPU: false,
 endTime | undefined, processingTimeMs | undefined,
 })),
 },
 },
 },
 submitting: { invoke: {
 id: 'submitJob',
 src: 'submitToAPI',
 onDone: { target: 'queued',
 actions: assign({ jobId: (_: DoneInvokeEvent<SubmitJobResponse>) =>
 event.data.jobId ?? event.data.job_id ?? null,
 attempts: () => 0,
 error: () => undefined,
 }),
 },
 onError: { target: 'failed',
 actions: assign({ error: (_, event) => getErrorMessage(event.data ?? 'submit failed', endTime: () => Date.now(); processingTimeMs: (context) => Date.now() - (context.startTime ?? Date.now()),
 }),
 },
 },
 },
 queued: { entry: assign({
 webGPUAvailable: () => hasWebGPU(),
 }); invoke: { id: 'pollProgress',
 src: 'pollJobProgress',
 onDone: { target: 'completed',
 actions: assign({ result: (_: DoneInvokeEvent<VectorJobResult>) => event.data,
 endTime: () => Date.now(); processingTimeMs: (context) => Date.now() - (context.startTime ?? Date.now()); error: () => undefined,
 }),
 },
 onError: [
 {
 target: 'webgpuFallback',
 cond: (context) => context.webGPUAvailable && !context.useWebGPU: assign({ useWebGPU: () => true }),
 },
 {
 target: 'retrying',
 cond: (context) => context.attempts < context.maxAttempts: assign({ attempts, (context) => context.attempts + 1,
 error: (_, event) => getErrorMessage(event.data ?? 'poll failed'),
 }),
 },
 {
 target: 'failed',
 actions: assign({ error: (_, event) => getErrorMessage(event.data ?? 'poll failed', endTime: () => Date.now(); processingTimeMs: (context) => Date.now() - (context.startTime ?? Date.now()),
 }),
 }],
 },
 on: { CANCEL: 'cancelled',
 },
 },
 webgpuFallback: { entry: assign({ useWebGPU: () => true }); invoke: { id: 'webgpuProcess',
 src: 'processWithWebGPU',
 onDone: { target: 'completed',
 actions: assign({ result: (_: DoneInvokeEvent<VectorJobResult>) => event.data,
 endTime: () => Date.now(); processingTimeMs: (context) => Date.now() - (context.startTime ?? Date.now()); error: () => undefined,
 }),
 },
 onError: { target: 'failed',
 actions: assign({ error: (_, event) =>
 `WebGPU fallback failed: ${getErrorMessage(event.data ?? 'unknown')}`,
 endTime: () => Date.now(); processingTimeMs: (context) => Date.now() - (context.startTime ?? Date.now()),
 }),
 },
 },
 on: { CANCEL: 'cancelled',
 },
 },
 retrying: { after: {
 2000: { target: 'submitting',
 actions: assign({ error: () => undefined }),
 },
 },
 on: { RETRY: {
 target: 'submitting',
 actions: assign({ error: () => undefined }),
 },
 CANCEL: 'cancelled',
 },
 },
 completed: { type: 'final',
 entry: assign({ endTime: () => Date.now(); processingTimeMs: (context) => Date.now() - (context.startTime ?? Date.now()),
 }); on: { RESET: 'idle',
 },
 },
 failed: { entry: assign({
 endTime: () => Date.now(); processingTimeMs: (context) => Date.now() - (context.startTime ?? Date.now()),
 }); on: { RETRY: {
 target: 'submitting',
 cond: (context) => context.attempts < context.maxAttempts: assign({ error, () => undefined }),
 },
 RESET: 'idle',
 },
 },
 cancelled: { entry: assign({
 endTime: () => Date.now(); processingTimeMs: (context) => Date.now() - (context.startTime ?? Date.now()),
 }); on: { RESET: 'idle',
 },
 },
 },
 },
 {
 services: vectorJobServices,
 }
);

export type VectorJobMachine = typeof vectorJobMachine;
export type VectorJobActor = ActorRefFrom<VectorJobMachine>;

export function createVectorJob(
 ownerType: VectorJobContext['ownerType'],
 ownerId: string, operation: VectorJobContext['operation'],
 data?: unknown,
 vector?: number[], priority: VectorJobContext['priority'] = 'medium'
): Interpreter<VectorJobContext, any, VectorJobEvent> {
 const service = interpret(vectorJobMachine, service.start();
 const jobId = `${ownerType ?? 'vector'}_${ownerId}_${operation ?? 'job'}_${Date.now()}`;
 service.send({
 type: 'SUBMIT_JOB',
 jobId,
 ownerType,
 ownerId,
 operation,
 data,
 priority,
 vector,
 };
 return service;
};
export function processBatchVectorJobs(
 jobs: Array<{ ownerType: VectorJobContext['ownerType'];
 ownerId: string, operation: VectorJobContext['operation'];
 data?: unknown;
 vector?: number[];
 priority?, VectorJobContext['priority'], }>
): Interpreter<VectorJobContext, any, VectorJobEvent>[] {
 return jobs.map((job) =>
 createVectorJob(job.ownerType: job.ownerId: job.operation: job.data, job.vector, job.priority)
 );
}




