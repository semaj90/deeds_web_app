import { ENV } from '$lib/server/env.server.js';

type SectionType =
	| 'facts'
	| 'issues'
	| 'reasoning'
	| 'holding'
	| 'citations'
	| 'parties'
	| 'motions'
	| 'bibliography'
	| 'procedural_history'
	| 'sentencing'
	| 'judgment';

export interface LangExtractSection {
	section_type: SectionType;
	section_subtype?: string;
	text: string;
	start_offset: number;
	end_offset: number;
	confidence?: number;
}

export interface CrimeMetadata {
	crime_code?: string;
	crime_category?: string;
	crime_classification?: 'felony' | 'misdemeanor' | 'infraction' | 'wobbler';
	attempted?: boolean;
	sentencing_year?: number;
	sentence_length_months?: number;
	enhancements?: string[];
}

export interface LangExtractOutput {
	doc_id: string;
	sections: LangExtractSection[];
	metadata: CrimeMetadata;
	language?: string;
	language_confidence?: number;
	extraction_confidence?: number;
}

/**
 * Phase 1: empty LANGEXTRACT_URL = disabled, use TypeScript heuristic directly.
 * Only probe the network when an explicit URL is configured.
 *
 * Legacy localhost fallbacks removed — they caused silent coupling to the
 * phase66-langextract container and blocked normal RAG/evidence/ACP flows
 * when that container was not running.
 */
let cachedBaseUrl: string | null = null;

async function resolveLangExtractBaseUrl(): Promise<string> {
	if (cachedBaseUrl) return cachedBaseUrl;

	const explicit = ENV.LANGEXTRACT_URL?.trim();
  if (!explicit) {
    throw new Error('LANGEXTRACT_URL is not set (disabled)');
  }

  // Probe /health once; cache on success
  try {
    const res = await fetch(`${explicit}/health`, { method: 'GET' });
    if (res.ok) {
      cachedBaseUrl = explicit;
      return explicit;
    }
  } catch {
    // service down — fall through to throw
  }

	throw new Error(`LangExtract service unhealthy at ${explicit}`);
}

function normalizeOutput(raw: unknown, documentId: string): LangExtractOutput {
	const obj = (raw ?? {}) as Partial<LangExtractOutput>;

	const sections = Array.isArray(obj.sections) ? obj.sections : [];
	const safeSections: LangExtractSection[] = sections
		.map((s: any) => ({
			section_type: s?.section_type,
			section_subtype: s?.section_subtype,
			text: String(s?.text ?? ''),
			start_offset: Number.isFinite(s?.start_offset) ? s.start_offset : 0,
			end_offset: Number.isFinite(s?.end_offset) ? s.end_offset : 0,
			confidence: Number.isFinite(s?.confidence) ? s.confidence : undefined
		}))
		// Drop invalid section types (prevents corrupt downstream)
		.filter((s) => isValidSectionType(String(s.section_type)));

	return {
		doc_id: obj.doc_id ?? documentId,
		sections: safeSections,
		metadata: (obj.metadata ?? {}) as CrimeMetadata,
		language: obj.language,
		language_confidence: obj.language_confidence,
		extraction_confidence: obj.extraction_confidence
	};
}

/**
 * Call LangExtract API to extract sections from document text.
 *
 * Phase 1 behaviour:
 *   - LANGEXTRACT_URL empty/unset → heuristic directly, no network call
 *   - LANGEXTRACT_URL set + service healthy → Python/Go service
 *   - LANGEXTRACT_URL set + service down/error → heuristic fallback
 *   - Service returns 0 sections → heuristic fallback
 */
