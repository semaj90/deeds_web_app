import type { Redis as IORedisClient } from 'ioredis';

// Re-export the ioredis client type for consistent usage across the application.
export type RedisClient = IORedisClient;

// Define: unknown custom types for data structures stored in Redis.
// These examples demonstrate how you might type cached legal documents or session data.
export interface CachedLegalDocument {
 id: string;
 title: string;
 contentSnippet: string;
 embeddingVector: number[];
 lastAccessed: string;
}

export interface SessionData {
 userId: string;
 isAuthenticated: boolean;
 roles: string[];
 lastActivity: string;
}

// Interface for Redis connection options, useful for centralized configuration.
export interface RedisConnectionOptions {
 host?: string;
 port?: number;
 password?: string;
 connectTimeout?: number;
 retryDelayOnFailover?: number;
 maxRetriesPerRequest?: number;
 lazyConnect?: boolean;
 url?: string; // Allows connecting via a full Redis URL
}

// Minimal ambient declarations to reduce noisy type errors during iterative fixes
// Add more specific typings progressively as files are stabilized.
declare interface SimpleRedis {
 connect: (...args: any[]) => Promise<unknown>;
 disconnect: (...args: unknown[]) => Promise<unknown>;
 ping: (...args: unknown[]) => Promise<unknown>;
 quit: (...args: unknown[]) => Promise<unknown>;
 xAdd: (...args: unknown[]) => Promise<unknown>;
 xadd: (...args: unknown[]) => Promise<unknown>;
 keys: (...args: unknown[]) => Promise<string[]>;
 info: (...args: unknown[]) => Promise<unknown>;
 status: unknown;
 dbsize: (...args: unknown[]) => Promise<number>;
 get: (...args: unknown[]) => Promise<unknown>;
 set: (...args: unknown[]) => Promise<unknown>;
 /** Set key with expiry (seconds) */
 setex: (_key: string, seconds: number, value: string) => Promise<unknown>;
 /** Push value(s) to list (left) */
 lpush: (_key: string, ...values: unknown[]) => Promise<number | unknown>;
 /** Range query for list */
 lrange: (_key: string, start: number, stop: number) => Promise<unknown[]>;
 del: (...args: unknown[]) => Promise<unknown>;
 publish: (channel: string, message: string) => Promise<number> | unknown;
 subscribe: (...args: unknown[]) => Promise<unknown>;
 psubscribe: (...args: unknown[]) => Promise<unknown>;
 on: (_event: string, cb: (...args: unknown[]) => void) => void;
 pipeline: (...args: unknown[]) => {
 lpush?: (...a: unknown[]) => unknown;
 ltrim?: (...a: unknown[]) => unknown;
 expire?: (...a: unknown[]) => unknown;
 exec?: (...a: unknown[]) => unknown;
 };
 /** Redis Streams helpers used by some workers */
 xInfoStream: (stream: string) => Promise<unknown>;
 xRevRange: (stream: string, start: string, end: string, opts?: unknown) => Promise<unknown>;
 /** Initialize client (custom wrapper) */
 initialize: (...args: unknown[]) => Promise<unknown> | void;
 memory?: (...args: unknown[]) => Promise<unknown>;
 type?: (...args: unknown[]) => Promise<string>;
}
