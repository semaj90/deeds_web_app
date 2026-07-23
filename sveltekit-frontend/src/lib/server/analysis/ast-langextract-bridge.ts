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

export interface ExtractedFeature {
	type:
		| 'ast_function'
		| 'ast_class'
		| 'ast_method'
		| 'ast_arrow'
		| 'ast_import'
		| 'entity_person'
		| 'entity_org'
		| 'entity_location'
		| 'entity_statute'
		| 'entity_case';
	name: string;
	description: string;
	source: 'ast-grep' | 'langextract' | 'pattern';
	rawText?: string;
	lineNumber?: number;
	confidence?: number;
}

async function getMiniforgeNlpClient() {
	try {
		const mod = await import('$lib/server/nlp/miniforge-nlp-sidecar.js');
		return mod.createMiniforgeNlpSidecarClient();
	} catch {
		return null;
	}
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
	const sidecar = await getMiniforgeNlpClient();

	if (sidecar) {
		try {
			const analysis = await sidecar.analyze({
				text: text.slice(0, 100_000),
				sourceType: isCode ? 'codebase' : 'plain_text',
				extractionMode: isCode ? 'full' : 'entities',
			});

			for (const entity of analysis.entities) {
				const typeMapping: Record<string, ExtractedFeature['type']> = {
					PERSON: 'entity_person',
					ORG: 'entity_org',
					LOCATION: 'entity_location',
					STATUTE: 'entity_statute',
					CASE: 'entity_case',
					CODE_SYMBOL: 'ast_function',
				};
				const mappedType = typeMapping[entity.label];
				if (mappedType) {
					features.push({
						type: mappedType,
						name: entity.text,
						description: `${entity.label} entity: "${entity.text}"`,
						source: 'langextract',
						rawText: entity.text,
						confidence: entity.confidence,
					});
				}
			}

			for (const feature of analysis.features) {
				const mappedType = (feature.kind as ExtractedFeature['type']) ?? 'ast_function';
				if (
					mappedType === 'ast_function' ||
					mappedType === 'ast_class' ||
					mappedType === 'ast_method' ||
					mappedType === 'ast_arrow' ||
					mappedType === 'ast_import'
				) {
					features.push({
						type: mappedType,
						name: feature.name,
						description: feature.description,
						source: feature.source === 'ast-grep' ? 'ast-grep' : 'pattern',
						rawText: feature.rawText,
						lineNumber: feature.lineNumber,
						confidence: feature.confidence,
					});
				}
			}
		} catch (err) {
			console.warn('[AstLangextractBridge] Miniforge NLP sidecar unavailable:', err);
		}
	}

	// Path 1: LangExtract entities (preferred for non-code text).
	// Code paths already get entity coverage from the sidecar, so avoid the
	// extra unified entity extractor there to keep the bridge responsive.
	if (!isCode) {
		try {
			const { extractEntities } = await import('./entity-extraction.js');
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
	}

	// Path 2: AST-Grep features (code only)
	// Uses @ast-grep/napi real AST parsing (confidence 0.92–0.95).
	if (isCode) {
		let astExtractor: { extractAstFeatures: (t: string) => Promise<ExtractedFeature[]> } | null = null;
		try {
			astExtractor = await import('./ast-grep-extractor.js');
		} catch (importErr) {
			console.warn('[AstLangextractBridge] AST extractor unavailable (regex fallback skipped):', importErr);
		}

		if (astExtractor) {
			try {
				const astFeatures = await astExtractor.extractAstFeatures(text);
				features.push(...astFeatures);
			} catch (err) {
				console.warn('[AstLangextractBridge] AST extraction failed:', err);
			}
		}
	}

	const deduped = new Map<string, ExtractedFeature>();
	for (const feature of features) {
		const key = `${feature.type}:${feature.name}:${feature.lineNumber ?? 0}:${feature.source}`;
		if (!deduped.has(key)) deduped.set(key, feature);
	}

	return [...deduped.values()];
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
		const { reankPatternsViaGemma4 } = await import('./gemma4-nlp-reranker.js');
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

/**
 * Backward-compatible alias for callers that expect the older bridge name.
 * This returns the lightweight extraction pass only; ranking stays explicit.
 */
export async function analyzeCodeWithLangExtract(text: string, isCode: boolean = false): Promise<ExtractedFeature[]> {
	return extractAstAndEntities(text, isCode);
}
