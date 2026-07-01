/**
 * Unified Gemma4 NLP Reranker for Pattern Extraction
 *
 * Consolidates pattern extraction (forensic flags, entities, AST features, LangExtract results)
 * and reranks them via Gemma4 for legal relevance and context awareness.
 *
 * Three extraction lanes (all feed into Gemma4 for synthesis/reranking):
 *   1. Pattern Detection (forensic flags: PII, legal keywords, amounts)
 *   2. AST-Grep (code structure extraction: function signatures, class definitions)
 *   3. LangExtract (entity extraction: PERSON, ORG, LOCATION, STATUTE, CASE)
 *
 * Gemma4 synthesizes extracted features into:
 *   - Risk assessment (severity, confidence)
 *   - Legal relevance ranking
 *   - Context summary (why this pattern matters)
 */

import { traceLLM } from '$lib/server/observability/langfuse.js';

const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';

export interface PatternRanking {
	type: string;
	description: string;
	severity: 'low' | 'medium' | 'high';
	confidence: number; // 0-1, from Gemma4 assessment
	legalRelevance: number; // 0-1, how relevant to legal case
	contextSummary: string; // Why this pattern matters
	source: 'pattern' | 'ast' | 'entity' | 'langextract';
	metadata?: Record<string, unknown>;
}

/**
 * Rerank pattern extraction results via Gemma4.
 * Takes raw patterns and returns ranked, contextual results.
 */
export async function reankPatternsViaGemma4(
	patterns: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high'; source: string; metadata?: Record<string, unknown> }>,
	documentContext: string,
	maxChars: number = 2000
): Promise<PatternRanking[]> {
	if (!patterns || patterns.length === 0) {
		return [];
	}

	// Truncate context for token budget
	const context = documentContext.slice(0, maxChars);

	// Format patterns for Gemma4
	const patternList = patterns
		.map((p) => `- [${p.source.toUpperCase()}] ${p.type}: ${p.description} (severity: ${p.severity})`)
		.join('\n');

	const systemPrompt = `You are a legal document pattern analysis expert. Analyze extracted patterns and provide:
1. Confidence score (0-1): How confident is this pattern valid?
2. Legal relevance (0-1): How relevant is this to legal case analysis?
3. Context summary: Why does this pattern matter (1-2 sentences)?

Return ONLY valid JSON. No markdown, no explanations.`;

	const userPrompt = `Analyze these ${patterns.length} extracted patterns from a legal document.
Document context (first ${maxChars} chars):
"${context}"

Extracted patterns:
${patternList}

Return a JSON object: {"rankings": [{"type": "...", "confidence": 0.9, "legalRelevance": 0.85, "contextSummary": "..."}]}
Each ranking entry must have type, confidence, legalRelevance, and contextSummary.`;

	try {
		return await traceLLM('pattern-rerank-gemma4', { model: MODEL, patternCount: patterns.length }, async (gen) => {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 60_000);

			try {
				const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: MODEL,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: userPrompt },
						],
						max_tokens: 2048,
						temperature: 0.3,
						stream: true,
					}),
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!res.ok) {
					gen.end({ output: `gemma4-error-${res.status}`, level: 'WARNING' });
					return patterns.map((p) => ({
						...p,
						confidence: p.severity === 'high' ? 0.9 : p.severity === 'medium' ? 0.7 : 0.5,
						legalRelevance: 0.5,
						contextSummary: 'Pattern extracted (reranking unavailable)',
						source: (p.source as 'pattern' | 'ast' | 'entity' | 'langextract') || 'pattern',
					}));
				}

				// Parse streaming SSE response
				let accumulated = '';
				const decoder = new TextDecoder();
				let buffer = '';

				if (!res.body) {
					gen.end({ output: 'no-body', level: 'WARNING' });
					return [];
				}

				for await (const chunk of res.body) {
					buffer += decoder.decode(chunk, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() ?? '';

					for (const line of lines) {
						if (!line.trim().startsWith('data:')) continue;
						const payload = line.slice(5).trim();
						if (payload === '[DONE]') break;

						try {
							const parsed = JSON.parse(payload);
							const content = parsed.choices?.[0]?.delta?.content ?? '';
							accumulated += content;
						} catch {
							// Skip malformed lines
						}
					}
				}

				// Parse JSON response
				const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
				if (!jsonMatch) {
					gen.end({ output: 'no-json', level: 'WARNING' });
					return patterns.map((p) => ({
						...p,
						confidence: 0.6,
						legalRelevance: 0.5,
						contextSummary: 'Pattern extracted (JSON parse failed)',
						source: (p.source as 'pattern' | 'ast' | 'entity' | 'langextract') || 'pattern',
					}));
				}

				const parsed = JSON.parse(jsonMatch[0]);
				const rankings = Array.isArray(parsed.rankings) ? parsed.rankings : [];

				// Merge Gemma4 rankings with original pattern data
				const result: PatternRanking[] = patterns.map((original) => {
					const ranking = rankings.find((r: any) => r.type === original.type);
					return {
						type: original.type,
						description: original.description,
						severity: original.severity,
						confidence: typeof ranking?.confidence === 'number' ? Math.min(1, Math.max(0, ranking.confidence)) : 0.7,
						legalRelevance: typeof ranking?.legalRelevance === 'number' ? Math.min(1, Math.max(0, ranking.legalRelevance)) : 0.6,
						contextSummary: ranking?.contextSummary ?? 'Pattern detected',
						source: (original.source as 'pattern' | 'ast' | 'entity' | 'langextract') || 'pattern',
						metadata: original.metadata,
					};
				});

				gen.end({ output: `${result.length} patterns ranked`, level: 'SUCCESS' });
				return result;
			} finally {
				clearTimeout(timeoutId);
			}
		});
	} catch (err) {
		console.warn('[Gemma4NLPReranker] Reranking failed:', err);
		// Fallback: return patterns with default scores
		return patterns.map((p) => ({
			...p,
			confidence: p.severity === 'high' ? 0.85 : p.severity === 'medium' ? 0.65 : 0.45,
			legalRelevance: 0.5,
			contextSummary: 'Pattern extracted (reranking unavailable)',
			source: (p.source as 'pattern' | 'ast' | 'entity' | 'langextract') || 'pattern',
		}));
	}
}

