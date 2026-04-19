/**
 * Entity extraction: LLM structured extraction (primary) + regex fallback.
 * Primary: Gemma4-legal structured JSON via Ollama GBNF-constrained output
 * Fallback: regex for emails, phones, dates, citations, statutes, money.
 *
 * Redis cache:
 *   Key  = `entity:<sha256(slice)>`
 *   TTL  = 1800s (30 min)
 *   LLM entities are deterministic for the same text slice — safe to cache.
 *   Regex entities are re-run and merged on every call (zero latency, no cache needed).
 */

import { createHash } from 'crypto';
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';

// Use gemma3:270m (fast, 4.5s avg) instead of gemma4-legal (slow, 25s avg)
// Entity extraction benefits from speed over complexity
const MODEL = 'gemma3:270m';
const CACHE_TTL = 1800; // 30 minutes
const CACHE_KEY_PREFIX = 'entity:';

/** Zod schema for structured entity extraction response — drives GBNF grammar */
const entityResponseSchema = z.object({
	entities: z.array(z.object({
		text: z.string(),
		label: z.string(),
		score: z.number().optional(),
	})),
});
const entityJsonSchema = z.toJSONSchema(entityResponseSchema);

export interface Entity {
	text: string;
	label: string;
	score?: number;
	start?: number;
	end?: number;
	source?: 'llm' | 'regex';
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

/** FNV-1a inspired — but for deterministic entity cache we need full SHA-256 */
function sliceKey(text: string): string {
	return CACHE_KEY_PREFIX + createHash('sha256').update(text).digest('hex');
}

async function getCachedEntities(key: string): Promise<Entity[] | null> {
	try {
		const raw = await getRedis().get(key);
		if (!raw) return null;
		return JSON.parse(raw) as Entity[];
	} catch {
		return null;
	}
}

async function setCachedEntities(key: string, entities: Entity[]): Promise<void> {
	try {
		// Fire-and-forget — don't block the caller on a cache write
		getRedis()
			.set(key, JSON.stringify(entities), 'EX', CACHE_TTL)
			.catch(() => {});
	} catch {
		// Non-fatal
	}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract entities using LLM structured extraction, falling back to regex.
 * LLM results are cached in Redis for 30 min keyed by SHA-256 of the text slice.
 *
 * @param text    - Document text (truncated to maxChars internally)
 * @param maxChars - Maximum characters to send to LLM (default 35000)
 */
export async function extractEntities(text: string, maxChars: number = 35_000): Promise<Entity[]> {
	if (!text || text.length === 0) return [];

	const slice = text.length > maxChars ? text.slice(0, maxChars) : text;

	// Regex entities run on every call (zero latency — no need to cache)
	const regexEntities = extractViaRegex(slice);

	// Check Redis cache for LLM entities BEFORE calling the model
	const cacheKey = sliceKey(slice);
	const cached = await getCachedEntities(cacheKey);
	if (cached !== null) {
		console.log(`[entity-extraction] Redis HIT key=${cacheKey.slice(-8)}`);
		return dedupeEntities([...cached, ...regexEntities]);
	}

	// 1) LLM structured extraction (best quality — PERSON, ORG, COURT, LAW, etc.)
	try {
		const llmEntities = await extractViaLLM(slice);
		if (llmEntities.length > 0) {
			// Cache LLM results; fire-and-forget
			setCachedEntities(cacheKey, llmEntities);
			return dedupeEntities([...llmEntities, ...regexEntities]);
		}
	} catch {
		// LLM unavailable — fall through to regex
	}

	// 2) Regex fallback (minimum guarantee — always works, zero latency)
	return dedupeEntities(regexEntities);
}

// ── LLM extraction ────────────────────────────────────────────────────────────

/**
 * LLM-based extraction via Ollama with GBNF-constrained structured output.
 */
async function extractViaLLM(text: string): Promise<Entity[]> {
	const prompt = `Extract named entities from the following legal document text.
Return an object with an "entities" array of objects with fields: {"text": "...", "label": "..."}
where label is one of: PERSON, ORG, LOCATION, DATE, LAW, CASE, COURT, STATUTE, MONEY, EMAIL, PHONE.
Only return entities that are clearly present. Do not fabricate.

Text:
${text}`;

	return traceLLM('entity-extraction', { model: MODEL, prompt: text.slice(0, 500) }, async (gen) => {
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				prompt,
				stream: false,
				format: entityJsonSchema,
				options: { temperature: 0.1, top_p: 0.9 },
			}),
			signal: AbortSignal.timeout(90_000),
		});

		if (!res.ok) {
			gen.end({ output: 'failed', level: 'WARNING' });
			return [];
		}

		const data = await res.json();
		const raw = typeof data.response === 'string' ? data.response : JSON.stringify(data.response);

