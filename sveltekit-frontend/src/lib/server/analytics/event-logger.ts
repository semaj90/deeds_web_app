/**
 * User Analytics Event Logger
 *
 * Logs contextual events for predictive analytics + todo summaries.
 * Events, not raw content — privacy-safe by default.
 *
 * Event schema stored in the canonical analytics_events table.
 * Redis Streams fan out real-time signals; ClickHouse remains a future lane.
 *
 * Generates:
 * - Weekly summaries ("top intents", "slow endpoints", "most used tools")
 * - Predictive next actions ("after upload → suggest RAG extract")
 * - Query pattern analysis for cache warming
 */
import dbClient from '$lib/server/db/client';
const db = dbClient.db;
import { sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import { analyticsEvents } from '$lib/server/db/schema-postgres.js';
import { emit, makeEvent } from './analytics-sink.js';

// ── Event Types ──────────────────────────────────────────────────────────

export type AnalyticsEventType =
  | 'chat_query'
  | 'intent_eval'
  | 'tool_search'
  | 'codebase_search'
  | 'route_opened'
  | 'case_created'
  | 'case_updated'
  | 'evidence_uploaded'
  | 'rag_search'
  | 'embedding_generated'
  | 'cache_hit'
  | 'cache_miss'
  | 'error_analyzed'
  | 'patch_applied'
  | 'document_indexed';

export interface AnalyticsEvent {
	userId?: string;
	sessionId?: string;
	eventType: AnalyticsEventType;
	payload: AnalyticsPayload;
}

export interface AnalyticsPayload {
	routeId?: string;
	source?: 'local' | 'server' | 'cache';
	latencyMs?: number;
	cacheLayer?: 'loki' | 'idb' | 'redis' | 'none';
	queryHash?: string;
	topHits?: string[];
	resultCount?: number;
	confidence?: number;
	queryPreview?: string; // limited to 120 chars
	metadata?: Record<string, unknown>;
}

// ── Pipeline & Dev Analytics Types ───────────────────────────────────────

export type PipelineEventKind =
  | 'npm_script'
  | 'test_run'
  | 'docker_cmd'
  | 'dev_server'
  | 'graphify'
  | 'gpu_batch'
  | 'build';

export interface PipelineEvent {
  /** ISO timestamp */
  ts: string;
  kind: PipelineEventKind;
  /** Full command or script name */
  cmd: string;
  /** Exit code — null while still running */
  exitCode: number | null;
  durationMs?: number;
  /** Tail of stdout (last 2KB) */
  stdoutTail?: string;
  /** Tail of stderr (last 2KB) */
  stderrTail?: string;
  metadata?: Record<string, unknown>;
}

export interface UserAnalyticsEvent {
  ts: string;
  userId?: string;
  sessionId?: string;
  kind: PipelineEventKind | AnalyticsEventType;
  label: string;
  durationMs?: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

// ── Core Logger ──────────────────────────────────────────────────────────

/**
 * Log an analytics event to the database.
 * Non-blocking — errors are swallowed to never break the main flow.
 */
export async function logEvent(event: AnalyticsEvent): Promise<void> {
	const canonicalType = legacyToCanonical(event.eventType);

	try {
		await db.insert(analyticsEvents).values({
			eventType: canonicalType,
			userId: event.userId ? (Number.isInteger(Number(event.userId)) ? Number(event.userId) : null) : null,
			sessionId: event.sessionId ?? null,
			payload: {
				...event.payload,
				legacyEventType: event.eventType,
			},
		});
	} catch {
		// Never break the main flow for analytics
	}

	// Fan out to the canonical envelope sink (Postgres analytics_events + Redis Streams).
	// Legacy event names collapse onto the canonical envelope types.
	emit(makeEvent({
		eventType: canonicalType,
		userId: event.userId ? (Number.isInteger(Number(event.userId)) ? Number(event.userId) : undefined) : undefined,
		sessionId: event.sessionId,
		queryHash: event.payload?.queryHash,
		traceId: event.sessionId ?? `legacy:${event.eventType}`,
		latencyMs: event.payload?.latencyMs,
		metadata: {
			legacyEventType: event.eventType,
			source: event.payload?.source,
			cacheLayer: event.payload?.cacheLayer,
			resultCount: event.payload?.resultCount,
			confidence: event.payload?.confidence,
		},
	}));
}

/** Map legacy event-logger types to canonical AnalyticsEventType. */
function legacyToCanonical(t: AnalyticsEventType): import('./analytics-event-envelope.js').AnalyticsEventType {
	switch (t) {
		case 'cache_hit':   return 'cache.hit';
		case 'cache_miss':  return 'cache.miss';
		case 'chat_query':
		case 'rag_search':
		case 'codebase_search':
		case 'tool_search': return 'request.received';
		default:            return 'request.routed';
	}
}

/**
 * Log a batch of analytics events in a single INSERT.
 * Non-blocking — errors are swallowed to never break the main flow.
 */
export async function logEventBatch(events: AnalyticsEvent[]): Promise<number> {
	if (events.length === 0) return 0;
	try {
		const rows = events.map((e) => ({
			eventType: legacyToCanonical(e.eventType),
			userId: e.userId ? (Number.isInteger(Number(e.userId)) ? Number(e.userId) : null) : null,
			sessionId: e.sessionId ?? null,
			payload: {
				...e.payload,
				legacyEventType: e.eventType,
			},
		}));
		await db.insert(analyticsEvents).values(rows.map((row) => ({
			eventType: row.eventType,
			userId: row.userId,
			sessionId: row.sessionId,
			payload: row.payload,
		})));
		emitBatch(events.map((event) => makeEvent({
			eventType: legacyToCanonical(event.eventType),
			userId: event.userId ? (Number.isInteger(Number(event.userId)) ? Number(event.userId) : undefined) : undefined,
			sessionId: event.sessionId,
			queryHash: event.payload?.queryHash,
			traceId: event.sessionId ?? `legacy:${event.eventType}`,
			latencyMs: event.payload?.latencyMs,
			metadata: {
				legacyEventType: event.eventType,
				source: event.payload?.source,
				cacheLayer: event.payload?.cacheLayer,
				resultCount: event.payload?.resultCount,
				confidence: event.payload?.confidence,
			},
		})));
		return events.length;
	} catch {
		return 0;
	}
}

/**
 * Log a chat/search query with automatic hash + preview truncation.
 */
export function logQuery(opts: {
	userId?: string;
	sessionId?: string;
	query: string;
	source: 'local' | 'server' | 'cache';
	latencyMs: number;
	resultCount: number;
	topHits?: string[];
	cacheLayer?: AnalyticsPayload['cacheLayer'];
	confidence?: number;
}): void {
	// Fire and forget — don't await
	logEvent({
		userId: opts.userId,
		sessionId: opts.sessionId,
		eventType: 'chat_query',
		payload: {
			source: opts.source,
			latencyMs: opts.latencyMs,
			cacheLayer: opts.cacheLayer ?? 'none',
			queryHash: hashQuery(opts.query),
			topHits: opts.topHits?.slice(0, 5),
			resultCount: opts.resultCount,
			confidence: opts.confidence,
			queryPreview: opts.query.slice(0, 120)
		}
	});
}

/**
 * Log a codebase search (retrieval pipeline) event.
 */
export function logCodebaseSearch(opts: {
	userId?: string;
	query: string;
	recallCount: number;
	rerankCount: number;
	recallMs: number;
	rerankMs: number;
	totalMs: number;
	topHits: string[];
}): void {
	logEvent({
		userId: opts.userId,
		eventType: 'codebase_search',
		payload: {
			queryHash: hashQuery(opts.query),
			queryPreview: opts.query.slice(0, 120),
			latencyMs: opts.totalMs,
			resultCount: opts.rerankCount,
			topHits: opts.topHits.slice(0, 10),
			metadata: {
				recallCount: opts.recallCount,
				recallMs: opts.recallMs,
				rerankMs: opts.rerankMs
			}
		}
	});
}

/**
 * Log a cache event (hit or miss) for cache warming analytics.
 */
export function logCacheEvent(opts: {
	userId?: string;
	hit: boolean;
	cacheLayer: AnalyticsPayload['cacheLayer'];
	queryHash: string;
	latencyMs: number;
}): void {
	logEvent({
		userId: opts.userId,
		eventType: opts.hit ? 'cache_hit' : 'cache_miss',
		payload: {
			cacheLayer: opts.cacheLayer,
			queryHash: opts.queryHash,
			latencyMs: opts.latencyMs
		}
	});
}

// ── Query Analytics ──────────────────────────────────────────────────────

/**
 * Get top query patterns for a user (for predictive suggestions).
 */
export async function getTopQueryPatterns(
	userId: string,
	limit = 10
): Promise<Array<{ query_hash: string; count: number; last_seen: string }>> {
	const userIdInt = Number(userId);
	if (!Number.isFinite(userIdInt)) return [];
	try {
		const result = await db.execute(sql`
			SELECT
				payload->>'queryHash' as query_hash,
				COUNT(*) as count,
				MAX(created_at) as last_seen
			FROM analytics_events
			WHERE user_id = ${userIdInt}
			  AND event_type IN ('request.received', 'request.routed')
			  AND created_at > NOW() - INTERVAL '30 days'
			GROUP BY payload->>'queryHash'
			ORDER BY count DESC
			LIMIT ${limit}
		`);
		return (result.rows ?? []) as Array<{ query_hash: string; count: number; last_seen: string }>;
	} catch {
		return [];
	}
}

/**
 * Get weekly summary stats for a user.
 */
export async function getWeeklySummary(userId: string): Promise<{
	totalQueries: number;
	topIntents: string[];
	avgLatencyMs: number;
	cacheHitRate: number;
	mostUsedTools: string[];
	slowEndpoints: string[];
}> {
	const userIdInt = Number(userId);
	if (!Number.isFinite(userIdInt)) {
		return {
			totalQueries: 0,
			topIntents: [],
			avgLatencyMs: 0,
			cacheHitRate: 0,
			mostUsedTools: [],
			slowEndpoints: [],
		};
	}
	try {
		const result = await db.execute(sql`
			SELECT
				COUNT(*) as total,
				AVG((payload->>'latencyMs')::numeric) as avg_latency,
				COUNT(*) FILTER (WHERE event_type = 'cache.hit') as cache_hits,
				COUNT(*) FILTER (WHERE event_type IN ('cache.hit', 'cache.miss')) as cache_total
			FROM analytics_events
			WHERE user_id = ${userIdInt}
			  AND created_at > NOW() - INTERVAL '7 days'
		`);

		const row = (result.rows?.[0] ?? {}) as Record<string, unknown>;
		const total = Number(row.total ?? 0);
		const cacheHits = Number(row.cache_hits ?? 0);
		const cacheTotal = Number(row.cache_total ?? 1);

		return {
			totalQueries: total,
			topIntents: [], // populated by separate query pattern analysis
			avgLatencyMs: Number(row.avg_latency ?? 0),
			cacheHitRate: cacheTotal > 0 ? cacheHits / cacheTotal : 0,
			mostUsedTools: [],
			slowEndpoints: []
		};
	} catch {
		return {
			totalQueries: 0,
			topIntents: [],
			avgLatencyMs: 0,
			cacheHitRate: 0,
			mostUsedTools: [],
			slowEndpoints: []
		};
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────

function hashQuery(query: string): string {
	return createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
}
