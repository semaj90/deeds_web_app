import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

export type LangExtractSourceType =
  | 'plain_text'
  | 'docling_markdown'
  | 'docling_json'
  | 'ocr_text'
  | 'transcript'
  | 'codebase'
  | 'general';

export type LangExtractExtractionMode = 'entities' | 'relationships' | 'concepts' | 'full';

export interface LangExtractAnalyzeRequest {
  text: string;
  source_type?: LangExtractSourceType;
  extraction_mode?: LangExtractExtractionMode;
  document_id?: string;
  source_ref?: string;
  packet_key?: string;
  language?: string;
  model_id?: string;
  max_chars?: number;
}

export interface LangExtractHealthResponse {
  status?: string;
  model?: string;
  runtime?: {
    pythonExecutable?: string;
    pythonVersion?: string;
    environmentType?: string;
  };
  capabilities?: Record<string, boolean>;
  imports?: Record<string, unknown>;
  timestamp?: number;
}

export interface LangExtractAnalyzeEntity {
  kind?: string;
  text: string;
  label: string;
  start?: number | null;
  end?: number | null;
  confidence?: number;
  source?: string;
  [key: string]: unknown;
}

export interface LangExtractAnalyzeChunk {
  kind: string;
  text: string;
  start: number;
  end: number;
  symbol?: string | null;
  language?: string | null;
}

export interface LangExtractAnalyzeFeature {
  kind: string;
  name: string;
  description: string;
  source: string;
  lineNumber?: number | null;
  confidence?: number;
  rawText?: string | null;
}

export interface LangExtractAnalyzeResponse {
  document_id: string;
  source_type: LangExtractSourceType;
  extraction_mode: LangExtractExtractionMode;
  entities: LangExtractAnalyzeEntity[];
  relationships: Array<Record<string, unknown>>;
  concepts: string[];
  chunks?: LangExtractAnalyzeChunk[];
  features?: LangExtractAnalyzeFeature[];
  metadata: Record<string, unknown>;
  capabilities?: Record<string, boolean>;
  processing_time_ms: number;
}

export interface LangExtractDocumentationFactsRequest {
  text: string;
  sourceUrl: string;
  sourceRevision: string;
  productVersion?: string;
  model_id?: string;
}

export interface LangExtractDocumentationFact {
  schema: 'atlas.documentation-fact.v1';
  subject: string;
  predicate: string;
  object: string;
  statement: string;
  evidenceText: string;
  sourceUrl: string;
  sourceRevision: string;
  startChar: number;
  endChar: number;
  startByte: number;
  endByte: number;
  alignmentStatus: 'MATCH_EXACT' | 'MATCH_FUZZY' | 'MATCH_LESSER';
  productVersion: string;
  confidence: number;
  extractionMethod: string;
  customAttributesVersion: 'atlas.langextract-custom-attributes.v1';
  customAttributes: Record<string, string | number | boolean | null>;
  canonicalAuthority: false;
}

export interface LangExtractDocumentationFactsResponse {
  facts: LangExtractDocumentationFact[];
  apiRules: Array<Record<string, unknown>>;
  modelId?: string | null;
  provider: string;
  producerRevision: string;
  inputHash: string;
  outputHash: string;
  generationControls: Record<string, unknown>;
  alignmentSummary: Record<string, number>;
  canonicalAuthority: false;
  error?: string | null;
}

export interface OaklibLabelSearchRequestV1 {
  terms: string[];
  maxCandidatesPerTerm?: number;
}

export interface OaklibLabelSearchResponseV1 {
  schema: 'atlas.oaklib-label-search-response.v1';
  status: 'PROPOSAL_ONLY';
  ontologyRevision: string;
  producerRevision: string;
  matches: Array<{ searchText: string; externalIds: string[] }>;
  candidateBundle: Record<string, unknown>;
  canonicalAuthority: false;
  writesPerformed: false;
}

export interface LangExtractSidecarRequestOptions {
  baseUrl?: string;
  timeoutMs?: number;
  path?: '/extract' | '/analyze';
}

export function resolveLangExtractBaseUrl(baseUrl?: string): string {
  return baseUrl ?? (ENV.MINIFORGE_SIDECAR_URL || ENV.LANGEXTRACT_URL || 'http://127.0.0.1:8095');
}

