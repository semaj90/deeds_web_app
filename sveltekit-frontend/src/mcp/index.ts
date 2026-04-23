import {
  PROTOCOL_SCHEMA_VERSION,
  jsonValueFromUnknown,
  type JsonRecord,
  type JsonValue,
  type PersistedEnvelope,
  type ToolCallResponse,
} from '$lib/types/protocol';

export type MCPToolResponse<T extends JsonValue = JsonValue> = Omit<
  ToolCallResponse,
  'arguments' | 'metadata' | 'result'
> & {
  arguments: JsonRecord;
  metadata?: JsonRecord;
  result?: T;
};

type ToolArgs = Record<string, unknown> | undefined;

function toJsonRecord(value: unknown): JsonRecord {
  const normalized = jsonValueFromUnknown(value);
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    return normalized as JsonRecord;
  }

  return {};
}

function toolLane(toolName: string): string {
  return toolName.split(':')[0] || 'mcp';
}

function toolOk<T extends JsonValue>(
  toolName: string,
  args: ToolArgs,
  result: T,
  metadata?: Record<string, unknown>
): MCPToolResponse<T> {
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    source: 'mcp',
    lane: toolLane(toolName),
    createdAt: new Date().toISOString(),
    validatorTag: 'protocol.v1',
    protocol: 'http',
    toolName,
    arguments: toJsonRecord(args),
    ok: true,
    result: jsonValueFromUnknown(result) as T,
    ...(metadata ? { metadata: toJsonRecord(metadata) } : {}),
  };
}

function toolError<T extends JsonValue = JsonValue>(
  toolName: string,
  args: ToolArgs,
  error: unknown,
  metadata?: Record<string, unknown>
): MCPToolResponse<T> {
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    source: 'mcp',
    lane: toolLane(toolName),
    createdAt: new Date().toISOString(),
    validatorTag: 'protocol.v1',
    protocol: 'http',
    toolName,
    arguments: toJsonRecord(args),
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    ...(metadata ? { metadata: toJsonRecord(metadata) } : {}),
  };
}

async function runTool<T extends JsonValue>(
  toolName: string,
  args: ToolArgs,
  runner: () => Promise<{ ok: boolean; result: unknown; metadata?: Record<string, unknown> }>
): Promise<MCPToolResponse<T>> {
  try {
    const { ok, result, metadata } = await runner();
    if (!ok) {
      return toolError(toolName, args, 'Tool execution returned a non-ok result', {
        ...metadata,
        result: jsonValueFromUnknown(result),
      });
    }

    return toolOk(toolName, args, jsonValueFromUnknown(result) as T, metadata);
  } catch (error) {
    return toolError(toolName, args, error);
  }
}

export function toEnvelope<T extends JsonValue>(
  lane: PersistedEnvelope<T>['lane'],
  kind: string,
  payload: T,
  source: PersistedEnvelope<T>['source'] = 'mcp'
): PersistedEnvelope<T> {
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    source,
    lane,
    kind,
    createdAt: new Date().toISOString(),
    validatorTag: 'protocol.v1',
    payload,
  };
}

export interface CasesTools {
  loadCases(params: {
    userId?: string;
    limit?: number;
    offset?: number;
    query?: string;
  }): Promise<MCPToolResponse<any[]>>;
  createCase(caseData: any): Promise<MCPToolResponse<any>>;
  updateCase(caseId: string, updates: any): Promise<MCPToolResponse<any>>;
  deleteCase(caseId: string): Promise<MCPToolResponse<{ deleted: boolean; id: string }>>;
  findSimilarCases(embedding: number[], limit?: number): Promise<MCPToolResponse<any[]>>;
  getCaseAnalytics(userId: string): Promise<MCPToolResponse<any>>;
}

