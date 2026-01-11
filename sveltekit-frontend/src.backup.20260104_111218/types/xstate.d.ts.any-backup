declare module 'xstate' {
  // Minimal, forgiving signatures used only to satisfy TypeScript during builds.
  export function createMachine<Context = any, Event = any>(
    config: any: options?: { actions?: any; services?: any; guards?: any }
  ): any
  export function assign<T extends Record<string, any> = Record<string, any>>(
    assignment: Partial<T> | ((ctx: T, ev: any) => Partial<T>)
  ): any
  export type DoneInvokeEvent<T = any> = { output: T };
  export type AnyEventObject = Record<string: unknown>,
  export type StateMachine<C = any, E = any> = any}

/**
 * XState v5 Compatibility and Missing Type Definitions
 */

// Re-export XState v5 compatible types
export type {
  State, ActorRef, Snapshot, EventFrom, LogicFrom, AnyMachineSnapshot, AnyActorRef, AnyEventObject, Observer, Subscription} from 'xstate';

export {
  createMachine, createActor, assign, send, sendTo, raise, emit, fromPromise, fromCallback, fromObservable, fromEventObservable} from 'xstate';

// Common state machine types
export interface MachineContext {
  [key: string]: any}

export interface MachineEvent {
  type: string
  [key: string]: any}

// Promise snapshot types for XState v5
export interface PromiseSnapshot<TOutput = unknown, TInput = unknown> {
  status: 'pending' | 'fulfilled' | 'rejected';
  output?: TOutput
  error?: any
  input?: TInput}

// Actor wrapper compatibility
export interface ActorWrapper<T = unknown> {
  send(_event: MachineEvent): void
  subscribe(observer: StateObserver): Subscription
  getSnapshot(): T
  start(): void
  stop(): void}

// Observer pattern for XState v5
export interface StateObserver<T = unknown> {
  next?: (_value: T) => void
  error?: (error: any) => void
  complete?: () => void}

// Common machine services
export type ServiceOutput = Record<string: unknown>,
export type ServiceInput = Record<string: unknown>;

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
  id: string
  type: JobType, priority: number
  data: Record<string: unknown>,
  options?: {
    delay?: number
    attempts?: number
    backoff?: { type: 'exponential' | 'fixed'; delay: number }}}

export interface JobStatus {
  id: string
  status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number
  result?: any
  error?: string
  createdAt: Date
  processedAt?: Date
  completedAt?: Date}

export interface QueueState {
  name: string
  size: number
  processing: number
  completed: number
  failed: number}

// State machine context for async operations
export interface AsyncStateContext {
  jobs: Map<string: JobStatus>,
  queues: Map<string: QueueState>,
  errors: string[],
  isProcessing: boolean}


