import { ENV } from '$lib/server/env.server.js';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const sectionTypeSchema = z.enum([
	'facts',
	'issues',
	'reasoning',
	'holding',
	'citations',
	'parties',
	'motions',
	'bibliography',
	'procedural_history',
	'sentencing',
	'judgment'
]);

type SectionType = z.infer<typeof sectionTypeSchema>;

const legalSectionSchema = z.object({
	section_type: sectionTypeSchema,
	section_subtype: z.string().max(80).optional(),
	text: z.string().min(1),
	start_offset: z.number().int().nonnegative(),
	end_offset: z.number().int().positive(),
	confidence: z.number().min(0).max(1).optional()
});

/**
 * Contract expected from a section extractor. Offsets are JavaScript UTF-16
 * code-unit offsets into the exact submitted text; extracted text must match
 * that source slice so callers can cite the original evidence.
 */
export const legalSectionExtractionResponseSchema = z.object({
	schema: z.literal('atlas.legal-section-extraction.v1'),
	doc_id: z.string().min(1),
	source_sha256: z.string().regex(/^[a-f0-9]{64}$/i),
	offset_unit: z.literal('utf16_code_unit'),
	producer_revision: z.string().min(1),
	model_id: z.string().min(1).nullable(),
	sections: z.array(legalSectionSchema),
	metadata: z.record(z.string(), z.unknown()).optional(),
	extraction_confidence: z.number().min(0).max(1).optional()
}).strict();

export interface LangExtractSection {
	section_type: SectionType;
	section_subtype?: string;
	text: string;
	start_offset: number;
	end_offset: number;
	start_byte?: number;
	end_byte?: number;
	confidence?: number;
}

export interface CrimeMetadata {
	langextractDisabled?: boolean;
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
	extraction_source?: 'section-extractor' | 'heading-heuristic';
	fallback_reason?: 'SIDECAR_SECTION_SCHEMA_MISMATCH' | 'SIDECAR_RETURNED_NO_SECTIONS' | 'SIDECAR_REQUEST_FAILED';
}

/** Convert UTF-16 code-unit offsets used by JavaScript strings into UTF-8 byte offsets. */
export function utf16RangeToUtf8ByteRange(
	sourceText: string,
	startOffset: number,
	endOffset: number
): { startByte: number; endByte: number } {
	const isBoundary = (offset: number) =>
		Number.isInteger(offset) && offset >= 0 && offset <= sourceText.length &&
		!(offset > 0 && offset < sourceText.length &&
			/^[\uDC00-\uDFFF]$/.test(sourceText[offset] ?? '') &&
			/^[\uD800-\uDBFF]$/.test(sourceText[offset - 1] ?? ''));
	if (!isBoundary(startOffset) || !isBoundary(endOffset) || startOffset >= endOffset) {
		throw new RangeError('INVALID_UTF16_SOURCE_RANGE');
	}
	return {
		startByte: Buffer.byteLength(sourceText.slice(0, startOffset), 'utf8'),
		endByte: Buffer.byteLength(sourceText.slice(0, endOffset), 'utf8')
	};
}

/**
 * Phase 1: empty LANGEXTRACT_URL / MINIFORGE_SIDECAR_URL = disabled,
 * use TypeScript heuristic directly. Only probe the network when an explicit
 * sidecar URL is configured.
 */
let cachedBaseUrl: string | null = null;