export interface EvidenceTools {
  loadEvidence(params: {
    caseId?: string;
    limit?: number;
    query?: string;
  }): Promise<MCPToolResponse<any[]>>;
  createEvidence(evidenceData: any): Promise<MCPToolResponse<any>>;
  updateEvidence(evidenceId: string, updates: any): Promise<MCPToolResponse<any>>;
  deleteEvidence(evidenceId: string): Promise<MCPToolResponse<{ deleted: boolean; id: string }>>;
  findSimilarEvidence(params: {
    embedding: number[];
    caseId?: string;
    limit: number;
    threshold?: number;
  }): Promise<MCPToolResponse<any[]>>;
  getEvidenceAnalytics(caseId: string): Promise<MCPToolResponse<any>>;
}

export interface UserTools {
  getUserById(userId: string): Promise<MCPToolResponse<any>>;
  updateUser(userId: string, updates: any): Promise<MCPToolResponse<any>>;
  getUserAnalytics(): Promise<MCPToolResponse<any>>;
}

export interface RAGTools {
  webSearch(
    query: string,
    options?: {
      topK?: number;
      scope?: string;
      threshold?: number;
    }
  ): Promise<MCPToolResponse<any[]>>;
  indexWebPage(url: string): Promise<MCPToolResponse<{ indexed: boolean; id: string }>>;
  indexDirectory(path: string): Promise<MCPToolResponse<{ indexed: number; errors: string[] }>>;
  syncMinIO(): Promise<MCPToolResponse<{ processed: number; skipped: number }>>;
  getLangCacheStats(): Promise<MCPToolResponse<{ hits: number; misses: number; total: number }>>;
  clearLangCache(scope?: string): Promise<MCPToolResponse<{ cleared: number }>>;
}