// CHUNK0's one remaining gap (openspec/changes/parent-atlas-code-ingestion-pipeline
// tasks.md): the JSON boundary to the :8095 sidecar was read with a bare `as T`
// type assertion and never actually validated at runtime. These schemas are
// deliberately permissive (`.passthrough()` on both, most sidecar-only fields
// `.optional()`) rather than a tight mirror of the TS interfaces above — a live
// /analyze call was observed carrying real fields the interface never declared
// (`pass_results`, `control5`, `experiment_feature_matrix`, `event_hypergraph`).
// The goal is to catch a genuinely malformed/wrong-shaped response (missing
// `document_id`, `chunks` not an array, etc.), not to reject legitimate sidecar
// evolution the TS interface hasn't caught up with yet.
const langExtractHealthResponseSchema = z.looseObject({
  status: z.string().optional(),
  model: z.string().optional(),
  runtime: z.looseObject({}).optional(),
  capabilities: z.record(z.string(), z.boolean()).optional(),
  imports: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.number().optional(),
});

const langExtractAnalyzeChunkSchema = z.looseObject({
  kind: z.string(),
  text: z.string(),
  start: z.number(),
  end: z.number(),
  symbol: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
});

const langExtractAnalyzeResponseSchema = z.looseObject({
  document_id: z.string(),
  source_type: z.string(),
  extraction_mode: z.string(),
  entities: z.array(z.looseObject({ text: z.string(), label: z.string() })),
  relationships: z.array(z.record(z.string(), z.unknown())),
  concepts: z.array(z.string()),
  chunks: z.array(langExtractAnalyzeChunkSchema).optional(),
  features: z.array(z.looseObject({ kind: z.string(), name: z.string(), description: z.string(), source: z.string() })).optional(),
  metadata: z.record(z.string(), z.unknown()),
  capabilities: z.record(z.string(), z.boolean()).optional(),
  processing_time_ms: z.number(),
});

const customAttributesSchema = z.record(
  z.string().min(1).max(80),
  z.union([z.string().max(2048), z.number().finite(), z.boolean(), z.null()])
).superRefine((value, ctx) => {
  if (Object.keys(value).length > 32) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'customAttributes exceeds 32 keys' });
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 8192) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'customAttributes exceeds 8192 UTF-8 bytes' });
  }
});

const documentationFactSchema = z.looseObject({
  schema: z.literal('atlas.documentation-fact.v1'),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  statement: z.string(),
  evidenceText: z.string(),
  sourceUrl: z.string().min(1),
  sourceRevision: z.string().min(1),
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().positive(),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().positive(),
  alignmentStatus: z.enum(['MATCH_EXACT', 'MATCH_FUZZY', 'MATCH_LESSER']),
  productVersion: z.string(),
  confidence: z.number().min(0).max(1),
  extractionMethod: z.string(),
  customAttributesVersion: z.literal('atlas.langextract-custom-attributes.v1'),
  customAttributes: customAttributesSchema,
  canonicalAuthority: z.literal(false),
});

const documentationFactsResponseSchema = z.looseObject({
  facts: z.array(documentationFactSchema),
  apiRules: z.array(z.record(z.string(), z.unknown())),
  modelId: z.string().nullable().optional(),
  provider: z.string(),
  producerRevision: z.string(),
  inputHash: z.string(),
  outputHash: z.string(),
  generationControls: z.record(z.string(), z.unknown()),
  alignmentSummary: z.record(z.string(), z.number()),
  canonicalAuthority: z.literal(false),
  error: z.string().nullable().optional(),
});

const oaklibLabelSearchResponseSchema = z.object({
  schema: z.literal('atlas.oaklib-label-search-response.v1'),
  status: z.literal('PROPOSAL_ONLY'),
  ontologyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  producerRevision: z.string().min(1),
  matches: z.array(z.object({
    searchText: z.string().min(1),
    externalIds: z.array(z.string().min(1)),
  }).strict()),
  candidateBundle: z.record(z.string(), z.unknown()),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

const oaklibLabelSearchRequestSchema = z.object({
  terms: z.array(z.string().trim().min(1).max(256).refine((term) => !/[\u0000-\u001f\u007f]/u.test(term))).min(1).max(16),
  maxCandidatesPerTerm: z.number().int().min(1).max(16).optional(),
}).strict();

async function readJson<T>(response: Response, context: string, schema?: z.ZodType<unknown>): Promise<T> {
  if (!response.ok) {
    throw new Error(`[langextract-transport] ${context} failed: ${response.status} ${response.statusText}`);
  }
  const body: unknown = await response.json();
  if (!schema) return body as T;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`[langextract-transport] ${context} response failed schema validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data as T;
}

export async function requestLangExtractHealth(
  options: LangExtractSidecarRequestOptions = {}
): Promise<LangExtractHealthResponse> {
  const baseUrl = resolveLangExtractBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}/health`, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
  });
  return readJson<LangExtractHealthResponse>(response, 'health', langExtractHealthResponseSchema);
}

