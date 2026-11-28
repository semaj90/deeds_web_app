/**
 * Document routing policy (pure, no I/O).
 *
 * Produces a DocumentAnalysisPlanV1-shaped decision from already-measured facts.
 * Character counts and regex signals are routing hints only. The embedding
 * admission decision uses the exact model token count, supplied by the caller
 * from the EG2 tokenizer. Without a token count the plan is estimate-only and
 * is not admitted for embedding.
 *
 * `document-processor.ts` is the single caller. Do not add a second router.
 * Production serving cap is a parameter. It stays at 512 until the operator approves a change.
 */

export const DOCUMENT_ROUTING_POLICY_REVISION = 'atlas.document-routing-policy.v1' as const;

export const CONTEXT_BUCKETS = [512, 1024, 2048, 4096, 8192] as const;
export type ContextBucket = (typeof CONTEXT_BUCKETS)[number];

export type PrimaryRoute =
  | 'SINGLE_PASS'
  | 'STRUCTURAL_CHUNKS'
  | 'HIERARCHICAL_DAG'
  | 'OCR'
  | 'MULTIMODAL'
  | 'REVIEW_REQUIRED';

export interface TextHeuristics {
  /** Unicode code points, not UTF-16 units */
  characterCount: number;
  byteLength: number;
  controlCharCount: number;
  replacementCharCount: number;
  /** Lines (trimmed, non-empty) that repeat an earlier identical line */
  duplicateLineCount: number;
  nonEmptyLineCount: number;
  legalSectionCount: number;
  legalCitationCount: number;
  caseIdentifierCount: number;
  markdownHeadingCount: number;
}

// Starting heuristics. Routing hints only, not legal classifiers.
const LEGAL_SECTION = /(?:^|\n)[ \t]*(?:§|Section|Article)[ \t]+\d+/gi;
const LEGAL_CITATION = /\b\d+[ \t]+(?:U\.S\.C\.|C\.F\.R\.)[ \t]*§?[ \t]*\d+/g;
const CASE_IDENTIFIER = /\b(?:Case|Docket)[ \t]*(?:No\.?)?[ \t]*:?[ \t]*[\w:-]+/gi;
const MARKDOWN_HEADING = /(?:^|\n)#{1,6}[ \t]+\S/g;
const CONTROL_CHAR = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
const REPLACEMENT_CHAR = /�/g;

function countMatches(text: string, re: RegExp): number {
	return (text.match(re) ?? []).length;
}

/** Deterministic text signals. Pure: same input always gives the same output. */
export function analyzeTextHeuristics(text: string): TextHeuristics {
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	const seen = new Set<string>();
	let duplicates = 0;
	for (const line of lines) {
		if (seen.has(line)) duplicates++;
		else seen.add(line);
	}
	return {
		characterCount: [...text].length,
		byteLength: Buffer.byteLength(text, 'utf8'),
		controlCharCount: countMatches(text, CONTROL_CHAR),
		replacementCharCount: countMatches(text, REPLACEMENT_CHAR),
		duplicateLineCount: duplicates,
		nonEmptyLineCount: lines.length,
		legalSectionCount: countMatches(text, LEGAL_SECTION),
		legalCitationCount: countMatches(text, LEGAL_CITATION),
		caseIdentifierCount: countMatches(text, CASE_IDENTIFIER),
		markdownHeadingCount: countMatches(text, MARKDOWN_HEADING),
	};
}

export interface RoutingFacts {
	mimeType: string;
	fileName: string;
	/** Exact EG2 tokens including the recipe prefix. Null = not measured. */
	tokenCount: number | null;
	/** Text-layer characters for PDFs (after pdf-parse). Null = not a PDF or not measured. */
	pdfTextCharacters?: number | null;
	heuristics: TextHeuristics;
	/** Production serving cap. Defaults to 512 (current :8094 GEMMA2_MAX_TOKENS). */
	servingCapTokens?: number;
	/**
	 * Largest sequence the TensorRT-RTX lane may take. 0 or omitted = CPU only (default).
	 * Measured limit with :8090 resident (8 GB card): 2048 passed, 4096 and 8192 ran out of GPU memory.
	 */
	gpuMaxTokens?: number;
}

