import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

export interface ErrorFingerprint {
	errorHash: string;
	normalizedText: string;
	rawText: string;
	topSymbols: string[];
	topFiles: string[];
	priorFix?: string;
	confidence: number;
	seenCount: number;
	firstSeen: string;
	lastSeen: string;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const POSITION_RE = /\bat (src\/[^\s:]+):\d+:\d+/g;
const LINE_COL_RE = /:\d+:\d+/g;
const PROP_RE = /reading '([^']+)'/g;
const REDIS_TTL = 7 * 24 * 3600;

export function normalizeError(raw: string): string {
	let t = raw.replace(ANSI_RE, '');
	t = t.replace(POSITION_RE, 'at <FILE>:<LINE>');
	t = t.replace(LINE_COL_RE, ':<LINE>');
	t = t.replace(PROP_RE, "reading '<PROP>'");
	t = t.toLowerCase().replace(/\s+/g, ' ').trim();
	return t.slice(0, 800);
}

export function fingerprintError(raw: string): string {
	const normalized = normalizeError(raw);
	return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function extractSymbols(text: string): string[] {
	const matches = new Set<string>();
	const patterns = [
		/'([A-Z][a-zA-Z0-9_]+)'/g,
		/type '([A-Z][a-zA-Z0-9_<>, |&]+)'/g,
		/property '([a-zA-Z_][a-zA-Z0-9_]+)'/g,
		/identifier '([a-zA-Z_][a-zA-Z0-9_]+)'/g,
	];
	for (const re of patterns) {
		let m: RegExpExecArray | null;
		re.lastIndex = 0;
		while ((m = re.exec(text)) !== null) {
			if (m[1].length > 1) matches.add(m[1]);
		}
	}
	return [...matches].slice(0, 10);
}

export function extractFilePaths(text: string): string[] {
	const matches = new Set<string>();
	const re = /src\/[^\s'",:)>]+\.(?:ts|svelte|js|mjs)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		matches.add(m[0]);
	}
	return [...matches].slice(0, 10);
}

function buildFingerprint(
	raw: string,
	seenCount: number,
	firstSeen: string,
	lastSeen: string,
	priorFix?: string,
	confidence = 1
): ErrorFingerprint {
	const normalizedText = normalizeError(raw);
	const errorHash = createHash('sha256').update(normalizedText).digest('hex').slice(0, 16);
	return {
		errorHash,
		normalizedText,
		rawText: raw,
		topSymbols: extractSymbols(raw),
		topFiles: extractFilePaths(raw),
		priorFix,
		confidence,
		seenCount,
		firstSeen,
		lastSeen,
	};
}

export async function storeErrorFingerprint(
	redis: Redis,
	pool: Pool,
	raw: string,
	priorFix?: string
): Promise<ErrorFingerprint> {
	const now = new Date().toISOString();
	const fp = buildFingerprint(raw, 1, now, now, priorFix);
	const key = `ace:error:${fp.errorHash}`;

	const existing = await redis.get(key).catch(() => null);
	if (existing) {
		try {
			const prev: ErrorFingerprint = JSON.parse(existing);
			fp.seenCount = prev.seenCount + 1;
			fp.firstSeen = prev.firstSeen;
			fp.priorFix = priorFix ?? prev.priorFix;
		} catch {
			// use defaults
		}
	}

	redis.setex(key, REDIS_TTL, JSON.stringify(fp)).catch(() => {});

	pool
		.query(
			`INSERT INTO error_fingerprints
        (error_hash, normalized_text, raw_text, top_symbols, top_files, prior_fix, confidence, seen_count, first_seen, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now(), now())
       ON CONFLICT (error_hash) DO UPDATE SET
         seen_count = error_fingerprints.seen_count + 1,
         last_seen = now(),
         prior_fix = COALESCE(EXCLUDED.prior_fix, error_fingerprints.prior_fix)`,
			[
				fp.errorHash,
				fp.normalizedText,
				fp.rawText,
				fp.topSymbols,
				fp.topFiles,
				fp.priorFix ?? null,
				fp.confidence,
			]
		)
		.catch(() => {});

	return fp;
}

export async function lookupErrorFingerprint(
	redis: Redis,
	pool: Pool,
	raw: string
): Promise<ErrorFingerprint | null> {
	const hash = fingerprintError(raw);
	const key = `ace:error:${hash}`;

	const cached = await redis.get(key).catch(() => null);
	if (cached) {
		try {
			return JSON.parse(cached) as ErrorFingerprint;
		} catch {
			// fall through to Postgres
		}
	}

	try {
		const result = await pool.query(
			`SELECT error_hash, normalized_text, raw_text, top_symbols, top_files, prior_fix, confidence, seen_count, first_seen, last_seen
       FROM error_fingerprints WHERE error_hash = $1 LIMIT 1`,
			[hash]
		);
		if (result.rows.length === 0) return null;
		const row = result.rows[0];
		const fp: ErrorFingerprint = {
			errorHash: row.error_hash,
			normalizedText: row.normalized_text,
			rawText: row.raw_text,
			topSymbols: row.top_symbols ?? [],
			topFiles: row.top_files ?? [],
			priorFix: row.prior_fix ?? undefined,
			confidence: row.confidence,
			seenCount: row.seen_count,
			firstSeen: row.first_seen instanceof Date ? row.first_seen.toISOString() : row.first_seen,
			lastSeen: row.last_seen instanceof Date ? row.last_seen.toISOString() : row.last_seen,
		};
		redis.setex(key, REDIS_TTL, JSON.stringify(fp)).catch(() => {});
		return fp;
	} catch {
		return null;
	}
}

export async function findSimilarErrors(
	pool: Pool,
	raw: string,
	limit = 5
): Promise<ErrorFingerprint[]> {
	const normalized = normalizeError(raw);
	try {
		const result = await pool.query(
			`SELECT error_hash, normalized_text, raw_text, top_symbols, top_files, prior_fix,
              similarity(normalized_text, $1) AS confidence, seen_count, first_seen, last_seen
       FROM error_fingerprints
       WHERE similarity(normalized_text, $1) > 0.3
       ORDER BY similarity(normalized_text, $1) DESC
       LIMIT $2`,
			[normalized, limit]
		);
		return result.rows.map((row) => ({
			errorHash: row.error_hash,
			normalizedText: row.normalized_text,
			rawText: row.raw_text,
			topSymbols: row.top_symbols ?? [],
			topFiles: row.top_files ?? [],
			priorFix: row.prior_fix ?? undefined,
			confidence: parseFloat(row.confidence),
			seenCount: row.seen_count,
			firstSeen: row.first_seen instanceof Date ? row.first_seen.toISOString() : row.first_seen,
			lastSeen: row.last_seen instanceof Date ? row.last_seen.toISOString() : row.last_seen,
		}));
	} catch {
		return [];
	}
}
