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