export async function extractSectionsFromText(
	documentText: string,
	documentId: string,
	documentType: 'statute' | 'case' = 'case'
): Promise<LangExtractOutput> {
  // Phase 0: native-TS path — opt in via LANGEXTRACT_NATIVE=true. No Python,
  // no network, no GIL. Uses the regex extractor in langextract/native.ts.
  if (ENV.LANGEXTRACT_NATIVE === 'true') {
    const { extractDocumentNative } = await import('$lib/server/langextract/native.js');
    const out = extractDocumentNative(documentText, documentId, documentType);
    const { entities: _e, ...legacy } = out;
    return legacy;
  }
  // Phase 1: disabled path — no network call when URL is empty
  const langextractUrl = ENV.LANGEXTRACT_URL?.trim();
  if (!langextractUrl) {
    return {
      ...detectSectionsHeuristic(documentText, documentId),
      metadata: { langextractDisabled: true } as CrimeMetadata & { langextractDisabled: boolean },
    };
  }

  try {
    const baseUrl = await resolveLangExtractBaseUrl();
    const prompt =
      documentType === 'case' ? getCaseExtractionPrompt() : getStatuteExtractionPrompt();

    const response = await fetch(`${baseUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: documentText,
        doc_id: documentId,
        prompt,
        extract_metadata: true,
        extract_crimes: documentType === 'case',
      }),
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new Error(
        `LangExtract API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`
      );
    }

    const raw = (await response.json()) as unknown;
    const result = normalizeOutput(raw, documentId);

    // If the model returned 0 valid sections, fall back to heuristic
    if (!result.sections.length) {
      return detectSectionsHeuristic(documentText, documentId);
    }

    return result;
  } catch {
    // Service down or request failed — degrade to TypeScript heuristic
    return detectSectionsHeuristic(documentText, documentId);
  }
}

async function safeReadText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return '';
	}
}

/**
 * Fallback heuristic section detection if LangExtract fails
 */
export function detectSectionsHeuristic(
	documentText: string,
	documentId: string
): LangExtractOutput {
	const sections: LangExtractSection[] = [];
	const lines = documentText.split('\n');

	const sectionPatterns: Record<SectionType, RegExp> = {
		facts: /^(facts|background|procedural background|statement of facts)\b/i,
		issues: /^(issues?|questions presented|legal issues)\b/i,
		reasoning: /^(reasoning|analysis|discussion|court'?s analysis)\b/i,
		holding: /^(holding|conclusion|decision|judgment)\b/i,
		citations: /^(citations|authorities|cases cited|statutes cited)\b/i,
		parties: /^(parties|plaintiff|defendant|appellant|respondent)\b/i,
		motions: /^(motions?|motion to|request for)\b/i,
		bibliography: /^(bibliography|references|sources|cited authorities)\b/i,
		procedural_history: /^(procedural history|procedural background)\b/i,
		sentencing: /^(sentencing|sentence|punishment)\b/i,
		judgment: /^(judgment|verdict|order|decree)\b/i
	};

	let currentSection: SectionType = 'facts';
	let currentText = '';
	let startOffset = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		let foundSection = false;
		for (const [sectionType, pattern] of Object.entries(sectionPatterns)) {
			if (pattern.test(line)) {
				if (currentText.trim().length > 0) {
					sections.push({
						section_type: currentSection,
						text: currentText.trim(),
						start_offset: startOffset,
						end_offset: startOffset + currentText.length,
						confidence: 0.6
					});
				}

				currentSection = sectionType as SectionType;
				currentText = '';
				startOffset = Math.max(0, documentText.indexOf(line));
				foundSection = true;
				break;
			}
		}

		if (!foundSection) currentText += line + '\n';
	}

	if (currentText.trim().length > 0) {
		sections.push({
			section_type: currentSection,
			text: currentText.trim(),
			start_offset: startOffset,
			end_offset: startOffset + currentText.length,
			confidence: 0.6
		});
	}

	return { doc_id: documentId, sections, metadata: {}, extraction_confidence: 0.6 };
}

export function isValidSectionType(value: string): value is SectionType {
	return (
		value === 'facts' ||
		value === 'issues' ||
		value === 'reasoning' ||
		value === 'holding' ||
		value === 'citations' ||
		value === 'parties' ||
		value === 'motions' ||
		value === 'bibliography' ||
		value === 'procedural_history' ||
		value === 'sentencing' ||
		value === 'judgment'
	);
}

function getCaseExtractionPrompt(): string {
	return `You are a legal document analyzer. Extract and label the following sections from the provided legal case document:

- facts
- issues
- reasoning
- holding
- citations
- parties
- motions
- bibliography
- procedural_history
- sentencing
- judgment

For each section, return:
- section_type (one of the above)
- section_subtype (optional)
- text
- start_offset
- end_offset
- confidence (0-1)

Also extract crime metadata:
- crime_code
- crime_category
- crime_classification ("felony" | "misdemeanor" | "infraction" | "wobbler")
- attempted
- sentencing_year
- sentence_length_months
- enhancements (array)

Return JSON: { "sections": [...], "metadata": {...} }`;
}

/**
 * Statute extraction prompt: maps statute content into existing SectionType union.
 * Does NOT invent new section types (heading, definitions, penalties, etc.)
 */
function getStatuteExtractionPrompt(): string {
	return `You are a legal document analyzer. Extract sections from a statute/legal code and map them into ONLY these section types:

- facts (use for "heading/title/summary/purpose")
- issues (use for "definitions/scope/applicability")
- reasoning (use for "requirements/prohibitions/conditions")
- holding (use for "penalties/enforcement/shall/must outcomes")
- citations (use for cross-references)
- parties (use for agencies/actors referenced)
- sentencing (use for penalty duration/terms)

Do NOT use section types outside this list.
Return JSON with sections array using ONLY allowed section_type values.`;
}

export interface EvidenceProfile {
	evidence_type_classification: string;
	key_entities: Array<{ text: string; label: string; confidence: number }>;
	legal_relevance: string;
	admissibility_indicators: string[];
	suggested_tags: string[];
}

/**
 * Extract a structured evidence profile via LangExtract schema validation.
 * Returns null if LangExtract is unavailable (non-fatal).
 */
export async function extractEvidenceProfile(
	text: string,
	evidenceType: string
): Promise<EvidenceProfile | null> {
	try {
		const baseUrl = await resolveLangExtractBaseUrl();
		const response = await fetch(`${baseUrl}/extract`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: text.slice(0, 15_000),
				doc_id: `evidence-profile-${Date.now()}`,
				prompt: getEvidenceProfilePrompt(evidenceType),
				extract_metadata: true,
			}),
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) return null;

		const raw = await response.json() as any;
		return {
			evidence_type_classification: raw.evidence_type_classification ?? evidenceType,
			key_entities: Array.isArray(raw.key_entities) ? raw.key_entities : [],
			legal_relevance: raw.legal_relevance ?? '',
			admissibility_indicators: Array.isArray(raw.admissibility_indicators) ? raw.admissibility_indicators : [],
			suggested_tags: Array.isArray(raw.suggested_tags) ? raw.suggested_tags : [],
		};
	} catch {
		return null;
	}
}

function getEvidenceProfilePrompt(evidenceType: string): string {
	return `You are a legal evidence analyzer. Given a ${evidenceType} evidence document, extract:

- evidence_type_classification: one of (document, photo, video, audio, physical, digital, witness_statement, forensic, documentary, testimonial, demonstrative, real, circumstantial, hearsay, expert, scientific)
- key_entities: array of {text, label, confidence} where label is PERSON/ORG/DATE/STATUTE/CASE/MONEY/LOCATION
- legal_relevance: brief statement of why this evidence matters legally
- admissibility_indicators: array of strings (e.g. "chain of custody documented", "hearsay exception applies")
- suggested_tags: array of tag strings for categorization

Return JSON: { "evidence_type_classification": "...", "key_entities": [...], "legal_relevance": "...", "admissibility_indicators": [...], "suggested_tags": [...] }`;
}

export async function extractSectionsBatch(
	documents: Array<{ id: string; text: string; type?: 'statute' | 'case' }>,
	concurrency = 3
): Promise<LangExtractOutput[]> {
	const results: LangExtractOutput[] = [];
	const errors: Array<{ docId: string; error: string }> = [];

	for (let i = 0; i < documents.length; i += concurrency) {
		const batch = documents.slice(i, i + concurrency);
		await Promise.all(
			batch.map(async (doc) => {
				try {
					const r = await extractSectionsFromText(doc.text, doc.id, doc.type ?? 'case');
					results.push(r);
				} catch (e) {
					results.push(detectSectionsHeuristic(doc.text, doc.id));
					errors.push({ docId: doc.id, error: String(e) });
				}
			})
		);
	}

	if (errors.length) {
		console.warn(`[LangExtract] ${errors.length} documents failed; used heuristic fallback`);
	}

	return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google LangExtract Integration (Official Library)
// Uses gemma4-rotorquant:latest via Ollama — much better structured extraction
// ─────────────────────────────────────────────────────────────────────────────

export interface GoogleLangExtractEntity {
	extraction_class: string;
	extraction_text: string;
	attributes: Record<string, string>;
	start_char?: number;
	end_char?: number;
}

export interface GoogleLangExtractResult {
	document_id: string;
	total_extractions: number;
	extractions: GoogleLangExtractEntity[];
	metadata: {
		model_id: string;
		extraction_passes: number;
		temperature: number;
	};
}

/**
 * Extract structured legal entities using Google's official LangExtract library.
 * Falls back to heuristic extraction if service unavailable.
 *
 * Entity types: PARTY, DATE, CITATION, MONEY, STATUTE, OBLIGATION, TERM, LOCATION
 */
export async function extractLegalEntities(
	text: string,
	options: {
		extraction_passes?: number;
		temperature?: number;
	} = {}
): Promise<GoogleLangExtractResult | null> {
	try {
		const baseUrl = await resolveLangExtractBaseUrl();
		const response = await fetch(`${baseUrl}/extract`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: text.slice(0, 50_000),
				extraction_type: 'legal',
				extraction_passes: options.extraction_passes ?? 1,
				temperature: options.temperature ?? 0.3,
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!response.ok) {
			console.warn(`[LangExtract:legal] Service returned ${response.status}`);
			return null;
		}

		return await response.json() as GoogleLangExtractResult;
	} catch (e) {
		console.warn('[LangExtract:legal] Service unavailable:', e);
		return null;
	}
}

/**
 * Extract forensic/evidence entities using Google's official LangExtract library.
 *
 * Entity types: PERSON, DATE, LOCATION, PHONE, EMAIL, DOCUMENT, IDENTIFIER, QUOTE
 */
export async function extractEvidenceEntities(
	text: string,
	options: {
		extraction_passes?: number;
		temperature?: number;
	} = {}
): Promise<GoogleLangExtractResult | null> {
	try {
		const baseUrl = await resolveLangExtractBaseUrl();
		const response = await fetch(`${baseUrl}/extract`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: text.slice(0, 50_000),
				extraction_type: 'evidence',
				extraction_passes: options.extraction_passes ?? 1,
				temperature: options.temperature ?? 0.3,
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!response.ok) {
			console.warn(`[LangExtract:evidence] Service returned ${response.status}`);
			return null;
		}

		return await response.json() as GoogleLangExtractResult;
	} catch (e) {
		console.warn('[LangExtract:evidence] Service unavailable:', e);
		return null;
	}
}

/**
 * Extract from file path or URL using Google LangExtract.
 * Supports PDF, TXT, and web URLs.
 */
export async function extractFromFile(
	filePath: string,
	options: {
		extraction_type?: 'legal' | 'evidence';
		extraction_passes?: number;
	} = {}
): Promise<GoogleLangExtractResult | null> {
	try {
		const baseUrl = await resolveLangExtractBaseUrl();
		const response = await fetch(`${baseUrl}/extract/file`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				file_path: filePath,
				extraction_type: options.extraction_type ?? 'legal',
				extraction_passes: options.extraction_passes ?? 2,
			}),
			signal: AbortSignal.timeout(60_000),
		});

		if (!response.ok) {
			console.warn(`[LangExtract:file] Service returned ${response.status}`);
			return null;
		}

		return await response.json() as GoogleLangExtractResult;
	} catch (e) {
		console.warn('[LangExtract:file] Service unavailable:', e);
		return null;
	}
}

/**
 * Custom extraction with user-defined prompt and few-shot examples.
 * Flexible for any domain (medical, financial, research).
 */
export async function extractCustom(
	text: string,
	prompt: string,
	examples: Array<{
		text: string;
		extractions: Array<{
			extraction_class: string;
			extraction_text: string;
			attributes?: Record<string, string>;
		}>;
	}> = [],
	options: {
		extraction_passes?: number;
		temperature?: number;
	} = {}
): Promise<GoogleLangExtractResult | null> {
	try {
		const baseUrl = await resolveLangExtractBaseUrl();
		const response = await fetch(`${baseUrl}/extract`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: text.slice(0, 50_000),
				extraction_type: 'custom',
				custom_prompt: prompt,
				custom_examples: examples,
				extraction_passes: options.extraction_passes ?? 1,
				temperature: options.temperature ?? 0.3,
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!response.ok) {
			console.warn(`[LangExtract:custom] Service returned ${response.status}`);
			return null;
		}

		return await response.json() as GoogleLangExtractResult;
	} catch (e) {
		console.warn('[LangExtract:custom] Service unavailable:', e);
		return null;
	}
}
