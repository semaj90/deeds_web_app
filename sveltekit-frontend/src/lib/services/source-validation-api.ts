/**
 * Source Validation API client
 * Provides a compatibility wrapper over the current RAG endpoints.
 */

import type {
  AnswerGenerationRequest,
  AnswerGenerationResponse,
  CitationMetadata,
  KAGUpdateRequest,
  KAGUpdateResponse,
  KBSearchRequest,
  KBSearchResponse,
  KBSearchResult,
  SourceValidationRequest,
  SourceValidationResponse
} from '$lib/types/source-validation';
import type {
  AnswerWithCitations,
  ApprovedContext,
  RetrievedChunk
} from '$lib/types/rag-source-validation';

const RAG_API_BASE = '/api/rag';
const LEGACY_API_BASE = '/api/source-validation';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

let lastSearchQueryId: string | null = null;

function toLegacySearchResult(chunk: RetrievedChunk): KBSearchResult {
  return {
    chunk_id: chunk.chunk_id,
    source_file: chunk.source_title,
    content: chunk.text,
    snippet_preview: chunk.snippet,
    confidence_score: chunk.score,
    source_type: mapSourceType(chunk.source_type),
    metadata: {
      source_id: chunk.source_id,
      source_url: chunk.source_url,
      page_num: chunk.page_num,
      section: chunk.section,
      has_image: chunk.has_image,
      has_table: chunk.has_table,
      related_entities: chunk.related_entities,
      graph_neighbors: chunk.graph_neighbors
    }
  };
}

function toLegacyCitation(citation: AnswerWithCitations['citations'][number]): CitationMetadata {
  return {
    chunk_id: citation.chunk_id,
    source_file: citation.source_title,
    snippet: citation.quote,
    used_in_answer: true,
    confidence: 1
  };
}

function mapSourceType(sourceType: string): KBSearchResult['source_type'] {
  if (sourceType === 'precedent' || sourceType === 'statute' || sourceType === 'case_law' || sourceType === 'regulation') {
    return 'documentation';
  }
  if (sourceType === 'evidence' || sourceType === 'contract' || sourceType === 'expert_opinion') {
    return 'community';
  }
  return 'code';
}

function toValidationPayload(params: SourceValidationRequest) {
  const selected = new Set(params.selected_chunk_ids);
  const rejected = new Set(params.rejected_chunk_ids ?? []);
  const chunkIds = [...selected, ...rejected];

  return chunkIds.map((chunkId) => ({
    chunk_id: chunkId,
    status: selected.has(chunkId) ? 'approved' : 'rejected' as const
  }));
}

function ensureCaseId(caseId: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId)
    ? caseId
    : NIL_UUID;
}

async function readJsonOrThrow<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const sourceValidationAPI = {
  async search(params: KBSearchRequest): Promise<KBSearchResponse> {
    const response = await fetch(`${RAG_API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        top_k: params.top_k,
        include_codebase: params.include_codebase,
        use_hybrid: true,
        use_rerank: true
      })
    });

    const ragResponse = await readJsonOrThrow<{ query_id: string; query: string; chunks: RetrievedChunk[]; total_found: number; timestamp: string }>(response, 'Search');
    lastSearchQueryId = ragResponse.query_id;

    return {
      query: ragResponse.query,
      results: ragResponse.chunks.map(toLegacySearchResult),
      total_found: ragResponse.total_found,
      search_timestamp: ragResponse.timestamp
    };
  },

  async validateSources(params: SourceValidationRequest): Promise<SourceValidationResponse> {
    if (!lastSearchQueryId) {
      throw new Error('Search must be run before validating sources');
    }

    const response = await fetch(`${RAG_API_BASE}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_id: lastSearchQueryId,
        case_id: ensureCaseId(params.case_id),
        validations: toValidationPayload(params),
        notes: params.validation_notes
      })
    });

    const ragResponse = await readJsonOrThrow<ApprovedContext>(response, 'Validation');

    return {
      validation_id: ragResponse.context_id,
      approved_chunks: ragResponse.approved_chunks.map(toLegacySearchResult),
      timestamp: ragResponse.validated_at,
      ready_for_answer: true
    };
  },

  async generateAnswer(params: AnswerGenerationRequest): Promise<AnswerGenerationResponse> {
    const response = await fetch(`${RAG_API_BASE}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context_id: params.validation_id,
        query: params.query,
        case_id: ensureCaseId(params.case_id),
        max_tokens: params.max_tokens,
        include_citations: true
      })
    });

    const ragResponse = await readJsonOrThrow<AnswerWithCitations>(response, 'Answer generation');

    return {
      answer: ragResponse.answer,
      citations: ragResponse.citations.map(toLegacyCitation),
      validation_id: params.validation_id,
      llm_provider: params.llm_provider ?? ragResponse.model,
      timestamp: ragResponse.timestamp
    };
  },

  async updateKAG(params: KAGUpdateRequest): Promise<KAGUpdateResponse> {
    const response = await fetch(`${LEGACY_API_BASE}/kag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    return readJsonOrThrow<KAGUpdateResponse>(response, 'KAG update');
  },

  async validate(params: {
    query: string;
    chunks: unknown[];
    case_id: string;
  }): Promise<{ validation_id: string; results: unknown[] }> {
    const response = await this.validateSources({
      query: params.query,
      case_id: params.case_id,
      selected_chunk_ids: params.chunks
        .map((chunk) => (typeof chunk === 'object' && chunk && 'chunk_id' in chunk ? String((chunk as { chunk_id: unknown }).chunk_id) : ''))
        .filter(Boolean),
      rejected_chunk_ids: []
    });

    return {
      validation_id: response.validation_id,
      results: response.approved_chunks
    };
  }
};
