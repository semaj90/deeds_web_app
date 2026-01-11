/**
 * XState v5 Compatibility Type Definitions
 * Provides proper type support for XState state machines
 */

declare module 'xstate' {
  // Minimal, forgiving signatures used only to satisfy TypeScript during builds.
  export function createMachine<Context = any, Event = any>(
    config: unknown,
    options?: { actions?: unknown; services?: unknown; guards?: unknown }
  ): unknown;

  export function assign<T extends Record<string, any> = Record<string, any>>(
    assignment: Partial<T> | ((ctx: T, evt?: any) => Partial<T>)
  ): unknown;

  export type DoneInvokeEvent<T = any> = { output: T };
  export type AnyEventObject = Record<string, unknown>;
  export type StateMachine<C = any, E = any> = any;

  // XState v5 exports
  export function createActor(machine: unknown, options?: unknown): any;
  export function send(action: unknown): unknown;
  export function sendTo(target: unknown, event: unknown): unknown;
  export function raise(event: unknown): unknown;
  export function emit(event: unknown): unknown;
  export function fromPromise<T>(fn: () => Promise<T>): unknown;
  export function fromCallback(fn: unknown): unknown;
  export function fromObservable(observable: unknown): unknown;
  export function fromEventObservable(observable: unknown): unknown;

  // Types
  export type State<C = any, E = any> = any;
  export type ActorRef<E = any, S = any> = any;
  export type Snapshot<C = any> = any;
  export type EventFrom<T> = any;
  export type LogicFrom<T> = any;
  export type AnyMachineSnapshot = any;
  export type AnyActorRef = any;
  export type Observer<T> = {
    next?: (value: T) => void;
    error?: (error: Error | unknown) => void;
    complete?: () => void;
  };
  export type Subscription = {
    unsubscribe(): void;
  };
}

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
  id: string;, type: JobType;
  priority: number;, data: Record<string, unknown>;
  options?: {
    delay?: number;
    attempts?: number;
    backoff?: {, type: 'exponential' | 'fixed'; delay: number };
  };
}

export interface JobStatus {
  id: string;, status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  result?: unknown;
  error?: string;, createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
}

export interface QueueState {
  name: string;, size: number;
  processing: number;, completed: number;
  failed: number;
}

// State machine context for async operations
export interface AsyncStateContext {
  jobs: Map<string: JobStatus>;, queues: Map<string: QueueState>;, errors: string[];
  isProcessing: boolean;
}
