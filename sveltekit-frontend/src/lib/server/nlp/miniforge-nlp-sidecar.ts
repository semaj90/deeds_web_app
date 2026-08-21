/**
 * Miniforge NLP sidecar client.
 *
 * This wraps the Python FastAPI sidecar that combines:
 * - LangExtract-compatible text extraction
 * - spaCy/regex entity extraction
 * - Consiliency treesitter-chunker structural evidence
 * - ast-grep structural observations
 * - optional PyTorch feature summaries
 */

import { ENV } from '$lib/server/env.server.js';
import type {
  AnalysisPassResult,
  Control5,
  ExperimentFeatureMatrix,
} from '$lib/server/analysis/nlp-feature-compiler.js';

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

/**
 * `upstream_*` fields are Consiliency provenance when the Python 8095 sidecar
 * exposes them. They are never Atlas canonical IDs by themselves.
 *
 * During the migration window only `upstream_chunk_id` is guaranteed by the
 * currently deployed sidecar. Parent Atlas records compatibility provenance
 * when richer native IDs are absent and must not promote those compatibility
 * values to canonical symbol identity.
 */
export interface AtlasStructuralEvidenceChunk {
  upstream_chunk_id?: string;
  upstream_node_id?: string;
  upstream_file_id?: string;
  upstream_symbol_id?: string;
  node_type: string;
  kind: string;
  name?: string | null;
  parent_route?: string[];
  parent_context?: string | null;
  start_byte: number;
  end_byte: number;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  calls: string[];
  imports: string[];
  exports: string[];
}

export interface AtlasStructuralEvidenceEdge {
  from_evidence_key: string;
  to_evidence_key: string;
  type: 'DEFINES' | 'IMPORTS' | 'EXPORTS' | 'CALLS' | 'REFERENCES';
  evidence_start_line: number;
  evidence_start_column: number;
  evidence_end_line: number;
  evidence_end_column: number;
  resolved: boolean;
  resolution?: string | null;
}

export interface AtlasStructuralEvidence {
  schema: 'atlas.ast.evidence.v1';
  engine: string;
  engine_version: string;
  language: string;
  file_path: string;
  source_revision: string;
  chunks: AtlasStructuralEvidenceChunk[];
  edges: AtlasStructuralEvidenceEdge[];
  diagnostics: string[];
  error_tag?: 'ChunkingError' | 'UnsupportedLanguageError' | null;
  syntax_status?: 'CLEAN' | 'RECOVERED_WITH_ERRORS';
}