export interface ReportTools {
  listReports(params: {
    caseId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MCPToolResponse<any[]>>;
  createReport(params: {
    caseId: string;
    title?: string;
    contentHtml?: string;
    status?: 'draft' | 'in_review' | 'finalized' | 'published';
  }): Promise<MCPToolResponse<any>>;
  generateFromTemplate(params: {
    templateType: string;
    caseId: string;
    customTitle?: string;
    useAI?: boolean;
  }): Promise<MCPToolResponse<any>>;
  updateReport(params: {
    reportId: string;
    title?: string;
    contentHtml?: string;
    status?: 'draft' | 'in_review' | 'finalized' | 'published';
  }): Promise<MCPToolResponse<any>>;
  deleteReport(reportId: string): Promise<MCPToolResponse<{ deleted: boolean; id: string }>>;
  exportReport(params: {
    reportId: string;
    format: 'pdf' | 'docx' | 'html';
  }): Promise<MCPToolResponse<{ url: string; filename: string }>>;
}

export interface CitationTools {
  searchCitations(params: {
    query?: string;
    caseId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MCPToolResponse<any[]>>;
  listByCaseId(caseId: string): Promise<MCPToolResponse<any[]>>;
  addToCase(params: {
    caseId: string;
    citationText: string;
    sourceTitle?: string;
    pageNumber?: number;
  }): Promise<MCPToolResponse<any>>;
}

export interface MCPTools {
  cases: CasesTools;
  evidence: EvidenceTools;
  users: UserTools;
  rag: RAGTools;
  reports: ReportTools;
  citations: CitationTools;
  getAnalytics(params: Record<string, string>): Promise<MCPToolResponse<any>>;
  analyzeLegalDocument(document: any): Promise<MCPToolResponse<any>>;
  extractClauses(documentId: string): Promise<MCPToolResponse<any>>;
  queryRAG(query: string, context?: any): Promise<MCPToolResponse<any>>;
  generateEmbedding(text: string): Promise<MCPToolResponse<number[]>>;
  semanticSearch(query: string, filters?: any): Promise<MCPToolResponse<any[]>>;
}

// Mock implementation for development
export const mcpTools: MCPTools = {
  cases: {
    loadCases: async (params) =>
      runTool<any[]>('cases:load', params, async () => {
        const qp = new URLSearchParams();
        if (params.query) qp.append('q', params.query);
        if (params.limit) qp.append('limit', String(params.limit));
        if (params.offset) qp.append('offset', String(params.offset));
        const response = await fetch(`/api/cases?${qp}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json();
        return { ok: response.ok, result: result.cases ?? result.data ?? result };
      }),
    createCase: async (caseData) =>
      runTool<any>('cases:create', caseData, async () => {
        const response = await fetch('/api/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(caseData),
        });
        const result = await response.json();
        return { ok: response.ok, result };
      }),
    updateCase: async (caseId, updates) =>
      runTool<any>('cases:update', { caseId, ...updates }, async () => {
        const response = await fetch(`/api/cases/${caseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        const result = await response.json();
        return { ok: response.ok, result };
      }),
    deleteCase: async (caseId) =>
      runTool<{ deleted: boolean; id: string }>('cases:delete', { caseId }, async () => {
        const response = await fetch(`/api/cases/${caseId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
        return { ok: response.ok, result: { deleted: response.ok, id: caseId } };
      }),
    findSimilarCases: async (embedding, limit) =>
      toolOk('cases:find_similar', { embedding, limit }, []),
    getCaseAnalytics: async (userId) =>
      runTool<any>('cases:analytics', { userId }, async () => {
        const response = await fetch('/api/cases/analytics', {
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json();
        return { ok: response.ok, result };
      }),
  },
  evidence: {
    loadEvidence: async (params) => toolOk('evidence:load', params, []),
    createEvidence: async (evidenceData) =>
      toolOk('evidence:create', evidenceData, { id: 'new-evidence-123', ...(evidenceData || {}) }),
    updateEvidence: async (evidenceId, updates) =>
      toolOk('evidence:update', { evidenceId, ...updates }, { id: evidenceId, ...(updates || {}) }),
    deleteEvidence: async (evidenceId) =>
      toolOk('evidence:delete', { evidenceId }, { deleted: true, id: evidenceId }),
    findSimilarEvidence: async (params) => toolOk('evidence:find_similar', params, []),
    getEvidenceAnalytics: async (caseId) =>
      toolOk('evidence:analytics', { caseId }, { totalEvidence: 0, processedEvidence: 0 }),
  },
  users: {
    getUserById: async (userId) =>
      toolOk('users:get_by_id', { userId }, { id: userId, name: 'Demo User', role: 'attorney' }),
    updateUser: async (userId, updates) =>
      toolOk('users:update', { userId, ...updates }, { id: userId, ...(updates || {}) }),
    getUserAnalytics: async () =>
      toolOk('users:analytics', undefined, { totalUsers: 1, activeUsers: 1 }),
  },
  rag: {
    webSearch: async (query, options) =>
      runTool<any>('rag:search', { query, ...(options || {}) }, async () => {
        const response = await fetch('/api/websearch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, ...options }),
        });
        const result = await response.json();
        return { ok: response.ok, result };
      }),
    indexWebPage: async (url) =>
      runTool<{ indexed: boolean; id: string }>('rag:index_page', { url }, async () => {
        // Call knowledge base ingestion API to crawl + embed + store in Qdrant
        const response = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            source: 'mcp-index',
            extraction_type: 'legal',
          }),
        });
        if (!response.ok) {
          throw new Error(`Knowledge ingestion failed: ${response.status}`);
        }
        const result = await response.json();
        return {
          ok: true,
          result: {
            indexed: true,
            id: result.documentId ?? result.id ?? `web-${Date.now()}`,
            chunks: result.chunksIndexed ?? 0,
            collection: result.collection ?? 'knowledge_base',
          },
        };
      }),
    indexDirectory: async (path) =>
      toolOk('rag:index_directory', { path }, { indexed: 0, errors: [] }),
    syncMinIO: async () => toolOk('rag:sync_minio', undefined, { processed: 0, skipped: 0 }),
    getLangCacheStats: async () =>
      toolOk('rag:cache_stats', undefined, { hits: 0, misses: 0, total: 0 }),
    clearLangCache: async (scope) => toolOk('rag:clear_cache', { scope }, { cleared: 0 }),
  },
  reports: {
    listReports: async (params) =>
      runTool<any[]>('reports:list', params, async () => {
        const queryParams = new URLSearchParams();
        if (params.caseId) queryParams.append('caseId', params.caseId);
        if (params.limit) queryParams.append('limit', String(params.limit));
        if (params.offset) queryParams.append('offset', String(params.offset));

        const response = await fetch(`/api/reports?${queryParams}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json();
        return { ok: Boolean(result.success ?? response.ok), result: result.data };
      }),
    createReport: async (params) =>
      runTool<any>('reports:create', params, async () => {
        const response = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const result = await response.json();
        return { ok: Boolean(result.success ?? response.ok), result: result.data };
      }),
    generateFromTemplate: async (params) =>
      runTool<any>('reports:generate_from_template', params, async () => {
        const response = await fetch('/api/reports/generate-from-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const result = await response.json();
        return { ok: Boolean(result.success ?? response.ok), result: result.data };
      }),
    updateReport: async (params) =>
      runTool<any>('reports:update', params, async () => {
        const { reportId, ...updates } = params;
        const response = await fetch('/api/reports', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [reportId], ...updates }),
        });
        const result = await response.json();
        return { ok: Boolean(result.success ?? response.ok), result: result.data };
      }),
    deleteReport: async (reportId) =>
      runTool<{ deleted: boolean; id: string }>('reports:delete', { reportId }, async () => {
        const response = await fetch('/api/reports', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [reportId] }),
        });
        const result = await response.json();
        return {
          ok: Boolean(result.success ?? response.ok),
          result: { deleted: true, id: reportId },
        };
      }),
    exportReport: async (params) =>
      runTool<{ url: string; filename: string }>('reports:export', params, async () => {
        const response = await fetch(`/api/reports/${params.reportId}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: params.format }),
        });
        const result = await response.json();
        return {
          ok: Boolean(result.success ?? response.ok),
          result: { url: result.url || '', filename: result.filename || '' },
        };
      }),
  },
  citations: {
    searchCitations: async (params) =>
      runTool<any[]>('citations:search', params, async () => {
        const qp = new URLSearchParams();
        if (params.query) qp.append('q', params.query);
        if (params.caseId) qp.append('caseId', params.caseId);
        if (params.limit) qp.append('limit', String(params.limit));
        if (params.offset) qp.append('offset', String(params.offset));
        const response = await fetch(`/api/citations?${qp}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json();
        return { ok: response.ok, result: result.citations ?? result.data ?? result };
      }),
    listByCaseId: async (caseId) =>
      runTool<any[]>('citations:list_by_case', { caseId }, async () => {
        const response = await fetch(`/api/cases/${caseId}/citations`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json();
        return { ok: response.ok, result: result.citations ?? result.data ?? result };
      }),
    addToCase: async (params) =>
      runTool<any>('citations:add_to_case', params, async () => {
        const response = await fetch(`/api/cases/${params.caseId}/citations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            citationText: params.citationText,
            sourceTitle: params.sourceTitle,
            pageNumber: params.pageNumber,
          }),
        });
        const result = await response.json();
        return { ok: response.ok, result };
      }),
  },
  getAnalytics: async (params) => toolOk('mcp:get_analytics', params, null),
  analyzeLegalDocument: async (document) =>
    toolOk('mcp:analyze_legal_document', { document }, null),
  extractClauses: async (documentId) => toolOk('mcp:extract_clauses', { documentId }, null),
  queryRAG: async (query, context) => toolOk('mcp:query_rag', { query, context }, null),
  generateEmbedding: async (text) => toolOk('mcp:generate_embedding', { text }, []),
  semanticSearch: async (query, filters) => toolOk('mcp:semantic_search', { query, filters }, []),
};
