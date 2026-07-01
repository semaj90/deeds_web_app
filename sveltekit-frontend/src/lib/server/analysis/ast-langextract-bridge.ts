/**
 * AST-Grep + LangExtract Bridge → Gemma4 Reranker
 *
 * Orchestrates code structure extraction (AST-Grep) and entity extraction (LangExtract)
 * and routes both through Gemma4 for unified NLP reranking and legal relevance assessment.
 *
 * Three extraction paths:
 *   1. AST-Grep: Function signatures, class definitions, method contracts
 *   2. LangExtract: Named entities (PERSON, ORG, STATUTE, CASE, COURT)
 *   3. Pattern Extraction: Forensic flags (PII, keywords, amounts)
 *
 * All three feed into Gemma4 for:
 *   - Legal relevance scoring
 *   - Confidence assessment
 *   - Context-aware summaries
 *   - Risk ranking
 */

import { reankPatternsViaGemma4 } from './gemma4-nlp-reranker.js';
import { extractEntities } from './entity-extraction.js';

export interface ExtractedFeature {
	type: 'ast_function' | 'ast_class' | 'ast_method' | 'entity_person' | 'entity_org' | 'entity_location' | 'entity_statute' | 'entity_case';
	name: string;
	description: string;
	source: 'ast-grep' | 'langextract' | 'pattern';
	rawText?: string;
	lineNumber?: number;
	confidence?: number;
}

export interface RankedFeature extends ExtractedFeature {
	legalRelevance: number; // 0-1
	severity: 'low' | 'medium' | 'high';
	contextSummary: string;
}

/**
 * Unified extraction: AST features + LangExtract entities.
 * Returns features ready for Gemma4 reranking.
 */
export async function extractAstAndEntities(text: string, isCode: boolean = false): Promise<ExtractedFeature[]> {
	const features: ExtractedFeature[] = [];

	// Path 1: LangExtract entities (works on all text types)
	try {
		const entities = await extractEntities(text.slice(0, 50_000));
		for (const entity of entities) {
			const typeMapping: Record<string, ExtractedFeature['type']> = {
				PERSON: 'entity_person',
				ORG: 'entity_org',
				LOCATION: 'entity_location',
				STATUTE: 'entity_statute',
				CASE: 'entity_case',
				COURT: 'entity_case',
			};

			const mappedType = typeMapping[entity.label];
			if (mappedType) {
				features.push({
					type: mappedType,
					name: entity.text,
					description: `${entity.label} entity: "${entity.text}"`,
					source: 'langextract',
					rawText: entity.text,
					confidence: entity.score,
				});
			}
		}
	} catch (err) {
		console.warn('[AstLangextractBridge] Entity extraction failed:', err);
	}

	// Path 2: AST-Grep features (code only)
	if (isCode) {
		try {
			const { extractAstFeatures } = await import('./ast-grep-extractor.js').catch(() => ({
				extractAstFeatures: async () => [] as ExtractedFeature[],
			}));

			const astFeatures = await extractAstFeatures(text);
			features.push(...astFeatures);
		} catch (err) {
			console.warn('[AstLangextractBridge] AST extraction failed:', err);
		}
	}

	return features;
}

/**
 * Rerank extracted AST + LangExtract features via Gemma4.
 * Combines with forensic patterns for comprehensive document analysis.
 */
export async function reankAstAndEntitiesViaGemma4(
	features: ExtractedFeature[],
	documentText: string,
	maxChars: number = 2000
): Promise<RankedFeature[]> {
	if (!features || features.length === 0) {
		return [];
	}

	const context = documentText.slice(0, maxChars);

	// Format features for Gemma4
	const featureList = features
		.map((f) => `- [${f.source.toUpperCase()}] ${f.type}: ${f.name} (${f.description})`)
		.join('\n');

	const systemPrompt = `You are a legal document analysis expert. Rank extracted AST and entity features by legal relevance:
1. Legal relevance (0-1): How relevant to legal case?
2. Severity: low (informational), medium (important), high (critical)
3. Context: Why this feature matters in legal context

Return ONLY valid JSON. No markdown, no explanations.`;

	const userPrompt = `Analyze ${features.length} extracted features from a legal/code document.
Document context (${maxChars} chars):
"${context}"

Extracted features:
${featureList}

Return JSON: {"rankings": [{"name": "...", "legalRelevance": 0.8, "severity": "high", "contextSummary": "..."}]}`;

	try {
		const ranked = await reankPatternsViaGemma4(
			features.map((f) => ({
				type: f.type,
				description: f.description,
				severity: 'medium' as const,
				source: f.source,
				metadata: { name: f.name, rawText: f.rawText },
			})),
			documentText,
			maxChars
		);

		return ranked.map((r, idx) => ({
			...features[idx],
			legalRelevance: r.legalRelevance,
			severity: r.severity,
			contextSummary: r.contextSummary,
		}));
	} catch (err) {
		console.warn('[AstLangextractBridge] Gemma4 reranking failed:', err);

		// Fallback: return features with default scores
		return features.map((f) => ({
			...f,
			legalRelevance: 0.6,
			severity: 'low' as const,
			contextSummary: 'Feature extracted (reranking unavailable)',
		}));
	}
}

/**
 * End-to-end: Extract AST + LangExtract + rerank via Gemma4.
 * Single call for complete feature analysis.
 */
export async function extractAndRankAstAndEntities(text: string, isCode: boolean = false): Promise<RankedFeature[]> {
	// Step 1: Extract AST features and entities
	const features = await extractAstAndEntities(text, isCode);

	if (features.length === 0) {
		return [];
	}

	// Step 2: Rerank via Gemma4 for legal relevance
	return await reankAstAndEntitiesViaGemma4(features, text);
}
