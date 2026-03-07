import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';

interface UserPreferences {
	theme: 'light' | 'dark' | 'system';
	sidebarCollapsed: boolean;
	defaultCaseView: 'grid' | 'list' | 'kanban';
	notificationsEnabled: boolean;
	aiAutoSummarize: boolean;
	evidenceAutoAnalyze: boolean;
	pageSize: number;
	language: string;
}

const DEFAULTS: UserPreferences = {
	theme: 'dark',
	sidebarCollapsed: false,
	defaultCaseView: 'list',
	notificationsEnabled: true,
	aiAutoSummarize: true,
	evidenceAutoAnalyze: true,
	pageSize: 50,
	language: 'en',
};

function prefKey(userId: string): string {
	return `user:prefs:${userId}`;
}

/**
 * GET /api/user/preferences
 * Return user preferences (Redis-backed, no DB table needed)
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	try {
		const redis = getRedis();
		const raw = await redis.get(prefKey(locals.user.id));
		const prefs = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
		return json({ success: true, preferences: prefs });
	} catch {
		return json({ success: true, preferences: DEFAULTS });
	}
};

/**
 * PATCH /api/user/preferences
 * Update user preferences (partial merge)
 */
export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json();
	if (!body || typeof body !== 'object') throw error(400, 'Invalid request body');

	// Validate fields
	const allowed = new Set(Object.keys(DEFAULTS));
	const updates: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(body)) {
		if (allowed.has(key)) updates[key] = value;
	}

	if (Object.keys(updates).length === 0) {
		throw error(400, 'No valid preference fields provided');
	}

	try {
		const redis = getRedis();
		const key = prefKey(locals.user.id);
		const raw = await redis.get(key);
		const existing = raw ? JSON.parse(raw) : {};
		const merged = { ...existing, ...updates };
		await redis.set(key, JSON.stringify(merged), 'EX', 86400 * 30); // 30 day TTL
		return json({ success: true, preferences: { ...DEFAULTS, ...merged } });
	} catch (e) {
		console.error('[user/preferences] Redis error:', (e as Error).message);
		throw error(500, 'Failed to save preferences');
	}
};
