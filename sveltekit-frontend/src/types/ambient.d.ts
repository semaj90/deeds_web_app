// Minimal, forgiving ambient declarations to reduce noisy type errors during iterative fixes.
// Add more specific typings progressively as files are stabilized.

declare module '$lib/shims/xstate' {
	export function createMachine(...args: any[]): any;
	export function assign(...args: any[]): any;
	export function fromPromise(...args: any[]): any;
	export type AnyEventObject = Record<string, unknown>;
}

declare module '$lib/schemas/evidence-upload' {
	export type VideoMetadata = {
		id?: string;
		filename?: string;
		duration?: number;
		size?: number;
		uploadedAt?: string;
	};
}

declare module '../stores/auth.svelte.js' {
	export type User = { id?: string; name?: string; email?: string; roles?: string[] };
	const user: User | null;
	export default user;
}

declare module '$app/environment' {
	export const browser: boolean;
	export const dev: boolean;
}

declare module '$env/dynamic/private' {
	export const env: Record<string, string>;
}

declare module 'fabric' {
	const fabric: any;
	export default fabric;
}

/** Redis client surface used across the codebase (trimmed) */
declare interface SimpleRedis {
	connect(...args: any[]): Promise<unknown>;
	disconnect(...args: any[]): Promise<unknown>;
	ping(...args: any[]): Promise<unknown>;
	quit(...args: any[]): Promise<unknown>;
	xAdd(...args: any[]): Promise<unknown>;
	xadd(...args: any[]): Promise<unknown>;
	keys(...args: any[]): Promise<string[]>;
	info(...args: any[]): Promise<unknown>;
	status?: unknown;
	isOpen?: boolean;
	dbsize(...args: any[]): Promise<number>;
	get(...args: any[]): Promise<unknown>;
	set(...args: any[]): Promise<unknown>;
	/** Set key with expiry (seconds) */
	setex(key: string, seconds: number, value: string): Promise<unknown>;
	/** Push value(s) to list (left) */
	lpush(key: string, ...values: unknown[]): Promise<number | unknown>;
	/** Range query for list */
	lrange(key: string, start: number, stop: number): Promise<unknown[]>;
	del(...args: unknown[]): Promise<unknown>;
	/** Set key expiry in seconds */
	expire(key: string, seconds: number): Promise<number | unknown>;
	publish(channel: string, message: string): Promise<number | unknown>;
	subscribe(...args: unknown[]): Promise<unknown>;
	psubscribe(...args: unknown[]): Promise<unknown>;
	on(event: string, cb: (...args: unknown[]) => void): void;
	pipeline(...args: unknown[]): {
		lpush?: (...a: unknown[]) => unknown;
		ltrim?: (...a: unknown[]) => unknown;
		expire?: (...a: unknown[]) => unknown;
		exec?: (...a: unknown[]) => unknown;
	};
	/** Redis JSON module methods */
	json?: {
		get(key: string, path?: string): Promise<unknown>;
		set(key: string, path: string, data: unknown): Promise<unknown>;
		del(key: string, path?: string): Promise<unknown>;
		type(key: string, path?: string): Promise<string | null>;
	};
	/** Redis Streams helpers used by some workers */
	xInfoStream(stream: string): Promise<unknown>;
	xRevRange(stream: string, start: string, end: string, opts?: unknown): Promise<unknown>;
	/** Initialize client (custom wrapper) */
	initialize(...args: unknown[]): Promise<unknown> | void;
	memory(...args: unknown[]): Promise<unknown>;
	type(...args: unknown[]): Promise<string>;
}

/** CommonJS-style redis module export (typings for legacy imports) */
declare module 'redis' {
	const Redis: { createClient?: (...args: unknown[]) => SimpleRedis } & unknown;
	export = Redis;
}

/* Server/db module stubs used in the codebase */
declare module '$lib/server/db/client.js' {
	/** Minimal typed exports for common query usage in the codebase */
	export function query<T = unknown>(sql: string, params?: unknown[]): Promise<DBQueryResult<T>>;
	export function ensureEvidenceTable(): Promise<void> | void;
	const client: DBClient;
	export default client;
}

