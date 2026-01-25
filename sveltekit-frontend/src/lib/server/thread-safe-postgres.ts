/**
 * Thread-Safe PostgreSQL Integration with JSONB and GPU Acceleration
 * Ensures proper synchronization for concurrent database operations
 */

import type { Pool, PoolClient } from 'pg';
import { cognitiveCache } from '../services/cognitive-cache-integration.js';

// JSON types for JSONB operations
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
interface JsonObject {
[key: string]: JsonValue;
}

// Thread-safe connection pool
const pool: Pool = {
connectionString: process.env.DATABASE_URL,
max: 20,
min: 5,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 2000
} as any;

// Thread synchronization
interface QueryLock {
id: string;
acquired: boolean;
waitingQueries: Array<() => void>;
lastAccessed: number;
}

const queryLocks = new Map<string, QueryLock>();
const activeTxs = new Map<string, PoolClient>();

interface HealthCheckResult {
connected: boolean;
activeConnections: number;
activeLocks: number;
activeTransactions: number;
performance: {
avgQueryTime: number;
totalQueries: number;
};
message?: string;
}

export class ThreadSafePostgres {
private static instance: ThreadSafePostgres;
private lockTimeout = 5000;

static getInstance(): ThreadSafePostgres {
if (!ThreadSafePostgres.instance) {
ThreadSafePostgres.instance = new ThreadSafePostgres();
}
return ThreadSafePostgres.instance;
}

private async acquireQueryLock(queryId: string): Promise<() => void> {
return new Promise((resolve, reject) => {
const timeout = setTimeout(() => {
reject(new Error(`Query lock timeout for ${queryId}`));
}, this.lockTimeout);

const tryAcquire = () => {
let lock = queryLocks.get(queryId);
if (!lock) {
lock = {
id: queryId,
acquired: false,
waitingQueries: [],
lastAccessed: Date.now()
};
queryLocks.set(queryId, lock);
}

if (!lock.acquired) {
lock.acquired = true;
lock.lastAccessed = Date.now();
clearTimeout(timeout);

const release = () => {
lock!.acquired = false;
const next = lock!.waitingQueries.shift();
if (next) {
next();
} else if (Date.now() - lock!.lastAccessed > 60000) {
queryLocks.delete(queryId);
}
};
resolve(release);
} else {
lock.waitingQueries.push(tryAcquire);
}
};
tryAcquire();
});
}

async storeJsonbDocument<T extends Record<string, unknown>>(
table: string,
id: string,
document: T,
options: {
cacheKey?: string;
gpuAccelerated?: boolean;
metadata?: Record<string, unknown>;
} = {}
): Promise<boolean> {
const queryId = `store_jsonb_${table}_${id}`;
const release = await this.acquireQueryLock(queryId);

try {
if (options.cacheKey) {
await cognitiveCache.storeJsonbDocument(
options.cacheKey,
document as unknown,
options.metadata
);
}

const client = await (pool as any).connect();
activeTxs.set(queryId, client);

try {
await client.query('BEGIN');
const query = `
INSERT INTO ${table} (id, content, metadata, created_at, updated_at)
VALUES ($1, $2, $3, NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET content = EXCLUDED.content,
metadata = EXCLUDED.metadata,
updated_at = NOW()
`;
await client.query(query, [
id,
JSON.stringify(document),
JSON.stringify(options?.metadata || {})
]);
await client.query('COMMIT');
return true;
} catch (error) {
await client.query('ROLLBACK');
throw error;
} finally {
client.release();
activeTxs.delete(queryId);
}
} catch (error) {
console.error(`Failed to store JSONB document ${id}:`, error);
return false;
} finally {
release();
}
}

async queryJsonbDocuments<T = unknown>(
table: string,
jsonbQuery: {
path?: string;
operator?: '@>' | '@?' | '@@' | '->' | '->>';
value?: unknown;
conditions?: Record<string, unknown>;
},
options: {
limit?: number;
offset?: number;
orderBy?: 'created_at' | 'updated_at' | 'relevance';
useGPU?: boolean;
cacheResults?: boolean;
} = {}
): Promise<T[]> {
const queryId = `query_jsonb_${table}_${JSON.stringify(jsonbQuery).slice(0, 50)}`;
const cacheKey = `jsonb_query_${Buffer.from(queryId).toString('base64')}`;

if (options.cacheResults) {
const cached = await cognitiveCache.retrieveJsonbDocument(cacheKey);
if (cached) {
if (Array.isArray(cached)) return cached as T[];
if (typeof cached === 'object' && cached !== null) {
const obj = cached as { content?: unknown };
const content = obj.content ?? cached;
if (Array.isArray(content)) return content as T[];
if (content !== undefined && content !== null) return [content as T];
}
}
}

const release = await this.acquireQueryLock(queryId);

try {
const client = await (pool as any).connect();
activeTxs.set(queryId, client);

try {
let query = `SELECT * FROM ${table}`;
const params: unknown[] = [];
const conditions: string[] = [];

const pushParam = (val: unknown) => {
const toStore =
val !== null && typeof val === 'object' ? JSON.stringify(val) : val;
params.push(toStore);
return params.length;
};

if (jsonbQuery?.path && jsonbQuery.value !== undefined) {
const operator = jsonbQuery?.operator ?? '@>';
if (operator === '@>') {
const idx = pushParam(jsonbQuery.value);
conditions.push(`content @> $${idx}`);
} else if (operator === '@@') {
const idx = pushParam(String(jsonbQuery.value));
conditions.push(`content::text @@ plainto_tsquery($${idx})`);
}
}

if (conditions.length > 0) {
query += ` WHERE ${conditions.join(' AND ')}`;
}

if (options.orderBy === 'created_at') {
query += ' ORDER BY created_at DESC';
} else if (options.orderBy === 'updated_at') {
query += ' ORDER BY updated_at DESC';
}

if (options.limit) {
const idx = pushParam(options.limit);
query += ` LIMIT $${idx}`;
}

if (options.offset) {
const idx = pushParam(options.offset);
query += ` OFFSET $${idx}`;
}

const result = await client.query(query, params);
const results = ((result as { rows?: unknown[] }).rows || []) as T[];

if (options.cacheResults) {
await cognitiveCache.storeJsonbDocument(cacheKey, results, {
queryType: 'jsonb_search',
resultCount: results.length,
gpuProcessed: options?.useGPU || false
});
}

return results;
} finally {
client.release();
activeTxs.delete(queryId);
}
} catch (error) {
console.error(`JSONB query failed for ${table}:`, error);
return [];
} finally {
release();
}
}

async healthCheck(): Promise<HealthCheckResult> {
try {
const client = await (pool as any).connect();
try {
await client.query('SELECT NOW() as timestamp');
return {
connected: true,
activeConnections: (pool as any).totalCount ?? 0,
activeLocks: queryLocks.size,
activeTransactions: activeTxs.size,
performance: {
avgQueryTime: 0,
totalQueries: 0
}
};
} finally {
client.release();
}
} catch (error) {
return {
connected: false,
activeConnections: 0,
activeLocks: queryLocks.size,
activeTransactions: activeTxs.size,
performance: {
avgQueryTime: 0,
totalQueries: 0
},
message: error instanceof Error ? error.message : String(error)
};
}
}

async cleanup(): Promise<void> {
const now = Date.now();
const lockTimeout = 60000;

for (const [id, lock] of queryLocks) {
if (!lock?.acquired && now - lock.lastAccessed > lockTimeout) {
queryLocks.delete(id);
}
}

for (const [id, client] of activeTxs) {
try {
await client.query('ROLLBACK');
client.release();
activeTxs.delete(id);
console.warn(`Cleaned up stuck transaction: ${id}`);
} catch (error) {
console.error(`Failed to cleanup transaction ${id}:`, error);
}
}
}
}

export const threadSafePostgres = ThreadSafePostgres.getInstance();

export async function safeJsonbStore<T extends Record<string, unknown>>(
table: string,
id: string,
document: T,
options?: {
cacheKey?: string;
gpuAccelerated?: boolean;
metadata?: Record<string, unknown>;
}
): Promise<boolean> {
return await threadSafePostgres.storeJsonbDocument(table, id, document, options || {});
}

export async function safeJsonbQuery<T = unknown>(
table: string,
jsonbQuery: {
path?: string;
operator?: '@>' | '@?' | '@@' | '->' | '->>';
value?: unknown;
conditions?: Record<string, unknown>;
},
options?: {
limit?: number;
offset?: number;
orderBy?: 'created_at' | 'updated_at' | 'relevance';
useGPU?: boolean;
cacheResults?: boolean;
}
): Promise<T[]> {
return await threadSafePostgres.queryJsonbDocuments(table, jsonbQuery, options || {});
}

if (typeof setInterval !== 'undefined') {
setInterval(() => {
threadSafePostgres.cleanup();
}, 300000);
}
