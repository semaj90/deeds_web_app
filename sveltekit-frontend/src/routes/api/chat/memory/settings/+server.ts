/**
 * GET   /api/chat/memory/settings — read runtime chat-memory toggle + threshold
 * PATCH /api/chat/memory/settings — update them
 *
 * Runtime-tunable config for the chat-memory recall path. Values are kept in
 * Redis so they persist across dev-server restarts and can be changed without
 * redeploying. Defaults (if Redis is empty) come from hardcoded fallbacks that
 * match the original behavior.
 *
 * Settings:
 *   enabled         — boolean. When false, recallPastChats() short-circuits
 *                     and ACE's fetchChatMemory() returns [] without hitting
 *                     Qdrant or embedding the query.
 *   scoreThreshold  — 0..1 cosine cutoff used by ACE's default recall.
 *
 * Auth: admin only.
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';
import {
	readChatMemoryMetrics,
	resetChatMemoryMetrics,
} from '$lib/server/ace/chat-memory.js';

const SETTINGS_KEY = 'chat_memory:settings';
const DEFAULTS = { enabled: true, scoreThreshold: 0.65 };

const patchSchema = z.object({
	enabled: z.boolean().optional(),
	scoreThreshold: z.number().min(0).max(1).optional(),
});

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	const [settings, metrics] = await Promise.all([
		readSettings(),
		readChatMemoryMetrics(),
	]);
	return json({ ...settings, metrics });
};

/** DELETE /api/chat/memory/settings?target=metrics — reset rolling counters. */
export const DELETE: RequestHandler = async ({ url, locals }) => {
	if (locals.user?.role !== 'admin') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	if (url.searchParams.get('target') !== 'metrics') {
		return json({ error: 'Only target=metrics is supported' }, { status: 400 });
	}
	const ok = await resetChatMemoryMetrics();
	return json({ ok });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (locals.user?.role !== 'admin') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
			{ status: 400 },
		);
	}

	const current = await readSettings();
	const next = { ...current, ...parsed.data };
	await writeSettings(next);
	return json(next);
};

async function readSettings(): Promise<{ enabled: boolean; scoreThreshold: number }> {
	try {
		const redis = getRedis();
		const raw = await redis.get(SETTINGS_KEY);
		if (!raw) return DEFAULTS;
		const parsed = JSON.parse(raw) as Partial<{ enabled: boolean; scoreThreshold: number }>;
		return {
			enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
			scoreThreshold:
				typeof parsed.scoreThreshold === 'number' &&
				parsed.scoreThreshold >= 0 &&
				parsed.scoreThreshold <= 1
					? parsed.scoreThreshold
					: DEFAULTS.scoreThreshold,
		};
	} catch {
		return DEFAULTS;
	}
}

async function writeSettings(
	settings: { enabled: boolean; scoreThreshold: number },
): Promise<void> {
	try {
		const redis = getRedis();
		await redis.set(SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		/* non-fatal */
	}
}