export interface DocumentRoutingPlan {
	schema: 'atlas.document-analysis-plan.v1';
	policyRevision: typeof DOCUMENT_ROUTING_POLICY_REVISION;
	tokenCount: number | null;
	tokenCountSource: 'exact' | 'unmeasured';
	contextBucket: ContextBucket | null;
	primaryRoute: PrimaryRoute;
	auxiliaryStages: string[];
	requiresChunking: boolean;
	/** Always false: truncation is never an admitted outcome. */
	truncationAllowed: false;
	servingCapTokens: number;
	/** CPU unless the document fits the configured GPU limit. Never silently assumed. */
	executionLane: 'CPU' | 'TRT_RTX_CANDIDATE';
	reasonCodes: string[];
}

const DEFAULT_SERVING_CAP = 512;
const MAX_BUCKET: ContextBucket = 8192;
const SCANNED_PDF_TEXT_FLOOR = 50;
const NOISE_REPLACEMENT_RATIO = 0.01;
const NOISE_CONTROL_RATIO = 0.001;

function isImage(mime: string, name: string): boolean {
	return mime.startsWith('image/') || /\.(png|jpe?g|tiff?|bmp|webp)$/i.test(name);
}

function isAvMedia(mime: string, name: string): boolean {
	return /^(audio|video)\//.test(mime) || /\.(mp3|wav|m4a|mp4|mkv|webm|avi|mov)$/i.test(name);
}

function isPdf(mime: string, name: string): boolean {
	return mime === 'application/pdf' || /\.pdf$/i.test(name);
}

/** Smallest context bucket that covers the token count, capped at the largest bucket. */
export function bucketFor(tokens: number): ContextBucket {
	for (const b of CONTEXT_BUCKETS) if (tokens <= b) return b;
	return MAX_BUCKET;
}

export function laneFor(tokenCount: number | null, gpuMaxTokens: number | undefined): 'CPU' | 'TRT_RTX_CANDIDATE' {
	if (!gpuMaxTokens || gpuMaxTokens <= 0 || tokenCount === null) return 'CPU';
	return tokenCount <= gpuMaxTokens ? 'TRT_RTX_CANDIDATE' : 'CPU';
}

