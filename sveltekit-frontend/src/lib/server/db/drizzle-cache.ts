/**
 * Drizzle Query Cache — ioredis-backed implementation of Drizzle's Cache interface
 * Enables .$withCache() on any Drizzle query with automatic table-based invalidation
 *
 * Strategy: 'explicit' — opt-in per query via .$withCache({ config: { ex: 300 } })
 *
 * Cache key layout:
 *   drizzle:q:{hashedQuery}         → cached query result (JSON)
 *   drizzle:tables:{compositeKey}   → SET of query hashes touching these tables
 *   drizzle:tags:{tag}              → cached tagged query result (JSON)
 *   drizzle:tagmap:{tag}            → composite table key for tag lookup
 */
import { Cache, type MutationOption } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import { type Table, getTableName } from 'drizzle-orm';
import { getRedis } from '../redis.js';

const PREFIX = 'drizzle';
const DEFAULT_TTL = 300; // 5 minutes

function is(val: unknown, klass: any): val is Table {
  return (
    val != null &&
    typeof val === 'object' &&
    (val as any).constructor?.[Symbol.for('drizzle:entityKind')] ===
      klass[Symbol.for('drizzle:entityKind')]
  );
}

export class IoRedisDrizzleCache extends Cache {
	private defaultTtl: number;

	constructor(defaultTtl = DEFAULT_TTL) {
		super();
		this.defaultTtl = defaultTtl;
	}

	strategy(): 'explicit' {
		return 'explicit';
	}

	async get(key: string, tables: string[], isTag = false, isAutoInvalidate?: boolean): Promise<any[] | undefined> {
		try {
			const redis = getRedis();
			let cacheKey: string;

			if (!isAutoInvalidate) {
				cacheKey = `${PREFIX}:noauto:${key}`;
			} else if (isTag) {
				cacheKey = `${PREFIX}:tags:${key}`;
			} else {
				cacheKey = `${PREFIX}:q:${key}`;
			}

			const raw = await redis.get(cacheKey);
			if (raw === null) return undefined;
			return JSON.parse(raw);
		} catch (e) {
			console.warn('[DrizzleCache] get error (non-fatal):', (e as Error).message);
			return undefined;
		}
	}

	async put(hashedQuery: string, response: any, tables: string[], isTag = false, config?: CacheConfig): Promise<void> {
		try {
			const redis = getRedis();
			const ttl = config?.ex ?? this.defaultTtl;
			const serialized = JSON.stringify(response);
			const isAutoInvalidate = tables.length > 0;

			if (!isAutoInvalidate) {
				// No auto-invalidation — store in separate namespace
				const cacheKey = isTag ? `${PREFIX}:tags:${hashedQuery}` : `${PREFIX}:noauto:${hashedQuery}`;
				await redis.set(cacheKey, serialized, 'EX', ttl);
				return;
			}

			const cacheKey = isTag ? `${PREFIX}:tags:${hashedQuery}` : `${PREFIX}:q:${hashedQuery}`;
			const compositeKey = this.getCompositeKey(tables);

			const pipeline = redis.pipeline();
			// Store the cached result
			pipeline.set(cacheKey, serialized, 'EX', ttl);

			// Track which queries are associated with each table (for invalidation)
			for (const table of tables) {
				pipeline.sadd(`${PREFIX}:tbl:${table}`, cacheKey);
			}
			// Track composite table → query mapping
			pipeline.sadd(`${PREFIX}:ct:${compositeKey}`, cacheKey);

			// If tagged, store tag → composite mapping
			if (isTag) {
				pipeline.set(`${PREFIX}:tagmap:${hashedQuery}`, compositeKey, 'EX', ttl);
			}

			await pipeline.exec();
		} catch (e) {
			console.warn('[DrizzleCache] put error (non-fatal):', (e as Error).message);
		}
	}

	async onMutate(params: MutationOption): Promise<void> {
		try {
			const redis = getRedis();
			const pipeline = redis.pipeline();

			// Handle tag invalidation
			const tags = Array.isArray(params.tags) ? params.tags : params.tags ? [params.tags] : [];
			for (const tag of tags) {
				pipeline.del(`${PREFIX}:tags:${tag}`);
				pipeline.del(`${PREFIX}:tagmap:${tag}`);
			}

			// Handle table invalidation
			const tables = Array.isArray(params.tables) ? params.tables : params.tables ? [params.tables] : [];
			const tableNames = tables.map((table) => {
				if (typeof table === 'string') return table;
				try {
					return getTableName(table as any);
				} catch {
					return String(table);
				}
			});

			// Phase 1: batch-fetch all table members in one pipeline
			const fetchPipeline = redis.pipeline();
			for (const tableName of tableNames) {
				fetchPipeline.smembers(`${PREFIX}:tbl:${tableName}`);
			}
			const memberResults = await fetchPipeline.exec();

			// Phase 2: batch-delete all cached query keys + table sets
			if (memberResults) {
				for (let i = 0; i < tableNames.length; i++) {
					const [err, members] = memberResults[i] ?? [null, []];
					if (!err && Array.isArray(members) && members.length > 0) {
						for (const m of members) pipeline.del(m);
					}
					pipeline.del(`${PREFIX}:tbl:${tableNames[i]}`);
				}
			}

			await pipeline.exec();
		} catch (e) {
			console.warn('[DrizzleCache] onMutate error (non-fatal):', (e as Error).message);
		}
	}

	private getCompositeKey(tables: string[]): string {
		return [...tables].sort().join(',');
	}
}

/**
 * Create a Drizzle cache instance backed by the app's ioredis pool
 * Pass to drizzle() constructor: drizzle(pool, { cache: createDrizzleCache() })
 */
export function createDrizzleCache(defaultTtl = DEFAULT_TTL): IoRedisDrizzleCache {
	return new IoRedisDrizzleCache(defaultTtl);
}
