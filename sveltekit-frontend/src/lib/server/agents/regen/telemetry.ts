/**
 * Phase A4.5 — agents-regen telemetry.
 *
 * Writes one `context_timeline` row per completed regen run so the existing
 * admin observability dashboard can answer "how often does regen run, how
 * many cards change, are loaders degraded, which dirs failed?"
 *
 * Schema reuse — no new table:
 *   event_type = 'agents.regen'
 *   pipeline   = 'agents'
 *   payload    = JSONB { runId, dirCount, *Count, *Writes, durationMs,
 *                        signalSourcesLoaded, failedSample[] }
 *   user_id    = null (system-generated; integer-safe lane per CLAUDE.md)
 *
 * Hard rules:
 *   - Belt-and-braces env gate (mirrors writeCardToCouchDB) — refuses to
 *     write under VITEST unless allowLiveWritesInTests:true.
 *   - DI-able via `dbWriteFn` so unit tests verify the row shape without
 *     touching Postgres.
 *   - Failures are non-fatal — caller treats a returned `error` as
 *     a warning, never as a regen-run abort.
 */

import type { RegenCliResult } from './run.js';

export interface RegenTelemetryOptions {
	enabled?: boolean;
	/** Belt-and-braces test env gate. Default: block live writes under VITEST. */
	allowLiveWritesInTests?: boolean;
	/** Override the DB writer (used by tests). Signature matches a single INSERT. */
	dbWriteFn?: (row: TelemetryRowDraft) => Promise<void>;
	/** Optional userId for runs triggered from an authenticated admin route. */
	userId?: number | null;
	/** Optional sessionId from the caller's request context. */
	sessionId?: string | null;
	/** How many failures to embed in the payload (rest counted in failedCount). */
	maxEmbeddedFailures?: number;
}

export interface TelemetryRowDraft {
	userId:    number | null;
	sessionId: string;
	eventType: 'agents.regen';
	pipeline:  'agents';
	payload:   TelemetryPayload;
}

export interface TelemetryPayload {
	runId:                string;
	startedAt:            string;
	durationMs:           number;
	dryRun:               boolean;
	force:                boolean;
	dirCount:             number;
	changedCount:         number;
	unchangedCount:       number;
	skippedCount:         number;
	failedCount:          number;
	redisWrites:          number;
	couchWrites:          number;
	qdrantWrites:         number;
	qdrantPointsTouched:  number;
	signalSourcesLoaded:  RegenCliResult['signalSourcesLoaded'];
	failedSample:         Array<{ dir: string; error: string }>;
}

export interface RegenTelemetryResult {
	wrote:   boolean;
	skipped: 'disabled' | 'test-env-blocked' | null;
	error?:  string;
}

function isTestEnv(): boolean {
	return Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
}

export async function recordRegenTelemetry(
	result: RegenCliResult,
	opts: RegenTelemetryOptions = {},
): Promise<RegenTelemetryResult> {
	if (!opts.enabled) {
		return { wrote: false, skipped: 'disabled' };
	}
	if (isTestEnv() && !opts.allowLiveWritesInTests) {
		return { wrote: false, skipped: 'test-env-blocked' };
	}

	const maxFailures = opts.maxEmbeddedFailures ?? 5;
	const draft: TelemetryRowDraft = {
		userId:    opts.userId ?? null,
		sessionId: opts.sessionId ?? '',
		eventType: 'agents.regen',
		pipeline:  'agents',
		payload: {
			runId:               result.runId ?? deriveRunId(),
			startedAt:           result.startedAt ?? new Date(Date.now() - result.durationMs).toISOString(),
			durationMs:          result.durationMs,
			dryRun:              result.dryRun,
			force:               result.force,
			dirCount:            result.dirCount,
			changedCount:        result.changedCount,
			unchangedCount:      result.unchangedCount,
			skippedCount:        result.skippedCount,
			failedCount:         result.failedCount,
			redisWrites:         result.redisWrites,
			couchWrites:         result.couchWrites,
			qdrantWrites:        result.qdrantWrites,
			qdrantPointsTouched: result.qdrantPointsTouched,
			signalSourcesLoaded: result.signalSourcesLoaded,
			failedSample:        result.failures.slice(0, maxFailures).map((f) => ({ dir: f.dir, error: f.error.slice(0, 200) })),
		},
	};

	try {
		const writer = opts.dbWriteFn ?? defaultDbWriter;
		await writer(draft);
		return { wrote: true, skipped: null };
	} catch (err) {
		return { wrote: false, skipped: null, error: (err as Error)?.message ?? String(err) };
	}
}

function deriveRunId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function defaultDbWriter(row: TelemetryRowDraft): Promise<void> {
	const { db } = await import('$lib/server/db/client');
	const { contextTimeline } = await import('$lib/server/db/schema-postgres');
	await db.insert(contextTimeline).values({
		userId:    row.userId,
		sessionId: row.sessionId,
		eventType: row.eventType,
		pipeline:  row.pipeline,
		payload:   row.payload as unknown as Record<string, unknown>,
	});
}
