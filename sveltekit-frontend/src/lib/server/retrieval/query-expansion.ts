/**
 * Query Expansion — Legal Synonym + LLM-Based Term Expansion
 *
 * Expands search queries with legal synonyms and related terms
 * to improve retrieval recall. Optional LLM-based expansion via Ollama.
 *
 * Usage:
 *   const expanded = expandQuery('defendant negligence tort');
 *   // { original: '...', expanded: '... accused carelessness civil wrong', synonyms: [...] }
 */

import { ENV } from '$lib/server/env.server.js';

export interface ExpandedQuery {
	original: string;
	expanded: string;
	synonyms: Array<{ term: string; synonym: string }>;
	source: 'dictionary' | 'llm' | 'both';
}

/** Legal synonym pairs — bidirectional lookup. */
const LEGAL_SYNONYMS: Array<[string, string[]]> = [
	['defendant', ['accused', 'respondent']],
	['plaintiff', ['complainant', 'petitioner', 'claimant']],
	['negligence', ['carelessness', 'recklessness', 'failure of care']],
	['tort', ['civil wrong', 'wrongful act']],
	['statute', ['law', 'legislation', 'act', 'enactment']],
	['contract', ['agreement', 'covenant', 'compact']],
	['breach', ['violation', 'infringement', 'contravention']],
	['liability', ['responsibility', 'obligation', 'accountability']],
	['damages', ['compensation', 'reparation', 'restitution']],
	['injunction', ['restraining order', 'court order']],
	['testimony', ['evidence', 'statement', 'deposition']],
	['verdict', ['judgment', 'ruling', 'decision', 'finding']],
	['appeal', ['review', 'challenge', 'contestation']],
	['jurisdiction', ['authority', 'legal power', 'competence']],
	['indictment', ['charge', 'accusation', 'formal charge']],
	['acquittal', ['exoneration', 'discharge', 'absolution']],
	['conviction', ['guilty verdict', 'finding of guilt']],
	['arraignment', ['initial hearing', 'first appearance']],
	['bail', ['bond', 'surety', 'security deposit']],
	['subpoena', ['summons', 'court order to appear']],
	['deposition', ['sworn statement', 'pretrial testimony']],
	['discovery', ['disclosure', 'fact-finding', 'evidence exchange']],
	['arbitration', ['mediation', 'dispute resolution', 'adjudication']],
	['affidavit', ['sworn declaration', 'sworn statement']],
	['lien', ['encumbrance', 'security interest', 'charge']],
	['probate', ['estate administration', 'will validation']],
	['fiduciary', ['trustee', 'custodian', 'steward']],
	['easement', ['right of way', 'servitude']],
	['mortgage', ['security deed', 'deed of trust']],
	['foreclosure', ['repossession', 'seizure']],
	['deed', ['conveyance', 'title document', 'instrument']],
	['tenancy', ['lease', 'occupancy', 'rental']],
	['eviction', ['removal', 'dispossession', 'ouster']],
	['custody', ['guardianship', 'care', 'keeping']],
	['alimony', ['spousal support', 'maintenance']],
	['felony', ['serious crime', 'major offense']],
	['misdemeanor', ['minor offense', 'petty crime']],
	['parole', ['conditional release', 'supervised release']],
	['perjury', ['false testimony', 'lying under oath']],
	['fraud', ['deception', 'misrepresentation', 'swindle']],
	['embezzlement', ['misappropriation', 'theft of funds']],
	['defamation', ['slander', 'libel', 'character assassination']],
	['precedent', ['prior ruling', 'case law', 'established authority']],
	['stipulation', ['agreement', 'concession', 'admission']],
	['malpractice', ['professional negligence', 'professional misconduct']],
	['sovereign immunity', ['government immunity', 'state immunity']],
	['due process', ['fair procedure', 'legal rights', 'procedural fairness']],
	['habeas corpus', ['unlawful detention challenge', 'body production order']],
	['pro bono', ['free legal service', 'volunteer representation']],
	['class action', ['collective lawsuit', 'group litigation']],
];

/** Build reverse lookup map for O(1) synonym access. */
const synonymMap = new Map<string, string[]>();
for (const [term, synonyms] of LEGAL_SYNONYMS) {
	const lower = term.toLowerCase();
	synonymMap.set(lower, synonyms);
	// Also add reverse: each synonym maps back to the primary term
	for (const syn of synonyms) {
		const synLower = syn.toLowerCase();
		if (!synonymMap.has(synLower)) {
			synonymMap.set(synLower, [term]);
		}
	}
}

/**
 * Expand query with legal synonyms from dictionary.
 * Returns original + expanded query with matched synonyms.
 */
export function expandQuery(query: string): ExpandedQuery {
	const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
	const matched: Array<{ term: string; synonym: string }> = [];
	const expansions: string[] = [];

	for (const word of words) {
		const synonyms = synonymMap.get(word);
		if (synonyms) {
			// Add first synonym only to keep query focused
			const syn = synonyms[0];
			matched.push({ term: word, synonym: syn });
			expansions.push(syn);
		}
	}

	// Also check for 2-word phrases
	for (let i = 0; i < words.length - 1; i++) {
		const phrase = `${words[i]} ${words[i + 1]}`;
		const synonyms = synonymMap.get(phrase);
		if (synonyms) {
			const syn = synonyms[0];
			matched.push({ term: phrase, synonym: syn });
			expansions.push(syn);
		}
	}

	const expanded =
		expansions.length > 0
			? `${query} ${expansions.join(' ')}`
			: query;

	return {
		original: query,
		expanded,
		synonyms: matched,
		source: 'dictionary'
	};
}

/**
 * Expand query using Ollama LLM for deeper semantic expansion.
 * Falls back to dictionary-only if Ollama is unavailable.
 */
export async function expandWithOllama(query: string): Promise<ExpandedQuery> {
	const dictResult = expandQuery(query);

	try {
		const ollamaUrl = ENV.OLLAMA_BASE_URL;
		if (!ollamaUrl) return dictResult;

		const res = await fetch(`${ollamaUrl}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-legal:latest',
				prompt: `List 3-5 synonyms or related legal terms for this query. Return ONLY the terms separated by commas, nothing else.\n\nQuery: "${query}"`,
				stream: false,
				options: { temperature: 0.3, num_predict: 50 }
			}),
			signal: AbortSignal.timeout(5000)
		});

		if (!res.ok) return dictResult;

		const data = await res.json();
		const llmTerms = (data.response ?? '')
			.split(',')
			.map((t: string) => t.trim().toLowerCase())
			.filter((t: string) => t.length > 2 && t.length < 50)
			.slice(0, 5);

		if (llmTerms.length === 0) return dictResult;

		const llmSynonyms = llmTerms.map((t: string) => ({ term: query, synonym: t }));

		return {
			original: query,
			expanded: `${dictResult.expanded} ${llmTerms.join(' ')}`,
			synonyms: [...dictResult.synonyms, ...llmSynonyms],
			source: dictResult.synonyms.length > 0 ? 'both' : 'llm'
		};
	} catch {
		return dictResult;
	}
}