export interface NlpFeature {
  kind: string;
  name: string;
  description: string;
  source: 'tree-sitter' | 'ast-grep' | 'langextract' | 'regex' | 'spacy' | 'torch';
  lineNumber?: number;
  byteStart?: number;
  byteEnd?: number;
  ruleId?: string;
  captures?: Record<string, string>;
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
  passes?: Array<'structural' | 'lexical' | 'linguistic' | 'semantic' | 'sequence' | 'rerank' | 'grounded'>;
  groundedExtractionRequired?: boolean;
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
    treesitter_chunker?: boolean;
    ast_grep: boolean;
    torch: boolean;
  };
  pass_results?: AnalysisPassResult[];
  control5?: Control5 | null;
  experiment_feature_matrix?: ExperimentFeatureMatrix | null;
  event_hypergraph?: Record<string, unknown> | null;
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
    treesitter_chunker?: boolean;
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
  astChunk(req: { source: string; language: string; filePath: string; sourceRevision: string }): Promise<AtlasStructuralEvidence>;
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
          passes: req.passes ?? [],
          grounded_extraction_required: req.groundedExtractionRequired ?? false,
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
          treesitter_chunker: Boolean(raw.capabilities?.treesitter_chunker),
          ast_grep: Boolean(raw.capabilities?.ast_grep),
          torch: Boolean(raw.capabilities?.torch),
        },
        pass_results: Array.isArray(raw.pass_results) ? raw.pass_results : [],
        control5: (raw.control5 ?? null) as Control5 | null,
        experiment_feature_matrix: (raw.experiment_feature_matrix ?? null) as ExperimentFeatureMatrix | null,
        event_hypergraph: (raw.event_hypergraph ?? null) as Record<string, unknown> | null,
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
          passes: req.passes ?? [],
          grounded_extraction_required: req.groundedExtractionRequired ?? false,
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

    async astChunk(req) {
      const response = await fetch(`${url}/ast/chunk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(15_000),
      });
      const raw = (await readJson(response)) as Partial<AtlasStructuralEvidence>;
      if (!response.ok) {
        // Surface the actual FastAPI error body (e.g. Pydantic validation
        // detail like `source` exceeding max_length) rather than just the
        // status line -- the body was already parsed above, don't discard it.
        const detail = JSON.stringify(raw).slice(0, 500);
        throw new Error(`[miniforge-nlp] ast/chunk failed: ${response.status} ${response.statusText} ${detail}`);
      }
      if (raw.schema !== 'atlas.ast.evidence.v1' || !Array.isArray(raw.chunks)) {
        throw new Error('[miniforge-nlp] ast/chunk returned an invalid atlas.ast.evidence.v1 payload');
      }
      return {
        schema: raw.schema,
        engine: String(raw.engine ?? 'unknown'),
        engine_version: String(raw.engine_version ?? 'unknown'),
        language: String(raw.language ?? req.language),
        file_path: String(raw.file_path ?? req.filePath),
        source_revision: String(raw.source_revision ?? req.sourceRevision),
        chunks: raw.chunks.map((chunk) => ({
          upstream_chunk_id: chunk.upstream_chunk_id,
          upstream_node_id: chunk.upstream_node_id,
          upstream_file_id: chunk.upstream_file_id,
          upstream_symbol_id: chunk.upstream_symbol_id,
          node_type: String(chunk.node_type),
          kind: String(chunk.kind),
          name: chunk.name ?? null,
          parent_route: Array.isArray(chunk.parent_route) ? chunk.parent_route.map(String) : undefined,
          parent_context: chunk.parent_context ?? null,
          start_byte: Number(chunk.start_byte),
          end_byte: Number(chunk.end_byte),
          start_line: Number(chunk.start_line),
          start_column: Number(chunk.start_column),
          end_line: Number(chunk.end_line),
          end_column: Number(chunk.end_column),
          calls: Array.isArray(chunk.calls) ? chunk.calls.map(String) : [],
          imports: Array.isArray(chunk.imports) ? chunk.imports.map(String) : [],
          exports: Array.isArray(chunk.exports) ? chunk.exports.map(String) : [],
        })),
        edges: Array.isArray(raw.edges) ? raw.edges.map((edge) => ({
          from_evidence_key: String(edge.from_evidence_key ?? ''),
          to_evidence_key: String(edge.to_evidence_key ?? ''),
          type: edge.type as AtlasStructuralEvidenceEdge['type'],
          evidence_start_line: Number(edge.evidence_start_line ?? 1),
          evidence_start_column: Number(edge.evidence_start_column ?? 0),
          evidence_end_line: Number(edge.evidence_end_line ?? edge.evidence_start_line ?? 1),
          evidence_end_column: Number(edge.evidence_end_column ?? 0),
          resolved: Boolean(edge.resolved),
          resolution: edge.resolution ?? null,
        })) : [],
        diagnostics: Array.isArray(raw.diagnostics) ? raw.diagnostics.map(String) : [],
        error_tag: raw.error_tag === 'ChunkingError' || raw.error_tag === 'UnsupportedLanguageError' ? raw.error_tag : null,
        syntax_status: raw.syntax_status === 'RECOVERED_WITH_ERRORS' ? 'RECOVERED_WITH_ERRORS' : 'CLEAN',
      };
    },
  };
}
