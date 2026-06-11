/**
 * /api/atlas/studio/redis
 *
 * Read-only Redis SCAN viewer.
 *
 * Rules:
 * - Never uses KEYS * — only SCAN with prefix match
 * - Allowlisted prefixes only: ace:, atlas:, rag:, startup:, qdrant:
 * - Returns key, type, ttl, preview (truncated + JSON-parsed when safe)
 * - Redacts secrets / token / password-like field names
 * - No write / delete endpoints on this route
 *
 * Query params:
 *   prefix  — must start with one of the allowlisted prefixes (default: "atlas:")
 *   cursor  — Redis SCAN cursor (default: "0")
 *   limit   — max keys per page, default 50, hard-cap 200
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getRedis } from '$lib/server/redis.js';
import { requireUser } from '$lib/server/auth-utils.js';

// ── Allowed prefix allowlist ──────────────────────────────────────────────────
const ALLOWED_PREFIXES = ['ace:', 'atlas:', 'rag:', 'startup:', 'qdrant:'] as const;
type AllowedPrefix = (typeof ALLOWED_PREFIXES)[number];

// ── Redaction helpers ─────────────────────────────────────────────────────────
const REDACT_FIELDS = /token|secret|password|passwd|auth|apikey|api_key|credential|private/i;
const REDACT_SENTINEL = '[REDACTED]';
const MAX_PREVIEW_BYTES = 512; // characters shown in preview

/** Deep-redact sensitive keys from a plain object. */
function redactObject(obj: unknown, depth = 0): unknown {
	if (depth > 5 || obj === null || typeof obj !== 'object') return obj;
	if (Array.isArray(obj)) return obj.map((v) => redactObject(v, depth + 1));
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		out[k] = REDACT_FIELDS.test(k) ? REDACT_SENTINEL : redactObject(v, depth + 1);
	}
	return out;
}

/** Try to parse a string as JSON and redact; fall back to raw string. */
function safePreview(raw: string | null): unknown {
	if (raw === null) return null;
	const truncated = raw.length > MAX_PREVIEW_BYTES ? raw.slice(0, MAX_PREVIEW_BYTES) + '…' : raw;
	try {
		const parsed = JSON.parse(raw);
		return redactObject(parsed);
	} catch {
		return truncated;
	}
}

/** Validate and clamp the prefix param against the allowlist. */
function resolvePrefix(param: string | null): AllowedPrefix | null {
	if (!param) return 'atlas:';
	const match = ALLOWED_PREFIXES.find((p) => param.startsWith(p) || param === p);
	return match ?? null;
}

// ── Entry point ───────────────────────────────────────────────────────────────
export const GET: RequestHandler = async (event) => {
  requireUser(event);
  const { url } = event;
	const prefixParam = url.searchParams.get('prefix');
	const cursorParam = url.searchParams.get('cursor') ?? '0';
	const limitParam = url.searchParams.get('limit');

	// Validate prefix
	const prefix = resolvePrefix(prefixParam);
	if (!prefix) {
		return json(
			{
				ok: false,
				error: `prefix must start with one of: ${ALLOWED_PREFIXES.join(', ')}`,
				allowedPrefixes: ALLOWED_PREFIXES
			},
			{ status: 400 }
		);
	}

	// Clamp limit
	const rawLimit = parseInt(limitParam ?? '50', 10);
	const count = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

	const redis = getRedis();

	try {
		// SCAN — safe, cursor-based iteration
		const [nextCursor, keys] = await redis.scan(
			parseInt(cursorParam, 10) || 0,
			'MATCH',
			`${prefix}*`,
			'COUNT',
			count * 2 // over-scan slightly to account for key filtering
		);

		// Slice to requested count (SCAN can return more)
		const pageKeys = keys.slice(0, count);

		// Batch: get type + ttl for all keys in parallel
		const pipeline = redis.pipeline();
		for (const key of pageKeys) {
			pipeline.type(key);
			pipeline.ttl(key);
		}
		const pipeResults = (await pipeline.exec()) ?? [];

		// Fetch preview values — strings inline, hash via hgetall, list via lrange head
		const entries = await Promise.all(
			pageKeys.map(async (key, i) => {
				const typeResult = pipeResults[i * 2];
				const ttlResult = pipeResults[i * 2 + 1];
				const type = (typeResult?.[1] as string) ?? 'unknown';
				const ttl = (ttlResult?.[1] as number) ?? -1;

				let preview: unknown = null;

				try {
					if (type === 'string') {
						const raw = await redis.get(key);
						preview = safePreview(raw);
					} else if (type === 'hash') {
						const fields = await redis.hgetall(key);
						// Redact field-level secrets in hash
						const safe: Record<string, unknown> = {};
						for (const [f, v] of Object.entries(fields ?? {})) {
							safe[f] = REDACT_FIELDS.test(f) ? REDACT_SENTINEL : safePreview(v);
						}
						preview = safe;
					} else if (type === 'list') {
						const items = await redis.lrange(key, 0, 4);
						preview = items.map((v) => safePreview(v));
					} else if (type === 'set') {
						const members = await redis.srandmember(key, 5);
						preview = members.map((v) => safePreview(v as string));
					} else if (type === 'zset') {
						const items = await redis.zrange(key, 0, 4);
						preview = items.map((v) => safePreview(v));
					}
				} catch (err) {
					preview = `[preview error: ${(err as Error).message}]`;
				}

				return { key, type, ttl, preview };
			})
		);

		return json({
			ok: true,
			prefix,
			cursor: parseInt(nextCursor, 10),
			hasMore: nextCursor !== '0',
			count: entries.length,
			entries
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[atlas/studio/redis] Redis error:', msg);
		return json({ ok: false, error: msg }, { status: 502 });
	}
};
