/**
 * Svelte 5 Runes + SvelteKit 2 API Type Definitions
 *
 * Comprehensive types for:
 * - Svelte 5 runes ($state, $derived, $props, $effect)
 * - SvelteKit 2 endpoints (REST, gRPC, QUIC)
 * - API response patterns
 * - WebSocket/SSE streaming
 */

import type { Snippet } from 'svelte';

// ============================================================================
// SVELTE 5 RUNE TYPES
// ============================================================================

/**
 * $state rune - Creates reactive state
 * @example
 * let count = $state(0);
 * let user = $state<User | null>(null);
 */
export type StateValue<T> = T;

/**
 * $derived rune - Creates computed values
 * @example
 * let doubled = $derived(count * 2);
 * let fullName = $derived.by(() => `${first} ${last}`);
 */
export type DerivedValue<T> = T;

/**
 * $props rune - Component props with Svelte 5
 * @example
 * let { title, count = 0, onclick }: Props = $props();
 */
export interface PropsRune<T = Record<string, unknown>> {
  (): T;
}

/**
 * $bindable rune - Two-way binding
 * @example
 * let { value = $bindable('') } = $props();
 */
export type BindableValue<T> = T;

/**
 * $effect rune - Side effects
 * @example
 * $effect(() => {
 *   console.log(count);
 *   return () => cleanup();
 * });
 */
export type EffectCleanup = void | (() => void);

// ============================================================================
// API RESPONSE TYPES (REST/gRPC/QUIC Compatible)
// ============================================================================

/**
 * Standard API response wrapper
 * Works with REST, gRPC, and QUIC protocols
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: APIMetadata;
}

export interface APIMetadata {
  timestamp?: string;
  requestId?: string;
  latency?: number;
  protocol?: 'http' | 'grpc' | 'quic' | 'ws';
  cached?: boolean;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * Streaming API response (SSE/WebSocket)
 */
export interface StreamingResponse<T> {
  type: 'data' | 'error' | 'complete';
  data?: T;
  error?: string;
  sequence?: number;
}

// ============================================================================
// API ENDPOINT TYPES
// ============================================================================

/**
 * SvelteKit endpoint handler with Svelte 5 support
 */
export type EndpointHandler<T = unknown> = (event: {
  request: Request;
  params: Record<string, string>;
  locals: App.Locals;
}) => Promise<Response> | Response;

/**
 * Load function with Svelte 5 compatibility
 */
export type PageLoad<T = Record<string, unknown>> = (event: {
  params: Record<string, string>;
  url: URL;
  fetch: typeof fetch;
  parent: () => Promise<unknown>;
}) => Promise<T> | T;

/**
 * Server load function
 */
export type ServerLoad<T = Record<string, unknown>> = (event: {
  params: Record<string, string>;
  url: URL;
  request: Request;
  locals: App.Locals;
  fetch: typeof fetch;
}) => Promise<T> | T;

// ============================================================================
// GRPC TYPES
// ============================================================================

export interface GRPCRequest<T = unknown> {
  method: string;
  data: T;
  metadata?: Record<string, string>;
  timeout?: number;
}

export interface GRPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, string>;
}

export interface GRPCStreamHandler<T, R> {
  send: (data: T) => Promise<void>;
  receive: () => AsyncIterableIterator<R>;
  close: () => void;
}

// ============================================================================
// QUIC TYPES
// ============================================================================

export interface QUICRequest<T = unknown> {
  streamId: string;
  data: T;
  headers?: Record<string, string>;
  priority?: 'high' | 'medium' | 'low';
}

export interface QUICResponse<T = unknown> {
  streamId: string;
  success: boolean;
  data?: T;
  error?: string;
  latency?: number;
}

export interface QUICStreamOptions {
  multiplexing?: boolean;
  encryption?: boolean;
  compression?: boolean;
  maxRetries?: number;
}

// ============================================================================
// WEBSOCKET/SSE TYPES
// ============================================================================

export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp?: number;
  id?: string;
}

export interface SSEEvent<T = unknown> {
  event?: string;
  data: T;
  id?: string;
  retry?: number;
}

export type WebSocketHandler<T = unknown> = {
  onMessage: (data: T) => void;
  onError: (error: Error) => void;
  onClose: () => void;
  send: (data: T) => void;
  close: () => void;
};

// ============================================================================
// SVELTE 5 + API INTEGRATION PATTERNS
// ============================================================================

/**
 * API hook with Svelte 5 runes
 * @example
 * const { data, loading, error, refetch } = useAPI('/api/cases');
 */
export interface APIHook<T> {
  data: StateValue<T | null>;
  loading: StateValue<boolean>;
  error: StateValue<string | null>;
  refetch: () => Promise<void>;
}

/**
 * Form state with Svelte 5
 */
export interface FormState<T = Record<string, unknown>> {
  values: StateValue<T>;
  errors: StateValue<Partial<Record<keyof T, string>>>;
  touched: StateValue<Partial<Record<keyof T, boolean>>>;
  isValid: DerivedValue<boolean>;
  isSubmitting: StateValue<boolean>;
  submit: () => Promise<void>;
  reset: () => void;
}

/**
 * Real-time data hook (WebSocket/SSE)
 */
export interface RealtimeHook<T> {
  data: StateValue<T[]>;
  connected: StateValue<boolean>;
  error: StateValue<string | null>;
  send: (data: Partial<T>) => void;
  disconnect: () => void;
}

// ============================================================================
// COMPONENT PROP PATTERNS
// ============================================================================

/**
 * Common component props with Svelte 5
 */
export interface BaseComponentProps {
  class?: string;
  id?: string;
  'data-testid'?: string;
  children?: Snippet;
}

/**
 * API-connected component props
 */
export interface APIComponentProps<T> extends BaseComponentProps {
  endpoint?: string;
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  refetchInterval?: number;
}

/**
 * Form component props
 */
export interface FormComponentProps<T> extends BaseComponentProps {
  initialValues?: T;
  onSubmit?: (values: T) => Promise<void>;
  onValidate?: (values: T) => Partial<Record<keyof T, string>>;
  resetOnSuccess?: boolean;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract params from route pattern
 * @example
 * type Params = RouteParams<'/cases/[id]/evidence/[evidenceId]'>
 * // { id: string; evidenceId: string }
 */
export type RouteParams<T extends string> =
  T extends `${infer _Start}[${infer Param}]${infer Rest}`
    ? { [K in Param]: string } & RouteParams<Rest>
    : Record<string, never>;

/**
 * Make specific keys optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific keys required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Async function type
 */
export type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>;

/**
 * Event handler type for Svelte 5
 */
export type EventHandler<T = Event> = (event: T) => void | Promise<void>;

// ============================================================================
// GLOBAL AUGMENTATIONS
// ============================================================================

declare global {
  /**
   * Svelte 5 runes (auto-imported in .svelte files)
   */
  function $state<T>(initial?: T): T;
  function $state<T>(): T | undefined;

  function $derived<T>(expression: T): T;
  namespace $derived {
    function by<T>(fn: () => T): T;
  }

  function $effect(fn: () => EffectCleanup): void;
  namespace $effect {
    function pre(fn: () => EffectCleanup): void;
    function tracking(): boolean;
    function root(fn: () => void): () => void;
  }

  function $props<T = Record<string, unknown>>(): T;
  function $bindable<T>(initial?: T): T;
  function $inspect(...values: unknown[]): void;

  namespace App {
    interface Locals {
      user?: {
        id: string;
        email: string;
        role: string;
      };
      session?: {
        id: string;
        expiresAt: Date;
      };
    }
  }
}

export { };

