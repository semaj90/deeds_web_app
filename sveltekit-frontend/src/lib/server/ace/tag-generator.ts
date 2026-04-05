/**
 * ACE Tag Generator
 *
 * Generates auto-tags for documents/queries using:
 * 1. Regex extraction (legal citations via tag-extractor.ts)
 * 2. NER via Ollama (persons, organizations, dates, locations)
 * 3. LLM classification (practice area, topic category)
 */
import { extractLegalTags } from '$lib/server/rag/tag-extractor.js';
import { ENV } from '$lib/server/env.server.js';
import type { GeneratedTag } from './types.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const MODEL = 'gemma4-legal:latest';

interface TagResult {
	legal: { statutes: string[]; cases: string[]; codes: string[] };
	entities: { persons: string[]; organizations: string[]; dates: string[] };
	categories: string[];
	confidence: number;
	tags: GeneratedTag[];
}

/**
 * Generate tags from text using regex + LLM pipeline.
 * Returns up to maxTags tags with confidence scores.
 */
export async function generateTags(
	text: string,
	opts?: { maxTags?: number; skipLLM?: boolean }
): Promise<TagResult> {
	const maxTags = opts?.maxTags ?? 15;
	const allTags: GeneratedTag[] = [];

	// Stage 1: Regex extraction (instant, zero cost)
	const legalTags = extractLegalTags(text);
	for (const s of legalTags.statutes) {
		allTags.push({ label: s, category: 'statute', confidence: 1.0, source: 'regex' });
	}
	for (const c of legalTags.cases) {
		allTags.push({ label: c, category: 'case_law', confidence: 1.0, source: 'regex' });
	}
	for (const code of legalTags.caCodes) {
		allTags.push({ label: code, category: 'statute', confidence: 0.95, source: 'regex' });
	}

	// Stage 2: LLM-based NER + classification (if not skipped)
	let entities = { persons: [] as string[], organizations: [] as string[], dates: [] as string[] };
	let categories: string[] = [];

	if (!opts?.skipLLM) {
		try {
			const llmResult = await extractEntitiesViaLLM(text.slice(0, 2000));
			entities = llmResult.entities;
			categories = llmResult.categories;

			for (const p of entities.persons) {
				allTags.push({ label: p, category: 'entity', confidence: 0.85, source: 'ner' });
			}
			for (const o of entities.organizations) {
				allTags.push({ label: o, category: 'entity', confidence: 0.85, source: 'ner' });
			}
			for (const cat of categories) {
				allTags.push({ label: cat, category: 'practice_area', confidence: 0.8, source: 'llm' });
			}
		} catch {
			// LLM unavailable — regex tags only
		}
	}

	// Deduplicate and limit
	const seen = new Set<string>();
	const uniqueTags = allTags.filter((t) => {
		const key = `${t.category}:${t.label.toLowerCase()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	const finalTags = uniqueTags
		.sort((a, b) => b.confidence - a.confidence)
		.slice(0, maxTags);

	const avgConfidence =
		finalTags.length > 0
			? finalTags.reduce((sum, t) => sum + t.confidence, 0) / finalTags.length
			: 0;

	return {
		legal: {
			statutes: legalTags.statutes,
			cases: legalTags.cases,
			codes: legalTags.caCodes
		},
		entities,
		categories,
		confidence: avgConfidence,
		tags: finalTags
	};
}

/**
 * Use Ollama to extract named entities and classify practice area.
 */
async function extractEntitiesViaLLM(
	text: string
): Promise<{
	entities: { persons: string[]; organizations: string[]; dates: string[] };
	categories: string[];
}> {
	const prompt = `Extract named entities and classify the legal practice area from this text.
Return ONLY valid JSON in this exact format:
{"persons":["name1"],"organizations":["org1"],"dates":["2024-01-15"],"categories":["criminal"]}

Categories must be from: criminal, civil-litigation, corporate, employment, intellectual-property, family-law, immigration, real-estate, bankruptcy, personal-injury, constitutional, tax, environmental, healthcare

Text: ${text}`;

	const res = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			prompt,
			stream: false,
			options: { temperature: 0.1, num_predict: 512 }
		}),
		signal: AbortSignal.timeout(15000)
	});

	if (!res.ok) throw new Error(`Ollama returned ${res.status}`);

	const data = await res.json();
	const responseText = String(data.response ?? '');

	// Extract JSON from response (may be wrapped in markdown code blocks)
	const jsonMatch = responseText.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		return { entities: { persons: [], organizations: [], dates: [] }, categories: [] };
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]);
		return {
			entities: {
				persons: Array.isArray(parsed.persons) ? parsed.persons.slice(0, 10) : [],
				organizations: Array.isArray(parsed.organizations) ? parsed.organizations.slice(0, 10) : [],
				dates: Array.isArray(parsed.dates) ? parsed.dates.slice(0, 10) : []
			},
			categories: Array.isArray(parsed.categories) ? parsed.categories.slice(0, 3) : []
		};
	} catch {
		return { entities: { persons: [], organizations: [], dates: [] }, categories: [] };
	}
}
