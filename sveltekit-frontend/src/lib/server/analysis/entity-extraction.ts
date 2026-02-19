/**
 * Entity extraction: LLM structured extraction (primary) + regex fallback.
 * Primary: Gemma3-legal structured JSON via Ollama format:'json'
 * Fallback: regex for emails, phones, dates, citations, statutes, money.
 */

import { ENV } from '$lib/server/env.server.js';

const MODEL = 'gemma3-legal:latest';

export interface Entity {
	text: string;
	label: string;
	score?: number;
	start?: number;
	end?: number;
}

/**
 * Extract entities using LLM structured extraction, falling back to regex.
 * @param text - Document text (truncated to maxChars internally)
 * @param maxChars - Maximum characters to send to LLM (default 35000)
 */
export async function extractEntities(text: string, maxChars: number = 35_000): Promise<Entity[]> {
	if (!text || text.length === 0) return [];

	const slice = text.length > maxChars ? text.slice(0, maxChars) : text;

	// 1) LLM structured extraction (best quality — PERSON, ORG, COURT, LAW, etc.)
	try {
		const llmEntities = await extractViaLLM(slice);
		if (llmEntities.length > 0) {
			// Merge LLM results with regex results for completeness
			const regexEntities = extractViaRegex(slice);
			return dedupeEntities([...llmEntities, ...regexEntities]);
		}
	} catch {
		// LLM unavailable — fall through to regex
	}

	// 2) Regex fallback (minimum guarantee — always works, zero latency)
	return dedupeEntities(extractViaRegex(slice));
}

/**
 * LLM-based extraction via Ollama with format:'json' for structured output.
 */
async function extractViaLLM(text: string): Promise<Entity[]> {
	const prompt = `Extract named entities from the following legal document text as JSON only.
Return an array of objects with fields: {"text": "...", "label": "..."}
where label is one of: PERSON, ORG, LOCATION, DATE, LAW, CASE, COURT, STATUTE, MONEY, EMAIL, PHONE.
Only return entities that are clearly present. Do not fabricate.

Text:
${text}`;

	const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			prompt,
			stream: false,
			format: 'json',
			options: { temperature: 0.1, top_p: 0.9 },
		}),
		signal: AbortSignal.timeout(90_000),
	});

	if (!res.ok) return [];

	const data = await res.json();
	const raw = typeof data.response === 'string' ? data.response : JSON.stringify(data.response);

	try {
		const parsed = JSON.parse(raw);
		const arr = Array.isArray(parsed) ? parsed
			: Array.isArray(parsed.entities) ? parsed.entities
			: [];
		// Validate shape
		return arr.filter(
			(e: any) => typeof e?.text === 'string' && typeof e?.label === 'string' && e.text.length > 0
		).map((e: any) => ({ text: e.text, label: e.label, score: 0.85 }));
	} catch {
		return [];
	}
}

/**
 * Regex-based extraction — zero latency, always available.
 */
function extractViaRegex(text: string): Entity[] {
	const entities: Entity[] = [];
	let match: RegExpExecArray | null;

	// Email addresses
	const emailRe = /[\w.-]+@[\w.-]+\.[A-Za-z]{2,6}/g;
	while ((match = emailRe.exec(text))) {
		entities.push({ text: match[0], label: 'EMAIL', score: 1.0, start: match.index, end: match.index + match[0].length });
	}

	// Phone numbers
	const phoneRe = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
	while ((match = phoneRe.exec(text))) {
		entities.push({ text: match[0], label: 'PHONE', score: 1.0, start: match.index, end: match.index + match[0].length });
	}

	// Dates (MM/DD/YYYY, DD-MM-YYYY, etc.)
	const dateRe = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
	while ((match = dateRe.exec(text))) {
		entities.push({ text: match[0], label: 'DATE', score: 1.0, start: match.index, end: match.index + match[0].length });
	}

	// ISO dates (2025-02-18)
	const isoDateRe = /\b\d{4}-\d{2}-\d{2}\b/g;
	while ((match = isoDateRe.exec(text))) {
		entities.push({ text: match[0], label: 'DATE', score: 1.0, start: match.index, end: match.index + match[0].length });
	}

	// Case citations (Smith v. Jones, 123 Cal.App.4th 456)
	const caseRe = /\b[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+(?:,\s+\d+\s+[\w.]+\s+\d+)?/g;
	while ((match = caseRe.exec(text))) {
		entities.push({ text: match[0], label: 'CASE', score: 0.9, start: match.index, end: match.index + match[0].length });
	}

	// Statute references (§ 1234, Section 1234, Cal. Civ. Code § 1234)
	const statuteRe = /(?:§|Section|Sec\.)\s*\d+(?:\.\d+)?(?:\([a-z]\))?/gi;
	while ((match = statuteRe.exec(text))) {
		entities.push({ text: match[0], label: 'STATUTE', score: 0.9, start: match.index, end: match.index + match[0].length });
	}

	// Dollar amounts ($1,234.56)
	const moneyRe = /\$[\d,]+(?:\.\d{2})?/g;
	while ((match = moneyRe.exec(text))) {
		entities.push({ text: match[0], label: 'MONEY', score: 1.0, start: match.index, end: match.index + match[0].length });
	}

	return entities;
}

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
