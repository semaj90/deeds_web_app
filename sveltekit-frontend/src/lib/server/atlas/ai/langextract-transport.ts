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

async function readJson<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`[langextract-transport] ${context} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function requestLangExtractHealth(
  options: LangExtractSidecarRequestOptions = {}
): Promise<LangExtractHealthResponse> {
  const baseUrl = resolveLangExtractBaseUrl(options.baseUrl);
  const response = await fetch(`${baseUrl}/health`, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
  });
  return readJson<LangExtractHealthResponse>(response, 'health');
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

  return readJson<LangExtractAnalyzeResponse>(response, 'analyze');
}