/**
 * Integrated pattern detection with Gemma4 reranking.
 * Runs forensic pattern detection + reranking in single call.
 */
export async function detectAndRankPatterns(
	text: string,
	includeReranking: boolean = true
): Promise<PatternRanking[]> {
	const { detectForensicPatterns } = await import('./forensics.js');

	// Stage 1: Regex-based pattern detection (fast)
	const rawPatterns = detectForensicPatterns(text).map((flag) => ({
		type: flag.type,
		description: flag.description,
		severity: flag.severity,
		source: 'pattern' as const,
		metadata: flag.metadata,
	}));

	if (!includeReranking || rawPatterns.length === 0) {
		return rawPatterns.map((p) => ({
			...p,
			confidence: p.severity === 'high' ? 0.9 : p.severity === 'medium' ? 0.7 : 0.5,
			legalRelevance: 0.6,
			contextSummary: 'Pattern detected via regex',
			source: 'pattern' as const,
		}));
	}

	// Stage 2: Gemma4 reranking (NLP context awareness)
	return await reankPatternsViaGemma4(rawPatterns, text);
}

/**
 * Batch rerank multiple documents' patterns.
 * Returns map of documentId → ranked patterns.
 */
export async function batchReankPatterns(
	documents: Array<{ id: string; text: string; patterns: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high'; source: string; metadata?: Record<string, unknown> }> }>
): Promise<Map<string, PatternRanking[]>> {
	const results = new Map<string, PatternRanking[]>();

	for (const doc of documents) {
		try {
			const ranked = await reankPatternsViaGemma4(doc.patterns, doc.text);
			results.set(doc.id, ranked);
		} catch (err) {
			console.warn(`[Gemma4NLPReranker] Batch rerank failed for doc ${doc.id}:`, err);
			// Fallback: return patterns with default scores
			results.set(
				doc.id,
				doc.patterns.map((p) => ({
					...p,
					confidence: 0.6,
					legalRelevance: 0.5,
					contextSummary: 'Pattern extracted (batch reranking failed)',
					source: (p.source as 'pattern' | 'ast' | 'entity' | 'langextract') || 'pattern',
				}))
			);
		}
	}

	return results;
}
