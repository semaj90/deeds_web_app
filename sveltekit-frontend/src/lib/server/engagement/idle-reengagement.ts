/**
 * Idle Re-Engagement Pipeline
 *
 * Monitors user activity and sends re-engagement notifications
 * when users go idle for extended periods.
 *
 * Architecture:
 *   Client heartbeat → Redis last_active → Periodic scanner →
 *   Push notification (ntfy / web-push / email)
 *
 * Idle tiers:
 *   - 30min: Gentle nudge ("We noticed you stepped away...")
 *   - 2hr:   Feature highlight ("Did you know you can...")
 *   - 24hr:  Summary digest ("Here's what happened while you were away...")
 *   - 7day:  Re-engagement ("We miss you! Check out new features...")
 */
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { sendNotification } from '$lib/server/notifications/push-service.js';
import type { NotificationPayload } from '$lib/server/notifications/push-service.js';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

// ── Configuration ─────────────────────────────────────────────────

const IDLE_TIERS = [
	{ name: 'gentle_nudge', thresholdMs: 30 * 60 * 1000, maxPerDay: 2 },
	{ name: 'feature_highlight', thresholdMs: 2 * 60 * 60 * 1000, maxPerDay: 1 },
	{ name: 'daily_digest', thresholdMs: 24 * 60 * 60 * 1000, maxPerDay: 1 },
	{ name: 'weekly_reengagement', thresholdMs: 7 * 24 * 60 * 60 * 1000, maxPerDay: 1 },
] as const;

type IdleTier = typeof IDLE_TIERS[number]['name'];

const REDIS_KEY_PREFIX = 'user:activity:';
const REDIS_NOTIFY_PREFIX = 'user:notify:';
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let scanIntervalId: ReturnType<typeof setInterval> | null = null;

// ── Feature Highlights Pool ───────────────────────────────────────

const FEATURE_HIGHLIGHTS: NotificationPayload[] = [
	{
		title: 'Evidence Analysis',
		body: 'Upload documents and get AI-powered entity extraction, forensic analysis, and legal chunking in seconds.',
		tag: 'feature',
		url: '/evidence',
	},
	{
		title: 'Case Similarity Search',
		body: 'Find related cases using multi-modal vector search across your entire evidence library.',
		tag: 'feature',
		url: '/cases',
	},
	{
		title: 'Citation Collections',
		body: 'Organize citations into collections for easy reference and export in HTML, Markdown, or JSON.',
		tag: 'feature',
		url: '/citations',
	},
	{
		title: 'AI Chat with Case Context',
		body: 'Chat with your AI assistant — it automatically uses your case evidence, citations, and knowledge graph.',
		tag: 'feature',
		url: '/terminal',
	},
	{
		title: 'Cache Monitoring',
		body: 'Monitor Redis cache hit rates, template performance, and LLM response caching from the admin dashboard.',
		tag: 'feature',
		url: '/admin-cache',
	},
];

// ── Heartbeat ─────────────────────────────────────────────────────

/**
 * Record user activity heartbeat.
 * Called by client-side telemetry or API endpoint.
 */
export async function recordHeartbeat(userId: string): Promise<void> {
	try {
		const redis: Redis = getRedis();
		const key = `${REDIS_KEY_PREFIX}${userId}`;
		const now = Date.now();
		await redis.set(key, String(now), 'EX', 30 * 24 * 60 * 60); // 30-day TTL
	} catch {
		// Non-blocking — don't fail requests if Redis is down
	}
}

/**
 * Get last activity timestamp for a user.
 */
export async function getLastActive(userId: string): Promise<number | null> {
	try {
		const redis: Redis = getRedis();
		const key = `${REDIS_KEY_PREFIX}${userId}`;
		const val = await redis.get(key);
		return val ? parseInt(val, 10) : null;
	} catch {
		return null;
	}
}

/**
 * Get idle duration in milliseconds for a user.
 */
export async function getIdleDuration(userId: string): Promise<number> {
	const lastActive = await getLastActive(userId);
	if (!lastActive) return Infinity;
	return Date.now() - lastActive;
}

// ── Notification Throttle ─────────────────────────────────────────

/**
 * Check if we've already sent this tier of notification today.
 */
async function hasNotifiedToday(userId: string, tier: IdleTier): Promise<boolean> {
	try {
		const redis: Redis = getRedis();
		const key = `${REDIS_NOTIFY_PREFIX}${userId}:${tier}`;
		const count = await redis.get(key);
		const tierConfig = IDLE_TIERS.find(t => t.name === tier);
		return count !== null && parseInt(count, 10) >= (tierConfig?.maxPerDay ?? 1);
	} catch {
		return true; // Err on the side of not notifying
	}
}

/**
 * Mark that we sent a notification for this tier today.
 */
async function markNotified(userId: string, tier: IdleTier): Promise<void> {
	try {
		const redis: Redis = getRedis();
		const key = `${REDIS_NOTIFY_PREFIX}${userId}:${tier}`;
		await redis.incr(key);
		// Expire at midnight UTC
		const now = new Date();
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		const ttl = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
		await redis.expire(key, ttl);
	} catch {
		// Non-blocking
	}
}

// ── Notification Generators ───────────────────────────────────────

function generateGentleNudge(): NotificationPayload {
	return {
		title: 'Welcome back!',
		body: 'We noticed you stepped away. Your cases and evidence are right where you left them.',
		tag: 'reengagement',
		url: '/dashboard',
	};
}

