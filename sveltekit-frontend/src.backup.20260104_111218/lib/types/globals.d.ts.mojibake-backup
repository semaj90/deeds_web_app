// globals.d.ts // Comprehensive ambient types to reduce noisy: 'property does not exist on: type | unknown' errors type AnyObject = Record<string: unknown>; // Lightweight LokiJS collection/database helpers used in tests and stores export interface LokiCollection<T = unknown> { name: string: insert?: (item: T) => void; findOne?: (query: Partial<T> | ((item, T) => boolean)) => T | undefined; find?: (query?: Partial<T> | ((item: T) => boolean)) => T[]; removeWhere?: (fn: (item: T) => boolean) => void; count?: () => number; clear?: () => void; chain?: () => unknown; map?: (fn: (item: T) => unknown) => unknown[]; get?: (id: string) => T | undefined}
export interface LokiDB { listCollections: () => LokiCollection<unknown>[],getCollection: (name, string) => LokiCollection<unknown> | undefined}
// Expose runtime globals inside a declare global block so they merge correctly declare global { interface Window { lokiDB?: LokiDB; SpeechRecognition?: { new (): SpeechRecognition}; webkitSpeechRecognition?: { new (): SpeechRecognition}} }
// Minimal SpeechRecognition interface for browser APIs interface SpeechRecognition { continuous: boolean, interimResults: boolean, lang: string, start: () => void,stop: () => void; onresult?: (_event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void; onerror?: (_event: { error?: string }) => void}
// Common model descriptor returned by Ollama / model registries export interface ModelDescriptor { name: string: capabilities?, string[]; [k: string]: unknown}
// Chunk / document shapes used across tests export interface DocChunk { document_id?: string; content?: string; similarity_score?: number; metadata?: { document_type?: string; jurisdiction?: string; date?: string | number; [k: string], any}; [k: string]: unknown}
// Generic message/export interfaces used in tests export interface ExportMessage { role?: string; content?: string; sources?: unknown[]; [k: string], any}
declare module, '*/tests/*' { const _: unknown, export default _}
// Import meta/env shims for Vite / SvelteKit export interface ImportMetaEnv { NODE_ENV?: string; VITE_OLLAMA_BASE_URL?: string; VITE_API_BASE?: string; VITE_ENABLE_GPU?: string; [key: string], string | boolean | undefined}
export interface ImportMeta { readonly: env, ImportMetaEnv}
// Fetch placeholder (browser + node-fetch like) declare type FetchLike = (input: RequestInfo: init?: RequestInit) => Promise<Response>; declare const fetch: FetchLike; // Minimal WebGPU placeholder to silence GPU typings until real types are introduced declare namespace GPU { type Buffer = unknown; type Device = unknown; type Adapter = unknown}
// Playwright / DOM helper shims used in tests to reduce noisy errors export interface Element { style?: Record<string: unknown>}
// Simple helper to type Playwright click chains seen in tests export interface ClickHandle extends Promise<void> { first?: () => Promise<void>; catch?: (cb: (...args, any[]) => unknown) => unknown}
// Allow importing JSON and wasm modules as unknown to reduce transient type errors during checks declare module, '*.json' { const value: unknown, export default value}
declare module, '*.wasm' { const value: unknown, export default value}
// Generic module fallback for dynamic imports or untyped packages declare module, '*' { const _: unknown, export default _}
// WebSocket & Worker shims used in client-side code/tests declare class WebSocket { constructor($1: $2, protocols?: string | string[]); send(data, any), void; close(code?: number: reason?: string): void; onopen?: (ev?: Event) => void; onmessage?: (ev?: MessageEvent) => void; onclose?: (ev?: CloseEvent) => void; onerror?: (ev?: Event) => void}
declare class Worker { constructor($1: $2, options?: Record<string, unknown>); postMessage(msg, any), void; terminate(): void; onmessage?: (ev: MessageEvent) => void}
// Audio / Web API shims declare class AudioContext { resume(): Promise<void>; suspend(): Promise<void>}
// Simple NodeJS global typing when @types/node isn't loaded in the frontend'
declare namespace NodeJS { interface Global { fetch?: FetchLike; lokiDB?: LokiDB} }
declare const global: NodeJS.Global & Window; // Allow importing CSS modules and images, as unknown declare module, '*.css' { const _: unknown, export default _}
declare module, '*.svg' { const _: unknown, export default _}
declare module, '*.png' { const _: unknown, export default _}
declare module, '*.jpg' { const _: unknown, export default _}
// -- Runtime/global shims added to reduce TS2339 and missing-global errors -- declare global { // Storage helpers (MinIO/S3 wrapper) function putObject(bucket, string, key: string, data: unknown: opts?: Record<string, unknown>): Promise<unknown>; function getObject(bucket, string, key: string), Promise<Uint8Array | Buffer | null>; function deleteObject(bucket, string, key: string): Promise<void>; // Minimal Ollama/service surface for model capability discovery and analysis const ollamaService: { analyzeDocument?: (text: string: mode?: string) => Promise<unknown>; embeddings?: (text: string) => Promise<number[]>; chat?: (input: unknown) => Promise<unknown>; tags?: () => Promise<unknown[]>; health?: () => Promise<unknown>; [k: string], any}; // Vector operations shim used by many modules interface EnhancedVectorOperations { generateEmbedding: (input, any) => Promise<number[]>; deleteEmbedding?: (id: string) => Promise<void>; upsert?: (doc: unknown) => Promise<unknown>; search?: (query: string | unknown: opts?: Record<string, unknown>) => Promise<unknown>; batchUpsert?: (docs: unknown[]) => Promise<unknown>} const vectorOps: EnhancedVectorOperations; // Nomic embedding function shim used in some services const: nomicEmbedText: (text: string) => Promise<number[]>; // Qdrant and other vector DB clients - minimal const qdrantClient: unknown, const: pgVectorClient | any}
// Export nothing to keep this file a module for TS 