		try {
			const parsed = JSON.parse(raw);
			const arr = Array.isArray(parsed.entities) ? parsed.entities : [];
			const entities = arr.filter(
				(e: any) => typeof e?.text === 'string' && typeof e?.label === 'string' && e.text.length > 0
			).map((e: any) => ({
				text: e.text,
				label: e.label,
				score: typeof e.score === 'number' ? e.score : 0.85,
				source: 'llm' as const,
			}));
			gen.end({ output: `${entities.length} entities extracted` });
			return entities;
		} catch {
			gen.end({ output: 'parse-failed', level: 'WARNING' });
			return [];
		}
	});
}

// ── Regex extraction ──────────────────────────────────────────────────────────

/**
 * Regex-based extraction — zero latency, always available.
 * Covers: EMAIL, PHONE, DATE, CASE, STATUTE, MONEY, SSN, CREDIT_CARD, URL, DOCKET, ADDRESS
 */
function extractViaRegex(text: string): Entity[] {
	const entities: Entity[] = [];
	let match: RegExpExecArray | null;

	const push = (m: RegExpExecArray, label: string, score: number) => {
		entities.push({ text: m[0], label, score, start: m.index, end: m.index + m[0].length, source: 'regex' });
	};

	// Email addresses
	const emailRe = /[\w.-]+@[\w.-]+\.[A-Za-z]{2,6}/g;
	while ((match = emailRe.exec(text))) push(match, 'EMAIL', 1.0);

	// Phone numbers
	const phoneRe = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
	while ((match = phoneRe.exec(text))) push(match, 'PHONE', 1.0);

	// Dates (MM/DD/YYYY, DD-MM-YYYY, etc.)
	const dateRe = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
	while ((match = dateRe.exec(text))) push(match, 'DATE', 1.0);

	// ISO dates (2025-02-18)
	const isoDateRe = /\b\d{4}-\d{2}-\d{2}\b/g;
	while ((match = isoDateRe.exec(text))) push(match, 'DATE', 1.0);

	// Written dates (January 15, 2025 / 15 Jan 2025)
	const writtenDateRe = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}\b/gi;
	while ((match = writtenDateRe.exec(text))) push(match, 'DATE', 0.95);

	// Case citations (Smith v. Jones, 123 Cal.App.4th 456)
	const caseRe = /\b[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+(?:,\s+\d+\s+[\w.]+\s+\d+)?/g;
	while ((match = caseRe.exec(text))) push(match, 'CASE', 0.9);

	// Statute references (§ 1234, Section 1234, Cal. Civ. Code § 1234)
	const statuteRe = /(?:§|Section|Sec\.)\s*\d+(?:\.\d+)?(?:\([a-z]\))?/gi;
	while ((match = statuteRe.exec(text))) push(match, 'STATUTE', 0.9);

	// U.S. Code references (18 U.S.C. § 1343, 42 USC 1983)
	const uscRe = /\b\d{1,2}\s+U\.?S\.?C\.?\s*§?\s*\d+(?:\([a-z]\))?/gi;
	while ((match = uscRe.exec(text))) push(match, 'STATUTE', 0.95);

	// Dollar amounts ($1,234.56)
	const moneyRe = /\$[\d,]+(?:\.\d{2})?/g;
	while ((match = moneyRe.exec(text))) push(match, 'MONEY', 1.0);

	// SSN (redacted or full — high forensic value)
	const ssnRe = /\b\d{3}-\d{2}-\d{4}\b/g;
	while ((match = ssnRe.exec(text))) push(match, 'SSN', 1.0);

	// Credit card numbers (16 digits, grouped)
	const ccRe = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
	while ((match = ccRe.exec(text))) push(match, 'CREDIT_CARD', 0.9);

	// URLs
	const urlRe = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
	while ((match = urlRe.exec(text))) push(match, 'URL', 1.0);

	// Docket numbers (Case No. 2:24-cv-01234-ABC, No. 24-CR-5678)
	const docketRe = /\b(?:Case\s+)?No\.\s*\d{1,2}:\d{2}-[a-z]{2,3}-\d{4,6}(?:-[A-Z]+)?\b/gi;
	while ((match = docketRe.exec(text))) push(match, 'DOCKET', 0.95);

	// Street addresses (123 Main St, Suite 456)
	const addressRe = /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Way|Ct|Court|Pl|Place)\.?(?:\s*,?\s*(?:Suite|Ste|Apt|Unit|#)\s*\d+)?\b/g;
	while ((match = addressRe.exec(text))) push(match, 'ADDRESS', 0.85);

	return entities;
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

/**
 * Deduplicate entities by label+text (case-insensitive).
 */
function dedupeEntities(entities: Entity[]): Entity[] {
	const seen = new Set<string>();
	return entities.filter((e) => {
		const key = `${e.label}:${e.text}`.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