export function planDocumentRoute(facts: RoutingFacts): DocumentRoutingPlan {
	const cap = facts.servingCapTokens ?? DEFAULT_SERVING_CAP;
	if (!Number.isSafeInteger(cap) || cap < 1) throw new Error('ROUTING_SERVING_CAP_INVALID');

	const reasons: string[] = [];
	const aux: string[] = [];
	const h = facts.heuristics;

	const base = {
		schema: 'atlas.document-analysis-plan.v1' as const,
		policyRevision: DOCUMENT_ROUTING_POLICY_REVISION,
		tokenCount: facts.tokenCount,
		tokenCountSource: facts.tokenCount === null ? ('unmeasured' as const) : ('exact' as const),
		truncationAllowed: false as const,
		servingCapTokens: cap,
		executionLane: laneFor(facts.tokenCount, facts.gpuMaxTokens),
	};

	// Media first: the text stack does not apply to raw audio or image bytes.
	if (isAvMedia(facts.mimeType, facts.fileName)) {
		reasons.push('MEDIA_BYTES_ROUTED_TO_MULTIMODAL');
		return { ...base, contextBucket: null, primaryRoute: 'MULTIMODAL', auxiliaryStages: ['transcribe'],
			requiresChunking: false, reasonCodes: reasons };
	}
	if (isImage(facts.mimeType, facts.fileName)) {
		reasons.push('IMAGE_ROUTED_TO_MULTIMODAL');
		return { ...base, contextBucket: null, primaryRoute: 'MULTIMODAL', auxiliaryStages: ['vision_ocr'],
			requiresChunking: false, reasonCodes: reasons };
	}

	// Scanned PDF: a text layer that is missing or tiny means OCR, not quarantine.
	if (isPdf(facts.mimeType, facts.fileName)) {
		const textChars = facts.pdfTextCharacters ?? null;
		if (textChars !== null && textChars < SCANNED_PDF_TEXT_FLOOR) {
			reasons.push('PDF_TEXT_LAYER_BELOW_FLOOR');
			return { ...base, contextBucket: null, primaryRoute: 'OCR', auxiliaryStages: ['ocr', 'docling'],
				requiresChunking: false, reasonCodes: reasons };
		}
	}

	// Extraction quality gates. Noise is reviewed, never embedded silently.
	const chars = Math.max(1, h.characterCount);
	if (h.replacementCharCount / chars > NOISE_REPLACEMENT_RATIO) {
		reasons.push('EXTRACTION_REPLACEMENT_CHARS_OVER_LIMIT');
		return { ...base, contextBucket: null, primaryRoute: 'REVIEW_REQUIRED', auxiliaryStages: [],
			requiresChunking: false, reasonCodes: reasons };
	}
	if (h.controlCharCount / chars > NOISE_CONTROL_RATIO) {
		reasons.push('EXTRACTION_CONTROL_CHARS_OVER_LIMIT');
		return { ...base, contextBucket: null, primaryRoute: 'REVIEW_REQUIRED', auxiliaryStages: [],
			requiresChunking: false, reasonCodes: reasons };
	}
	if (h.characterCount === 0) {
		reasons.push('EMPTY_TEXT');
		return { ...base, contextBucket: null, primaryRoute: 'REVIEW_REQUIRED', auxiliaryStages: [],
			requiresChunking: false, reasonCodes: reasons };
	}

	// Structural hints (never identity or authorization).
	if (h.legalSectionCount > 0) aux.push('structure_parse');
	if (h.markdownHeadingCount > 0) aux.push('structure_parse');
	if (h.legalCitationCount > 0) aux.push('citation_extract');
	if (h.caseIdentifierCount > 0) aux.push('case_identifier_extract');
	if (h.duplicateLineCount > 0) reasons.push('DUPLICATE_LINES_PRESENT');
	aux.push('nlp_classify');
	const auxiliary = [...new Set(aux)];

	// Admission needs an exact count. Without one, plan only and do not admit.
	if (facts.tokenCount === null) {
		reasons.push('TOKEN_COUNT_UNMEASURED');
		return { ...base, contextBucket: null, primaryRoute: 'REVIEW_REQUIRED', auxiliaryStages: auxiliary,
			requiresChunking: false, reasonCodes: reasons };
	}

	const t = facts.tokenCount;
	if (t <= 0) {
		reasons.push('ZERO_TOKENS');
		return { ...base, contextBucket: null, primaryRoute: 'REVIEW_REQUIRED', auxiliaryStages: auxiliary,
			requiresChunking: false, reasonCodes: reasons };
	}
	if (t <= cap) {
		reasons.push('FITS_SERVING_CAP');
		return { ...base, contextBucket: bucketFor(t), primaryRoute: 'SINGLE_PASS', auxiliaryStages: auxiliary,
			requiresChunking: false, reasonCodes: reasons };
	}
	if (t <= MAX_BUCKET) {
		reasons.push('EXCEEDS_SERVING_CAP_CHUNK_REQUIRED');
		return { ...base, contextBucket: bucketFor(t), primaryRoute: 'STRUCTURAL_CHUNKS', auxiliaryStages: auxiliary,
			requiresChunking: true, reasonCodes: reasons };
	}
	reasons.push('EXCEEDS_LARGEST_BUCKET_HIERARCHICAL_REQUIRED');
	return { ...base, contextBucket: MAX_BUCKET, primaryRoute: 'HIERARCHICAL_DAG', auxiliaryStages: auxiliary,
		requiresChunking: true, reasonCodes: reasons };
}
