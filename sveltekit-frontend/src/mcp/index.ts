
export interface MCPToolResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    timestamp?: string;
    tool?: string;
    duration?: number;
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
  deleteCase(caseId: string): Promise<MCPToolResponse<{ deleted: boolean, id: string }>>;
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
  deleteEvidence(evidenceId: string): Promise<MCPToolResponse<{ deleted: boolean, id: string }>>;
  findSimilarEvidence(params: { embedding: number[];
    caseId?: string; limit: number;
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
  indexWebPage(url: string): Promise<MCPToolResponse<{ indexed: boolean, id: string }>>;
  indexDirectory(path: string): Promise<MCPToolResponse<{ indexed: number, errors: string[] }>>;
  syncMinIO(): Promise<MCPToolResponse<{ processed: number, skipped: number }>>;
  getLangCacheStats(): Promise<MCPToolResponse<{ hits: number, misses: number; total: number }>>;
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
  deleteReport(reportId: string): Promise<MCPToolResponse<{ deleted: boolean, id: string }>>;
  exportReport(params: {
    reportId: string;
    format: 'pdf' | 'docx' | 'html';
  }): Promise<MCPToolResponse<{ url: string, filename: string }>>;
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
    loadCases: async (params) => {
      try {
        const qp = new URLSearchParams();
        if (params.query) qp.append('q', params.query);
        if (params.limit) qp.append('limit', String(params.limit));
        if (params.offset) qp.append('offset', String(params.offset));
        const response = await fetch(`/api/cases?${qp}`, { headers: { 'Content-Type': 'application/json' } });
        const result = await response.json();
        return { success: true, data: result.cases ?? result.data ?? result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    createCase: async (caseData) => {
      try {
        const response = await fetch('/api/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(caseData),
        });
        const result = await response.json();
        return { success: response.ok, data: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    updateCase: async (caseId, updates) => {
      try {
        const response = await fetch(`/api/cases/${caseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        const result = await response.json();
        return { success: response.ok, data: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    deleteCase: async (caseId) => {
      try {
        const response = await fetch(`/api/cases/${caseId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
        return { success: response.ok, data: { deleted: response.ok, id: caseId } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    findSimilarCases: async (_embedding, _limit) => ({ success: true, data: [] }),
    getCaseAnalytics: async (_userId) => {
      try {
        const response = await fetch('/api/cases/analytics', { headers: { 'Content-Type': 'application/json' } });
        const result = await response.json();
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  },
  evidence: { loadEvidence: async (_params) => ({ success: true, data: [] }),
    createEvidence: async (evidenceData) => ({
      success: true,
      data: { id: 'new-evidence-123', ...(evidenceData || {}) },
    }),
    updateEvidence: async (evidenceId, updates) => ({
      success: true,
      data: { id: evidenceId, ...(updates || {}) },
    }),
    deleteEvidence: async (evidenceId) => ({ success: true, data: { deleted: true, id: evidenceId } }),
    findSimilarEvidence: async (_params) => ({ success: true, data: [] }),
    getEvidenceAnalytics: async (_caseId) => ({
      success: true,
      data: { totalEvidence: 0, processedEvidence: 0 },
    }),
  },
  users: { getUserById: async (userId) => ({
      success: true,
      data: { id: userId, name: 'Demo User', role: 'attorney' },
    }),
    updateUser: async (userId, updates) => ({
      success: true,
      data: { id: userId, ...(updates || {}) },
    }),
    getUserAnalytics: async () => ({ success: true, data: { totalUsers: 1, activeUsers: 1 } }),
  },
  rag: { webSearch: async (query, options) => {
      try {
        const response = await fetch('/api/websearch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, ...options }),
        });
        const result = await response.json();
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    indexWebPage: async (url) => {
      try {
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
          success: true,
          data: {
            indexed: true,
            id: result.documentId ?? result.id ?? `web-${Date.now()}`,
            chunks: result.chunksIndexed ?? 0,
            collection: result.collection ?? 'knowledge_base',
          },
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    indexDirectory: async (path) => {
      try {
        return { success: true, data: { indexed: 0, errors: [] } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    syncMinIO: async () => {
      try {
        return { success: true, data: { processed: 0, skipped: 0 } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    getLangCacheStats: async () => {
      try {
        return { success: true, data: { hits: 0, misses: 0, total: 0 } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    clearLangCache: async (scope) => {
      try {
        return { success: true, data: { cleared: 0 } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  },
  reports: {
    listReports: async (params) => {
      try {
        const queryParams = new URLSearchParams();
        if (params.caseId) queryParams.append('caseId', params.caseId);
        if (params.limit) queryParams.append('limit', String(params.limit));
        if (params.offset) queryParams.append('offset', String(params.offset));

        const response = await fetch(`/api/reports?${queryParams}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json();
        return { success: result.success, data: result.data };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    createReport: async (params) => {
      try {
        const response = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const result = await response.json();
        return { success: result.success, data: result.data };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    generateFromTemplate: async (params) => {
      try {
        const response = await fetch('/api/reports/generate-from-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const result = await response.json();
        return { success: result.success, data: result.data };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    updateReport: async (params) => {
      try {
        const { reportId, ...updates } = params;
        const response = await fetch('/api/reports', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [reportId], ...updates }),
        });
        const result = await response.json();
        return { success: result.success, data: result.data };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    deleteReport: async (reportId) => {
      try {
        const response = await fetch('/api/reports', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [reportId] }),
        });
        const result = await response.json();
        return { success: result.success, data: { deleted: true, id: reportId } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    exportReport: async (params) => {
      try {
        const response = await fetch(`/api/reports/${params.reportId}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: params.format }),
        });
        const result = await response.json();
        return {
          success: result.success,
          data: { url: result.url || '', filename: result.filename || '' }
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  },
  citations: {
    searchCitations: async (params) => {
      try {
        const qp = new URLSearchParams();
        if (params.query) qp.append('q', params.query);
        if (params.caseId) qp.append('caseId', params.caseId);
        if (params.limit) qp.append('limit', String(params.limit));
        if (params.offset) qp.append('offset', String(params.offset));
        const response = await fetch(`/api/citations?${qp}`, { headers: { 'Content-Type': 'application/json' } });
        const result = await response.json();
        return { success: response.ok, data: result.citations ?? result.data ?? result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    listByCaseId: async (caseId) => {
      try {
        const response = await fetch(`/api/cases/${caseId}/citations`, { headers: { 'Content-Type': 'application/json' } });
        const result = await response.json();
        return { success: response.ok, data: result.citations ?? result.data ?? result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    addToCase: async (params) => {
      try {
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
        return { success: response.ok, data: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  },
  getAnalytics: async (_params) => ({ success: true, data: null }),
  analyzeLegalDocument: async (_document) => ({ success: true, data: null }),
  extractClauses: async (_documentId) => ({ success: true, data: null }),
  queryRAG: async (_query, _context) => ({ success: true, data: null }),
  generateEmbedding: async (_text) => ({ success: true, data: [] }),
  semanticSearch: async (_query, _filters) => ({ success: true, data: [] }),
};