async function resolveLangExtractBaseUrl(): Promise<string> {
	if (cachedBaseUrl) return cachedBaseUrl;

	const explicit = ENV.LANGEXTRACT_URL?.trim() || ENV.MINIFORGE_SIDECAR_URL?.trim();
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

export function parseLegalSectionResponse(
	raw: unknown,
	documentId: string,
	sourceText: string
): LangExtractOutput | null {
	const parsed = legalSectionExtractionResponseSchema.safeParse(raw);
	const sourceSha256 = createHash('sha256').update(sourceText, 'utf8').digest('hex');
	if (
		!parsed.success ||
		parsed.data.doc_id !== documentId ||
		parsed.data.source_sha256 !== sourceSha256
	) return null;

	const sections: LangExtractSection[] = [];
	for (const section of parsed.data.sections) {
		if (
			section.start_offset >= section.end_offset ||
			section.end_offset > sourceText.length ||
			sourceText.slice(section.start_offset, section.end_offset) !== section.text
		) return null;
		let byteRange: { startByte: number; endByte: number };
		try {
			byteRange = utf16RangeToUtf8ByteRange(sourceText, section.start_offset, section.end_offset);
		} catch {
			return null;
		}
		sections.push({ ...section, start_byte: byteRange.startByte, end_byte: byteRange.endByte });
	}

	return {
		doc_id: documentId,
		sections,
		metadata: (parsed.data.metadata ?? {}) as CrimeMetadata,
		extraction_confidence: parsed.data.extraction_confidence,
		extraction_source: 'section-extractor'
	};
}

/**
 * Call LangExtract API to extract sections from document text.
 *
 * Phase 1 behaviour:
 *   - LANGEXTRACT_URL empty/unset → heuristic directly, no network call
 *   - LANGEXTRACT_URL or MINIFORGE_SIDECAR_URL set + service healthy → Python sidecar
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
    return { ...legacy, extraction_source: 'heading-heuristic' };
  }
  // Phase 1: disabled path — no network call when URL is empty
  const langextractUrl = ENV.LANGEXTRACT_URL?.trim() || ENV.MINIFORGE_SIDECAR_URL?.trim();
  if (!langextractUrl) {
    return {
      ...detectSectionsHeuristic(documentText, documentId),
      metadata: { langextractDisabled: true },
      extraction_source: 'heading-heuristic'
    };
  }

  try {
    const baseUrl = await resolveLangExtractBaseUrl();
    const response = await fetch(`${baseUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: documentText,
        document_id: documentId,
        source_type: 'plain_text',
        extraction_mode: documentType === 'case' ? 'full' : 'concepts',
        section_contract: 'atlas.legal-section-extraction.v1',
        source_sha256: createHash('sha256').update(documentText, 'utf8').digest('hex'),
        offset_unit: 'utf16_code_unit',
      }),
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new Error(
        `LangExtract API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`
      );
    }

    const raw = (await response.json()) as unknown;
    const result = parseLegalSectionResponse(raw, documentId, documentText);

    // The current :8095 /extract contract returns chunks/entities, not legal
    // sections. Keep that mismatch explicit instead of treating an empty
    // normalized array as successful model extraction.
    if (!result) {
      return {
        ...detectSectionsHeuristic(documentText, documentId),
        extraction_source: 'heading-heuristic',
        fallback_reason: 'SIDECAR_SECTION_SCHEMA_MISMATCH'
      };
    }
    if (!result.sections.length) {
      return {
        ...detectSectionsHeuristic(documentText, documentId),
        extraction_source: 'heading-heuristic',
        fallback_reason: 'SIDECAR_RETURNED_NO_SECTIONS'
      };
    }

    return result;
  } catch {
    // Service down or request failed — degrade to TypeScript heuristic
    return {
      ...detectSectionsHeuristic(documentText, documentId),
      extraction_source: 'heading-heuristic',
      fallback_reason: 'SIDECAR_REQUEST_FAILED'
    };
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

	return {
		doc_id: documentId,
		sections,
		metadata: {},
		extraction_confidence: 0.6,
		extraction_source: 'heading-heuristic'
	};
}

export function isValidSectionType(value: string): value is SectionType {
	return sectionTypeSchema.safeParse(value).success;
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
	if (documents.length > 50) throw new RangeError('Maximum 50 documents per batch');
	const results = new Array<LangExtractOutput>(documents.length);
	const boundedConcurrency = Math.min(5, Math.max(1, Number.isFinite(concurrency) ? Math.trunc(concurrency) : 3));

	for (let i = 0; i < documents.length; i += boundedConcurrency) {
		const batch = documents.slice(i, i + boundedConcurrency);
		await Promise.all(
			batch.map(async (doc, batchIndex) => {
				const resultIndex = i + batchIndex;
				try {
					results[resultIndex] = await extractSectionsFromText(doc.text, doc.id, doc.type ?? 'case');
				} catch {
					results[resultIndex] = {
						...detectSectionsHeuristic(doc.text, doc.id),
						extraction_source: 'heading-heuristic',
						fallback_reason: 'SIDECAR_REQUEST_FAILED'
					};
				}
			})
		);
	}

	return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google LangExtract Integration (Official Library)
// Uses ornith-1.5-9b via Ollama — much better structured extraction
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
