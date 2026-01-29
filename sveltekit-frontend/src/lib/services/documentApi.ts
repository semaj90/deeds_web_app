/**
 * Document API Service
 * Handles document processing, upload, and management operations
 */
export interface DocumentMetadata {
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  caseId?: string;
  documentType?: string;
  tags?: string[];
  isConfidential?: boolean;
}

export interface ProcessingResult {
  documentId: string;
  status: 'processing' | 'completed' | 'failed';
  extractedText?: string;
  embeddings?: number[][];
  analysis?: {
    summary: string;
    entities: Record<string, unknown>[]; // replaced any[] -> Record<string, unknown>[]
    sentiment: string;
    classification: string;
  };
  error?: string;
}

export interface UploadProgress {
  documentId: string;
  progress: number;
  stage: string;
  status: 'uploading' | 'processing' | 'completed' | 'error';
}

export interface ListDocumentsResult {
  documents: Record<string, unknown>[]; // replaced any[] -> Record<string, unknown>[]
  total: number;
  page: number;
  limit: number;
}

export interface SearchDocumentsResult {
  results: Record<string, unknown>[]; // replaced any[] -> Record<string, unknown>[]
  total: number;
}

export interface ProcessingAnalytics {
  totalDocuments: number;
  processingStats: { completed: number; processing: number; failed: number };
  averageProcessingTime: number;
  documentTypes: Record<string, number>;
}

export class DocumentApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = '/api';
  }

  // Helper to convert unknown errors to a string safely
  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'Unknown error');
  }

  /**
   * Upload a document with metadata
   */
  async uploadDocument(
    file: File,
    metadata: Partial<DocumentMetadata> = {}
  ): Promise<{ success: boolean; documentId?: string; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Add metadata (stringify objects/arrays)
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
      });

      const response = await fetch(`${this.baseUrl}/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      // cast to expected return shape
      return (await response.json()) as { success: boolean; documentId?: string; error?: string };
    } catch (error: unknown) {
      const message = this.formatError(error);
      console.error('Document upload failed:', message);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Process document through evidence pipeline
   */
  async processDocument(
    documentId: string,
    options: {
      enableOCR?: boolean;
      enableEmbeddings?: boolean;
      enableAnalysis?: boolean;
      caseId?: string;
    } = {}
  ): Promise<ProcessingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/documents/${encodeURIComponent(documentId)}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        throw new Error(`Processing failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as ProcessingResult;
    } catch (error: unknown) {
      const message = this.formatError(error);
      console.error('Document processing failed:', message);
      return {
        documentId,
        status: 'failed',
        error: message,
      };
    }
  }

  /**
   * Get processing status
   */
  async getProcessingStatus(documentId: string): Promise<UploadProgress | null> {
    try {
      const response = await fetch(`${this.baseUrl}/documents/${encodeURIComponent(documentId)}/status`);

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as UploadProgress;
    } catch (error: unknown) {
      const message = this.formatError(error);
      console.error('Status check failed:', message);
      return null;
    }
  }

  /**
   * Get document details
   */
  async getDocument(documentId: string): Promise<(DocumentMetadata & { id?: string; content?: string }) | null> {
    try {
      const response = await fetch(`${this.baseUrl}/documents/${encodeURIComponent(documentId)}`);

      if (!response.ok) {
        throw new Error(`Get document failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as DocumentMetadata & { id?: string; content?: string };
    } catch (error: unknown) {
      const message = this.formatError(error);
      console.error('Get document failed:', message);
      return null;
    }
  }

  /**
   * List documents for a case
   */
  async listDocuments(
    caseId?: string,
    options: { page?: number; limit?: number; type?: string; status?: string } = {}
  ): Promise<ListDocumentsResult> {
    try {
      const params = new URLSearchParams();
      if (caseId) params.append('caseId', caseId);
      if (options.page != null) params.append('page', String(options.page));
      if (options.limit != null) params.append('limit', String(options.limit));
      if (options.type) params.append('type', options.type);
      if (options.status) params.append('status', options.status);

      const response = await fetch(`${this.baseUrl}/documents?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`List documents failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as ListDocumentsResult;
    } catch (error: unknown) {
      const message = this.formatError(error);
      console.error('List documents failed:', message);
      return {
        documents: [],
        total: 0,
        page: options.page ?? 1,
        limit: options.limit ?? 10,
      };
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/documents/${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status} ${response.statusText}`);
      }

      return { success: true };
    } catch (error: unknown) {
      const message = this.formatError(error);
      console.error('Document deletion failed:', message);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Search documents
   */
  async searchDocuments(
    query: string,
    options: { caseId?: string; type?: string; limit?: number; useSemanticSearch?: boolean } = {}
  ): Promise<SearchDocumentsResult> {
    try {
      const response = await fetch(`${this.baseUrl}/documents/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...options }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as SearchDocumentsResult;
    } catch (error: unknown) {
      const message = this.formatError(error);
      console.error('Document search failed:', message);
      return { results: [], total: 0 };
    }
  }

  /**
   * Get document processing analytics
   */
  async getProcessingAnalytics(caseId?: string): Promise<ProcessingAnalytics | null> {
    try {
      const params = new URLSearchParams();
      if (caseId) params.append('caseId', caseId);

      const response = await fetch(`${this.baseUrl}/documents/analytics?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Analytics failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as ProcessingAnalytics;
    } catch (error: unknown) {
      const message = this.formatError(error);
      console.error('Analytics failed:', message);
      return {
        totalDocuments: 0,
        processingStats: { completed: 0, processing: 0, failed: 0 },
        averageProcessingTime: 0,
        documentTypes: {},
      };
    }
  }

  /**
   * Integrate with legal ingest API
   */
  async processLegalDocuments(
    files: File[],
    options: { caseId: string; jurisdiction?: string; enhanceRAG?: boolean }
  ): Promise<
    | {
        success: boolean;
        caseId: string;
        documentsProcessed: number;
        totalProcessingTime: number;
        documents: Record<string, unknown>[]; // replaced any[] -> Record<string, unknown>[]
        error?: string;
      }
    | { success: false; error: string }
  > {
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('pdfFiles', file));
      formData.append('caseId', options.caseId);
      if (options.jurisdiction) formData.append('jurisdiction', options.jurisdiction);
      if (options.enhanceRAG) formData.append('enhanceRAG', 'true');

      const response = await fetch(`${this.baseUrl}/legal/ingest`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Legal processing failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as
        | {
            success: boolean;
            caseId: string;
            documentsProcessed: number;
            totalProcessingTime: number;
            documents: Record<string, unknown>[];
            error?: string;
          }
        | { success: false; error: string };
    } catch (error: unknown) {
      const message = this.formatError(error);
      console.error('Legal document processing failed:', message);
      return {
        success: false,
        error: message,
      };
    }
  }
}

// Export singleton instance
export const documentApiService = new DocumentApiService();