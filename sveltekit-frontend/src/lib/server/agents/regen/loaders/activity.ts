/**
 * Loader 5 — Postgres `context_timeline` → per-directory activity rollup.
 *
 * Phase A1.6 of `docs/design/2026-05-11_agents-regen-loaders.md`.
 *
 * Reads recent activity events for the lookback window, extracts the
 * directory from each event's `payload.filePath`/`payload.path`, and rolls
 * up a weighted score per directory with exponential time decay.
 *
 * NOTE on identity strategy: `context_timeline.user_id` is `integer` —
 * the SAFE Lucia-aligned column, NOT the `uuid` drift problem from the
 * P0 audit. This loader does not filter on user_id (the design doc treats
 * activity as a project-wide signal); it does not write to user_id either.
 * Safe inside the operator-only constraint.
 *
 * 3s timeout (Promise.race) bounds regen run time when Postgres is slow.
 */

import path from 'node:path';
import type {
	ActivityEntry,
	LoadActivityOptions,
	LoadActivityResult,
} from './types.js';
import { DEFAULT_ACTIVITY_WEIGHTS } from './types.js';

const DEFAULT_LOOKBACK_HOURS = 24 * 7;   // 7 days
const DEFAULT_HALF_LIFE_HOURS = 24;
const DEFAULT_TIMEOUT_MS = 3_000;

const SOURCE_OK   = 'postgres:context_timeline';
const SOURCE_DOWN = 'postgres:context_timeline (unreachable)';
const SOURCE_SLOW = 'postgres:context_timeline (timeout)';

const LN2 = Math.log(2);

export async function loadActivity(opts: LoadActivityOptions = {}): Promise<LoadActivityResult> {
	const lookbackHours = opts.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
	const halfLifeHours = opts.halfLifeHours ?? DEFAULT_HALF_LIFE_HOURS;
	const weights       = opts.weights ?? DEFAULT_ACTIVITY_WEIGHTS;
	const loadedAt      = new Date().toISOString();

	let rows: ActivityRow[];
	let timedOut = false;
	try {
		rows = await Promise.race([
			fetchRows(lookbackHours, Object.keys(weights)),
			new Promise<ActivityRow[]>((_, reject) =>
				setTimeout(() => {
					timedOut = true;
					reject(new Error('timeout'));
				}, DEFAULT_TIMEOUT_MS),
			),
		]);
	} catch {
		return {
			byDir:       new Map(),
			loadedAt,
			rowsScanned: 0,
			source:      timedOut ? SOURCE_SLOW : SOURCE_DOWN,
		};
	}

	const byDir = rollup(rows, weights, halfLifeHours);
	return { byDir, loadedAt, rowsScanned: rows.length, source: SOURCE_OK };
}

// ── Internals ────────────────────────────────────────────────────────────────

interface ActivityRow {
	eventType: string;
	payload:   Record<string, unknown>;
	createdAt: Date | string;
}

async function fetchRows(lookbackHours: number, eventTypes: readonly string[]): Promise<ActivityRow[]> {
	const { db } = await import('$lib/server/db/client');
	const { contextTimeline } = await import('$lib/server/db/schema-postgres');
	const { and, gte, inArray, sql } = await import('drizzle-orm');

	const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

	const rows = await db
		.select({
			eventType: contextTimeline.eventType,
			payload:   contextTimeline.payload,
			createdAt: contextTimeline.createdAt,
		})
		.from(contextTimeline)
		.where(and(
			gte(contextTimeline.createdAt, since),
			eventTypes.length > 0 ? inArray(contextTimeline.eventType, [...eventTypes]) : sql`true`,
		));

	return rows as unknown as ActivityRow[];
}

function rollup(
	rows: readonly ActivityRow[],
	weights: Readonly<Record<string, number>>,
	halfLifeHours: number,
): Map<string, ActivityEntry> {
	const byDir = new Map<string, ActivityEntry>();
	const now = Date.now();

	for (const row of rows) {
		const filePath = extractFilePath(row.payload);
		if (!filePath) continue;
		const dirPath = path.dirname(filePath).replace(/\\/g, '/');

		const weight = weights[row.eventType] ?? 0;
		if (weight === 0) continue;

		const eventTime = row.createdAt instanceof Date ? row.createdAt.getTime() : Date.parse(String(row.createdAt));
		if (!Number.isFinite(eventTime)) continue;

		const ageHours = Math.max(0, (now - eventTime) / (60 * 60 * 1000));
		const decay    = Math.exp(-(ageHours / Math.max(halfLifeHours, 1)) * LN2);
		const score    = weight * decay;

		const existing = byDir.get(dirPath);
		if (existing) {
			existing.score += score;
			existing.eventCount += 1;
			if (eventTime > Date.parse(existing.lastAccessedAt)) {
				existing.lastAccessedAt = new Date(eventTime).toISOString();
			}
		} else {
			byDir.set(dirPath, {
				dirPath,
				score,
				lastAccessedAt: new Date(eventTime).toISOString(),
				eventCount:     1,
			});
		}
	}
	return byDir;
}

function extractFilePath(payload: Record<string, unknown> | null | undefined): string | null {
	if (!payload || typeof payload !== 'object') return null;
	const candidates = [payload.filePath, payload.path, payload.file];
	for (const c of candidates) {
		if (typeof c === 'string' && c.length > 0) return c;
	}
	return null;
}
