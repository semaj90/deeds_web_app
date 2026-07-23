/**
 * Miniforge NLP sidecar client.
 *
 * This wraps the Python FastAPI sidecar that combines:
 * - LangExtract-compatible text extraction
 * - spaCy/regex entity extraction
 * - tree-sitter chunking
 * - ast-grep structural features
 * - optional PyTorch feature summaries
 */

import { ENV } from '$lib/server/env.server.js';

export type NlpSourceType =
  | 'plain_text'
  | 'docling_markdown'
  | 'docling_json'
  | 'ocr_text'
  | 'transcript'
  | 'codebase'
  | 'general';

export type NlpExtractionMode = 'entities' | 'relationships' | 'concepts' | 'full';

export interface NlpEntity {
  text: string;
  label: string;
  start?: number;
  end?: number;
  confidence?: number;
  source?: string;
}

export interface NlpRelationship {
  subject: string;
  predicate: string;
  object: string;
  confidence?: number;
  source?: string;
}

export interface NlpChunk {
  kind: string;
  text: string;
  start: number;
  end: number;
  symbol?: string;
  language?: string;
}

export interface NlpFeature {
  kind: string;
  name: string;
  description: string;
  source: 'tree-sitter' | 'ast-grep' | 'langextract' | 'regex' | 'spacy' | 'torch';
  lineNumber?: number;
  confidence?: number;
  rawText?: string;
}

export interface NlpAnalyzeRequest {
  text: string;
  sourceType?: NlpSourceType;
  extractionMode?: NlpExtractionMode;
  documentId?: string;
  sourceRef?: string;
  packetKey?: string;
  language?: string;
  modelId?: string;
  maxChars?: number;
}

export interface NlpAnalyzeResponse {
  document_id: string;
  source_type: NlpSourceType;
  extraction_mode: NlpExtractionMode;
  entities: NlpEntity[];
  relationships: NlpRelationship[];
  concepts: string[];
  chunks: NlpChunk[];
  features: NlpFeature[];
  metadata: Record<string, unknown>;
  capabilities: {
    spacy: boolean;
    langextract: boolean;
    tree_sitter: boolean;
    ast_grep: boolean;
    torch: boolean;
  };
  processing_time_ms: number;
}

export interface NlpExtractResponse {
  document_id: string;
  structure: Record<string, unknown>;
  entities: NlpEntity[];
  metadata: Record<string, unknown>;
  processing_time: number;
}

export interface NlpHealthResponse {
  status: string;
  model?: string;
  capabilities?: {
    spacy?: boolean;
    langextract?: boolean;
    tree_sitter?: boolean;
    ast_grep?: boolean;
    torch?: boolean;
  };
  resolvedUrl?: string;
  latencyMs?: number;
}

export interface MiniforgeNlpSidecarClient {
  health(): Promise<{ ready: boolean; status?: string; model?: string; capabilities?: NlpHealthResponse['capabilities'] }>;
  analyze(req: NlpAnalyzeRequest): Promise<NlpAnalyzeResponse>;
  extract(req: NlpAnalyzeRequest): Promise<NlpExtractResponse>;
}

const HEALTH_CACHE_TTL = 30_000;
let cachedHealthy: boolean | null = null;
let healthCacheTs = 0;

function resolveBaseUrl(baseUrl?: string): string {
  return (
    baseUrl?.trim()
    || process.env.MINIFORGE_SIDECAR_URL?.trim()
    || ENV.MINIFORGE_SIDECAR_URL?.trim()
    || ENV.LANGEXTRACT_URL?.trim()
    || 'http://127.0.0.1:8095'
  ).replace(/\/+$/, '');
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function createMiniforgeNlpSidecarClient(baseUrl?: string): MiniforgeNlpSidecarClient {
  const url = resolveBaseUrl(baseUrl);

  return {
    async health() {
      const now = Date.now();
      if (cachedHealthy !== null && now - healthCacheTs < HEALTH_CACHE_TTL) {
        return { ready: cachedHealthy };
      }

      try {
        const response = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) {
          cachedHealthy = false;
          healthCacheTs = now;
          return { ready: false };
        }
        const data = (await readJson(response)) as NlpHealthResponse;
        cachedHealthy = true;
        healthCacheTs = now;
        return {
          ready: true,
          status: data.status,
          model: data.model,
          capabilities: data.capabilities,
        };
      } catch {
        cachedHealthy = false;
        healthCacheTs = now;
        return { ready: false };
      }
    },

    async analyze(req) {
      const start = Date.now();
      const response = await fetch(`${url}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: req.text,
          source_type: req.sourceType ?? 'plain_text',
          extraction_mode: req.extractionMode ?? 'full',
          document_id: req.documentId ?? req.packetKey ?? `doc-${Date.now()}`,
          source_ref: req.sourceRef,
          packet_key: req.packetKey,
          language: req.language,
          model_id: req.modelId,
          max_chars: req.maxChars ?? 50_000,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        cachedHealthy = false;
        healthCacheTs = Date.now();
        throw new Error(`[miniforge-nlp] analyze failed: ${response.status} ${response.statusText}`);
      }

      const raw = (await readJson(response)) as Partial<NlpAnalyzeResponse> & {
        capabilities?: Partial<NlpAnalyzeResponse['capabilities']>;
      };

      return {
        document_id: raw.document_id ?? req.documentId ?? req.packetKey ?? `doc-${Date.now()}`,
        source_type: (raw.source_type ?? req.sourceType ?? 'plain_text') as NlpSourceType,
        extraction_mode: (raw.extraction_mode ?? req.extractionMode ?? 'full') as NlpExtractionMode,
        entities: Array.isArray(raw.entities) ? raw.entities : [],
        relationships: Array.isArray(raw.relationships) ? raw.relationships : [],
        concepts: Array.isArray(raw.concepts) ? raw.concepts : [],
        chunks: Array.isArray(raw.chunks) ? raw.chunks : [],
        features: Array.isArray(raw.features) ? raw.features : [],
        metadata: (raw.metadata ?? {}) as Record<string, unknown>,
        capabilities: {
          spacy: Boolean(raw.capabilities?.spacy),
          langextract: Boolean(raw.capabilities?.langextract),
          tree_sitter: Boolean(raw.capabilities?.tree_sitter),
          ast_grep: Boolean(raw.capabilities?.ast_grep),
          torch: Boolean(raw.capabilities?.torch),
        },
        processing_time_ms: Number(raw.processing_time_ms ?? Date.now() - start),
      };
    },

    async extract(req) {
      const response = await fetch(`${url}/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: req.text,
          source_type: req.sourceType ?? 'plain_text',
          extraction_mode: req.extractionMode ?? 'full',
          document_id: req.documentId ?? req.packetKey ?? `doc-${Date.now()}`,
          source_ref: req.sourceRef,
          packet_key: req.packetKey,
          language: req.language,
          model_id: req.modelId,
          max_chars: req.maxChars ?? 50_000,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        cachedHealthy = false;
        healthCacheTs = Date.now();
        throw new Error(`[miniforge-nlp] extract failed: ${response.status} ${response.statusText}`);
      }

      const raw = (await readJson(response)) as Partial<NlpExtractResponse>;
      return {
        document_id: raw.document_id ?? req.documentId ?? req.packetKey ?? `doc-${Date.now()}`,
        structure: (raw.structure ?? {}) as Record<string, unknown>,
        entities: Array.isArray(raw.entities) ? raw.entities : [],
        metadata: (raw.metadata ?? {}) as Record<string, unknown>,
        processing_time: Number(raw.processing_time ?? 0),
      };
    },
  };
}
