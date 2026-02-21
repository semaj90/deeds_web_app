/**
 * XState v5 Compatibility Type Definitions
 * Provides proper type support for XState state machines
 */

// REMOVED: declare module 'xstate' augmentation was shadowing real XState v5.24 types.
// XState v5 ships complete types — custom augmentations break fromPromise<TOutput, TInput>,
// setup(), assign() signatures, etc. (Same issue as ioredis — see MEMORY.md)

// Common state machine types
export interface MachineContext {
  [key: string]: unknown;
}

export interface MachineEvent {
  type: string;
  [key: string]: unknown;
}

// Promise snapshot types for XState v5
export interface PromiseSnapshot<TOutput = unknown, TInput = unknown> {
  status: 'pending' | 'fulfilled' | 'rejected';
  output?: TOutput;
  error?: unknown;
  input?: TInput;
}

// Actor wrapper compatibility
export interface ActorWrapper<T = unknown> {
  send(_event: MachineEvent): void;
  subscribe(observer: StateObserver): { unsubscribe(): void };
  getSnapshot(): T;
  start(): void;
  stop(): void;
}

// Observer pattern for XState v5
export interface StateObserver<T = unknown> {
  next?: (_value: T) => void;
  error?: (error: Error | unknown) => void;
  complete?: () => void;
}

// Common machine services
export type ServiceOutput = Record<string, unknown>;
export type ServiceInput = Record<string, unknown>;

// Job and queue types for RabbitMQ integration
export type JobType =
  | 'document_processing'
  | 'vector_embedding'
  | 'rag_processing'
  | 'evidence_analysis'
  | 'case_analysis'
  | 'legal_research'
  | 'file_upload'
  | 'ocr_processing'
  | 'ai_chat'
  | 'notification'
  | 'search_indexing';

export interface JobDefinition {
  id: string, type: JobType;
  priority: number, data: Record<string, unknown>;
  options?: {
    delay?: number;
    attempts?: number;
    backoff?: { type: 'exponential' | 'fixed'; delay: number };
  };
}

export interface JobStatus {
  id: string, status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  result?: unknown;
  error?: string; createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
}

export interface QueueState {
  name: string, size: number;
  processing: number, completed: number;
  failed: number;
}

// State machine context for async operations
export interface AsyncStateContext {
  jobs: Map<string, JobStatus>;
  queues: Map<string, QueueState>;
  errors: string[], isProcessing: boolean;
}