export async function requestLangExtractAnalyze(
  request: LangExtractAnalyzeRequest,
  options: LangExtractSidecarRequestOptions = {}
): Promise<LangExtractAnalyzeResponse> {
  const baseUrl = resolveLangExtractBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}${options.path ?? '/analyze'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      Object.fromEntries(
        Object.entries(request).filter(([, value]) => value !== undefined)
      )
    ),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  });

  return readJson<LangExtractAnalyzeResponse>(response, 'analyze', langExtractAnalyzeResponseSchema);
}

export async function requestLangExtractDocumentationFacts(
  request: LangExtractDocumentationFactsRequest,
  options: Omit<LangExtractSidecarRequestOptions, 'path'> = {}
): Promise<LangExtractDocumentationFactsResponse> {
  const baseUrl = resolveLangExtractBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}/extract/documentation-facts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(
      Object.entries(request).filter(([, value]) => value !== undefined)
    )),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  });
  const result = await readJson<LangExtractDocumentationFactsResponse>(
    response,
    'documentation-facts',
    documentationFactsResponseSchema
  );
  if (result.error) {
    throw new Error(`[langextract-transport] documentation-facts execution failed: ${result.error}`);
  }
  const expectedInputHash = createHash('sha256').update(request.text, 'utf8').digest('hex');
  if (result.inputHash !== expectedInputHash) {
    throw new Error('[langextract-transport] documentation-facts input checksum mismatch');
  }
  if (request.sourceRevision.startsWith('sha256:') && request.sourceRevision !== `sha256:${expectedInputHash}`) {
    throw new Error('[langextract-transport] documentation-facts source revision does not match request text');
  }
  const sourceCodePoints = Array.from(request.text);
  for (const fact of result.facts) {
    if (fact.alignmentStatus !== 'MATCH_EXACT') {
      throw new Error('[langextract-transport] documentation-facts contains non-exact evidence alignment');
    }
    if (fact.sourceUrl !== request.sourceUrl || fact.sourceRevision !== request.sourceRevision) {
      throw new Error('[langextract-transport] documentation-facts source binding mismatch');
    }
    if (fact.endChar <= fact.startChar || fact.endChar > sourceCodePoints.length) {
      throw new Error('[langextract-transport] documentation-facts character span is out of bounds');
    }
    const evidenceText = sourceCodePoints.slice(fact.startChar, fact.endChar).join('');
    if (evidenceText !== fact.evidenceText) {
      throw new Error('[langextract-transport] documentation-facts evidence text does not match source span');
    }
    const startByte = Buffer.byteLength(sourceCodePoints.slice(0, fact.startChar).join(''), 'utf8');
    const endByte = startByte + Buffer.byteLength(evidenceText, 'utf8');
    if (fact.startByte !== startByte || fact.endByte !== endByte) {
      throw new Error('[langextract-transport] documentation-facts byte span does not match source span');
    }
  }
  return result;
}

export async function requestOaklibLabelSearch(
  request: OaklibLabelSearchRequestV1,
  options: Omit<LangExtractSidecarRequestOptions, 'path'> = {}
): Promise<OaklibLabelSearchResponseV1> {
  const validatedRequest = oaklibLabelSearchRequestSchema.parse(request);
  const baseUrl = resolveLangExtractBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}/ontology/oaklib/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(
      Object.entries(validatedRequest).filter(([, value]) => value !== undefined)
    )),
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  });
  const result = await readJson<OaklibLabelSearchResponseV1>(
    response,
    'OAKLIB label search',
    oaklibLabelSearchResponseSchema
  );
  const bundle = result.candidateBundle;
  if (
    bundle.schema !== 'atlas.oaklib-candidate-bundle.v1'
    || bundle.sourceSelector !== 'atlas-local-ontology'
    || bundle.ontologyRevision !== result.ontologyRevision
    || bundle.producerRevision !== result.producerRevision
    || bundle.canonicalAuthority !== false
    || !Array.isArray(bundle.concepts)
    || !Array.isArray(bundle.relations)
  ) {
    throw new Error('[langextract-transport] OAKLIB candidate bundle binding mismatch');
  }
  const concepts = bundle.concepts as Array<Record<string, unknown>>;
  if (concepts.some((candidate) =>
    candidate.ontologyRevision !== result.ontologyRevision
    || candidate.producerRevision !== result.producerRevision
    || candidate.canonicalAuthority !== false
  )) {
    throw new Error('[langextract-transport] OAKLIB concept candidate revision mismatch');
  }
  const conceptIds = new Set(concepts.map((candidate) => candidate.externalId));
  if (result.matches.some((match) => match.externalIds.some((id) => !conceptIds.has(id)))) {
    throw new Error('[langextract-transport] OAKLIB match references missing concept candidate');
  }
  return result;
}