function generateFeatureHighlight(): NotificationPayload {
	const idx = Math.floor(Math.random() * FEATURE_HIGHLIGHTS.length);
	return FEATURE_HIGHLIGHTS[idx];
}

async function generateDailyDigest(userId: string): Promise<NotificationPayload> {
	// Query recent activity stats for the digest
	let stats = { newEvidence: 0, newCitations: 0, casesUpdated: 0 };
	try {
		const result = await db.execute(sql`
			SELECT
				(SELECT COUNT(*) FROM evidence WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new_evidence,
				(SELECT COUNT(*) FROM citations WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new_citations,
				(SELECT COUNT(*) FROM cases WHERE updated_at > NOW() - INTERVAL '24 hours')::int AS cases_updated
		`);
		const row = result.rows[0] as any;
		if (row) {
			stats = {
				newEvidence: row.new_evidence ?? 0,
				newCitations: row.new_citations ?? 0,
				casesUpdated: row.cases_updated ?? 0,
			};
		}
	} catch {
		// DB unavailable — send generic digest
	}

	const parts: string[] = [];
	if (stats.newEvidence > 0) parts.push(`${stats.newEvidence} new evidence items`);
	if (stats.newCitations > 0) parts.push(`${stats.newCitations} new citations`);
	if (stats.casesUpdated > 0) parts.push(`${stats.casesUpdated} cases updated`);

	return {
		title: 'Daily Digest',
		body: parts.length > 0
			? `While you were away: ${parts.join(', ')}.`
			: 'Check in on your cases — your AI assistant is ready to help.',
		tag: 'digest',
		url: '/dashboard',
	};
}

function generateWeeklyReengagement(): NotificationPayload {
	return {
		title: 'We miss you!',
		body: 'Your legal AI assistant has been improving. Come back and explore new features like case similarity search and citation collections.',
		tag: 'reengagement',
		url: '/dashboard',
	};
}

// ── Scanner ───────────────────────────────────────────────────────

/**
 * Scan all tracked users and send re-engagement notifications
 * based on their idle duration and tier thresholds.
 */
export async function scanIdleUsers(): Promise<{
	scanned: number;
	notified: number;
	errors: number;
}> {
	const result = { scanned: 0, notified: 0, errors: 0 };

	try {
		const redis: Redis = getRedis();
		// Get all user activity keys from Redis
		const keys: string[] = [];
		let cursor = '0';
		do {
			const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', `${REDIS_KEY_PREFIX}*`, 'COUNT', 100);
			cursor = nextCursor;
			keys.push(...batch);
		} while (cursor !== '0');

		const now = Date.now();

		for (const key of keys) {
			result.scanned++;
			const userId = key.replace(REDIS_KEY_PREFIX, '');

			try {
				const lastActiveStr = await redis.get(key);
				if (!lastActiveStr) continue;

				const lastActive = parseInt(lastActiveStr, 10);
				const idleDuration = now - lastActive;

				// Find the highest applicable idle tier
				let applicableTier: typeof IDLE_TIERS[number] | null = null;
				for (const tier of [...IDLE_TIERS].reverse()) {
					if (idleDuration >= tier.thresholdMs) {
						applicableTier = tier;
						break;
					}
				}

				if (!applicableTier) continue;

				// Check throttle
				if (await hasNotifiedToday(userId, applicableTier.name)) continue;

				// Generate appropriate notification
				let payload: NotificationPayload;
				switch (applicableTier.name) {
					case 'gentle_nudge':
						payload = generateGentleNudge();
						break;
					case 'feature_highlight':
						payload = generateFeatureHighlight();
						break;
					case 'daily_digest':
						payload = await generateDailyDigest(userId);
						break;
					case 'weekly_reengagement':
						payload = generateWeeklyReengagement();
						break;
				}

				// Send via ntfy (always available, no subscription needed)
				await sendNotification(payload, {
					channels: ['ntfy'],
					userId,
				});

				await markNotified(userId, applicableTier.name);
				result.notified++;

				console.log(`[Idle] Sent ${applicableTier.name} to user ${userId.slice(0, 8)}... (idle ${Math.round(idleDuration / 60000)}min)`);
			} catch (err) {
				result.errors++;
				console.warn(`[Idle] Error processing user ${userId.slice(0, 8)}:`, err);
			}
		}
	} catch (err) {
		console.warn('[Idle] Scanner error:', err);
		result.errors++;
	}

	return result;
}

// ── Lifecycle ─────────────────────────────────────────────────────

/**
 * Start the periodic idle user scanner.
 * Called from hooks.server.ts on startup.
 */
export function startIdleScanner(): void {
	if (scanIntervalId) return; // Already running

	console.log('[Idle] Starting idle re-engagement scanner (5min interval)');
	scanIntervalId = setInterval(() => {
		scanIdleUsers().catch(err => console.warn('[Idle] Scan failed:', err));
	}, SCAN_INTERVAL_MS);

	// Run initial scan after 1 minute (let server warm up)
	setTimeout(() => {
		scanIdleUsers().catch(err => console.warn('[Idle] Initial scan failed:', err));
	}, 60_000);
}

/**
 * Stop the periodic scanner.
 */
export function stopIdleScanner(): void {
	if (scanIntervalId) {
		clearInterval(scanIntervalId);
		scanIntervalId = null;
		console.log('[Idle] Stopped idle re-engagement scanner');
	}
}