declare module '$lib/server/db/drizzle' {
	const enhanced_db: unknown;
	export { enhanced_db };
	export default enhanced_db;
}

declare module '$lib/server/db/index' {
	export const isPostgreSQL: unknown;
	export const users: unknown;
	const _default: unknown;
	export default _default;
}

declare module '$lib/server/database' {
	export const documents: unknown;
	export const embeddings: unknown;
	export const searchSessions: unknown;
	const _default: unknown;
	export default _default;
}

declare module '$lib/server/redis-service' {
	export const redisService: SimpleRedis;
	const _default: SimpleRedis;
	export default _default;
}

declare module '$lib/services/nomic-embedding-service' {
	const nomicEmbeddings: unknown;
	export { nomicEmbeddings };
	export default nomicEmbeddings;
}

/* Generic catch-all for unstable internal modules */
declare module '$lib/*' {
	const whatever: unknown;
	export default whatever;
}

/* Common shapes referenced across the codebase */
declare interface RowList<T = unknown[]> {
	rows?: T;
	data?: T;
	count?: number;
	error?: unknown;
	[k: string]: any;
}

declare interface DBQueryResult<T = unknown> {
	rows?: T[];
	rowCount?: number;
	command?: string;
	[k: string]: any;
}

declare interface DBClient {
	query?: <T = unknown>(sql: string, params?: unknown[]) => Promise<DBQueryResult<T>>;
	execute?: (sql: string, params?: unknown[]) => Promise<unknown>;
	close?: () => Promise<void> | void;
	[k: string]: any;
}

declare type WithContext<T = unknown> = T & { context?: unknown; value?: unknown };

declare interface VectorSearchResult {
	id?: string;
	excerpt?: string;
	created_at?: string;
	createdAt?: string;
	title?: string;
	content?: unknown;
	type?: string;
	metadata?: { [k: string]: any } | unknown;
	[k: string]: unknown;
}

declare interface SearchResult {
	id?: string;
	title?: string;
	type?: string;
	content?: unknown;
	score?: number;
	similarity?: number;
	metadata?: { [k: string]: any } | unknown;
	highlights?: unknown;
	createdAt?: string;
	[k: string]: unknown;
}

declare interface EmbeddingResult {
	vector?: number[];
	payload?: unknown;
	relevance?: number;
	[k: string]: any;
}

declare interface ProcessingResult {
	entities?: unknown[];
	citations?: unknown[];
	vectorAnalysis?: unknown;
	[k: string]: any;
}

declare interface LegalCitation {
	title?: string;
	location?: string;
	url?: string;
	[k: string]: any;
}

declare interface BitsUICompatibleData {
	[k: string]: any;
}

declare interface OrchestrationResult {
	[k: string]: any;
}

declare interface EnhancedOllamaService {
	extractLegalEntities?: (...args: unknown[]) => Promise<unknown> | unknown;
	classifyLegalDocument?: (...args: unknown[]) => Promise<unknown> | unknown;
	generateEmbeddings?: (...args: unknown[]) => Promise<unknown> | unknown;
	generateLegalEmbeddings?: (...args: unknown[]) => Promise<unknown> | unknown;
	generate?: (...args: unknown[]) => Promise<unknown> | unknown;
	healthCheck?: (...args: unknown[]) => Promise<unknown> | unknown;
	[k: string]: unknown;
}

declare interface LibraryDocsResponse {
	content?: string;
	metadata?: { library?: string; topic?: unknown; tokenCount?: number } | unknown;
	snippets?: Array<unknown> | unknown;
	error?: { message?: string; code?: string } | unknown;
	[k: string]: unknown;
}

/** Convenience aliases */
declare type RowListOfRecords = RowList<Record<string, unknown>[]>;
declare type TableParam = string | { name?: string } | unknown;
declare type ResultLike<T = Record<string, unknown>> = DBQueryResult<T> | RowList<T[]> | unknown;
declare type ItemLike = Record<string, unknown> | unknown;


