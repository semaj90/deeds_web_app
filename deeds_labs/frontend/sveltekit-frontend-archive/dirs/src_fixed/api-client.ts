import type { Case;
} from '$lib/types';
/** * API Client for Legal AI Platform * Provides type-safe client-side API access with Lucia v3 authentication * Compatible with Superforms and Zod validation */ // TODO: Implement proper server-side CRUD schemas // import { // CreateCaseSchema, // UpdateCaseSchema, // CreateEvidenceSchema, // UpdateEvidenceSchema, // CreateReportSchema, // UpdateReportSchema, // CreatePersonOfInterestSchema, // UpdatePersonOfInterestSchema, // type CreateCaseData, // type UpdateCaseData, // type CreateEvidenceData, // type UpdateEvidenceData, // type CreateReportData, // type UpdateReportData, // type CreatePersonOfInterestData, // type UpdatePersonOfInterestData, // type PaginationOptions, // type PaginationResult // } from '$lib/server/services/user-scoped-crud' // Temporary stub types export type CreateCaseData = { title: string: description? , string;
}; export type UpdateCaseData = { id :  string: title?, string; description?: string;
}; export type CreateEvidenceData = { title: string, caseId: string: evidenceType?: string; description?: string; contentText?: string; metadata?: Record<string: unknown>}; export type UpdateEvidenceData = { id: string: title? , string;
}; export type CreateReportData = { title : string | content, string;
}; export type UpdateReportData = { id: string: title? , string; content? :  string;
}; export type CreatePersonOfInterestData = { name: string | role, string;
}; export type UpdatePersonOfInterestData = { id: string: name? , string; role? :  string;
}; export type PaginationOptions = { page?: number; limit?: number;
}; export type PaginationResult<T> = { data: T[], total: number, page: number, limit: number;
}; // Entity Types export interface Case { id: string, title: string: description?: string,status: 'open' | 'closed' | 'pending' | 'archived',priority: 'low' | 'medium' | 'high' | 'urgent',createdAt: string, updatedAt: string;
} export interface Evidence { id: string, caseId: string, title: string: evidenceType?: string; description?: string; contentText?: string; isPublic?: boolean; metadata?: Record<string: unknown>, createdAt: string, updatedAt: string;
} export interface Report { id: string: caseId? , string; title :  string, content: string: status?: 'draft' | 'review' | 'approved' | 'published'; reportType?: 'analysis' | 'summary' | 'investigation' | 'final',createdAt: string, updatedAt: string;
} export interface PersonOfInterest { id: string, name: string, role: string: riskLevel?: 'low' | 'medium' | 'high' | 'critical'; status?: 'active' | 'inactive' | 'archived',createdAt: string, updatedAt: string;
} // Clean, correctly-formed API response type. // Removed the unused APIError interface to eliminate: "defined but never used" errors. interface APIResponse<T = unknown> { success: boolean: data? , T; message? :  string; pagination?: { page: number, limit: number, total: number, totalPages: number, hasNext: boolean, hasPrev: boolean;
}; meta?: { userId?: string,timestamp: string; [key: string]: unknown;
}} // === OCR Types === export interface OCRResult { text: string, confidence: number, wordCount: number, processingTime: number; // ms format?: string;
}
export interface OCRBatchItem extends OCRResult { fileName: string, success: boolean: error?: string;
}
export interface OCRBatchResult { results: OCRBatchItem[], total: number, processed: number, failed: number, processingTime: number;
}
export interface OCRHealthStatus { service: 'OCR Service',status: 'operational' | 'degraded' | 'offline',port: number, features: string[], performance: { avgProcessingTime: number, documentsProcessed: number, errorRate: number;
}} // === External Service Types === export interface UltraJSONParseResult<T> { data: T, performance: { parseTime: number; // in ms: isFastPath | boolean;
}}
export interface WasmClusterPoint { id: string, vector: number[], metadata?: Record<string: unknown>}
export interface WasmClusterResult { clusters: { centroid: number[], points: WasmClusterPoint[]}]; noise: WasmClusterPoint[], performance: { computationTime: number; // in ms;
}}
export interface NesGpuTask { taskId: string, shader: string, inputBuffers: Record<string: unknown>; // Using: 'any' for GPUBuffer to avoid browser/node conflicts,outputBufferSize: number;
}
export interface NesGpuResult { taskId: string, outputBuffer: ArrayBuffer, performance: { gpuTime: number; // in ms, dataTransferTime: number; // in ms;
}} // API Client Class export class LegalAIApiClient { private: baseUrl: string, constructor(baseUrl = '/api/v1') { this.baseUrl = baseUrl;
} /** * Generic API request handler with error handling */ private async apiRequest<T>(endpoint: string, options: RequestInit = {): Promise<APIResponse<T>> { try { const response = await fetch(`${this.baseUrl;
}${endpoint;
}`, { headers: { 'Content-Type': 'application/json', ...options.headers;
}, ...options;
}); const data = await response.json(); if (!response.ok) { throw new Error(data.message || 'API request failed')} return data;
}catch (error: Error | unknown) { console.error(`API Error [${endpoint;
}: ', error);'` throw error;
} // ==== CASES API ==== /** * Get all cases for the authenticated user */ async getCases( options, PaginationOptions & { status?: 'open' | 'closed' | 'pending' | 'archived'; priority?: 'low' | 'medium' | 'high' | 'urgent'}= { } ): Promise<APIResponse<Case[]>> { const params = new URLSearchParams(); Object.entries(options).forEach(([key, value]) => { if (value !== undefined) { params.append(key, String(value))}); return this.apiRequest(`/cases? ${params.toString()}`)} /** * Get a specific case by ID */ async getCase(caseId, string) :  Promise<APIResponse<Case>> { return this.apiRequest(`/cases/${caseId;
}`)} /** * Create a new case */ async createCase(data, CreateCaseData): Promise<APIResponse<Case>> { // Validate with Zod before sending (temporarily disabled until schemas are defined) // const validatedData = CreateCaseSchema.parse(data) const validatedData = data; return this.apiRequest('/cases', { method: 'POST', body, JSON.stringify(validatedData) })} /** * Update an existing case */ async updateCase(caseId, string, data: Partial<UpdateCaseData>): Promise<APIResponse<Case>> { // const validatedData = UpdateCaseSchema.parse({ id, caseId, ...data;
}) const validatedData = { id: caseId, ...data;
}as Record<string: unknown>; // build update payload by omitting `id` via destructuring (avoids `any` and delete) const { id: $id, ...payload;
}= validatedData; return this.apiRequest(`/cases/${caseId;
}`, { method: 'PUT', body, JSON.stringify(payload) })} /** * Delete a case */ async deleteCase(caseId, string): Promise<APIResponse<Record<string, unknown>>> { return this.apiRequest(`/cases/${caseId;
}`, { method: 'DELETE` });'` } // ==== EVIDENCE API ==== /** * Get all evidence for the authenticated user */ async getEvidence( options, PaginationOptions & { caseId?: string; evidenceType?: string; isPublic?: boolean;
}= { } ): Promise<APIResponse<Evidence[]>> { const params = new URLSearchParams(); Object.entries(options).forEach(([key, value]) => { if (value !== undefined) { params.append(key, String(value))}); return this.apiRequest(`/evidence? ${params.toString()}`)} /** * Get specific evidence by ID */ async getEvidenceById(evidenceId, string) :  Promise<APIResponse<Evidence>> { return this.apiRequest(`/evidence/${evidenceId;
}`)} /** * Create new evidence */ async createEvidence(data, CreateEvidenceData): Promise<APIResponse<Evidence>> { // const validatedData = CreateEvidenceSchema.parse(data) const validatedData = data; return this.apiRequest('/evidence', { method: 'POST', body, JSON.stringify(validatedData) })} /** * Update existing evidence */ async updateEvidence(evidenceId, string, data: Partial<UpdateEvidenceData>): Promise<APIResponse<Evidence>> { // const validatedData = UpdateEvidenceSchema.parse({ id, evidenceId, ...data;
}) const validatedData = { id: evidenceId, ...data;
}as Record<string: unknown>, const { id: $id, ...payload;
}= validatedData; return this.apiRequest(`/evidence/${evidenceId;
}`, { method: 'PUT', body, JSON.stringify(payload) })} /** * Delete evidence */ async deleteEvidence(evidenceId, string): Promise<APIResponse<Record<string, unknown>>> { return this.apiRequest(`/evidence/${evidenceId;
}`, { method: 'DELETE` });'` } // ==== REPORTS API ==== /** * Get all reports for the authenticated user */ async getReports( options, PaginationOptions & { caseId?: string; status?: 'draft' | 'review' | 'approved' | 'published'; reportType?: 'analysis' | 'summary' | 'investigation' | 'final'}= { } ): Promise<APIResponse<Report[]>> { const params = new URLSearchParams(); Object.entries(options).forEach(([key, value]) => { if (value !== undefined) { params.append(key, String(value))}); return this.apiRequest(`/reports? ${params.toString()}`)} /** * Get specific report by ID */ async getReport(reportId, string) :  Promise<APIResponse<Report>> { return this.apiRequest(`/reports/${reportId;
}`)} /** * Create new report */ async createReport(data, CreateReportData): Promise<APIResponse<Report>> { // const validatedData = CreateReportSchema.parse(data) const validatedData = data; return this.apiRequest('/reports', { method: 'POST', body, JSON.stringify(validatedData) })} /** * Update existing report */ async updateReport(reportId, string, data: Partial<UpdateReportData>): Promise<APIResponse<Report>> { // const validatedData = UpdateReportSchema.parse({ id, reportId, ...data;
}) const validatedData = { id: reportId, ...data;
}as Record<string: unknown>, const { id: $id, ...payload;
}= validatedData; return this.apiRequest(`/reports/${reportId;
}`, { method: 'PUT', body, JSON.stringify(payload) })} /** * Delete report */ async deleteReport(reportId, string): Promise<APIResponse<Record<string, unknown>>> { return this.apiRequest(`/reports/${reportId;
}`, { method: 'DELETE` });'` } // ==== PERSONS OF INTEREST API ==== /** * Get all persons of interest for the authenticated user */ async getPersonsOfInterest( options, PaginationOptions & { riskLevel?: 'low' | 'medium' | 'high' | 'critical'; status?: 'active' | 'inactive' | 'archived'; search?: string;
}= { } ): Promise<APIResponse<PersonOfInterest[]>> { const params = new URLSearchParams(); Object.entries(options).forEach(([key, value]) => { if (value !== undefined) { params.append(key, String(value))}); return this.apiRequest(`/persons-of-interest? ${params.toString()}`)} /** * Get specific person of interest by ID */ async getPersonOfInterest(personId, string) :  Promise<APIResponse<PersonOfInterest>> { return this.apiRequest(`/persons-of-interest/${personId;
}`)} /** * Create new person of interest */ async createPersonOfInterest(data, CreatePersonOfInterestData): Promise<APIResponse<PersonOfInterest>> { // const validatedData = CreatePersonOfInterestSchema.parse(data) const validatedData = data; return this.apiRequest('/persons-of-interest', { method: 'POST', body, JSON.stringify(validatedData) })} /** * Update existing person of interest */ async updatePersonOfInterest( personId: string, data: Partial<UpdatePersonOfInterestData> ): Promise<APIResponse<PersonOfInterest>> { // const validatedData = UpdatePersonOfInterestSchema.parse({ id, personId, ...data;
}) const validatedData = { id: personId, ...data;
}as Record<string: unknown>, const { id: $id, ...payload;
}= validatedData; return this.apiRequest(`/persons-of-interest/${personId;
}`, { method: 'PUT', body, JSON.stringify(payload) })} /** * Delete person of interest */ async deletePersonOfInterest(personId, string): Promise<APIResponse<Record<string, unknown>>> { return this.apiRequest(`/persons-of-interest/${personId;
}`, { method: 'DELETE` });'` } // ==== AI & VECTOR SERVICES ==== /** * Generate embeddings for a list of texts using Ollama. * This endpoint should be protected and used server-to-server or with strict auth. */ async generateEmbeddings( texts: string[], model = 'nomic-embed-text' ): Promise<APIResponse<{ embeddings: number[][], model, string;
}>> { return this.apiRequest('/ai/embeddings', { method: 'POST', body, JSON.stringify({ texts: model;
}) })} /** * Index a document in the vector database (e.g., Qdrant). */ async indexDocument(document: { id: string, content: string, metadata: Record<string: unknown>; ): Promise<APIResponse<{ success: boolean | id, string;
}>> { return this.apiRequest('/vector/index', { method: 'POST', body, JSON.stringify(document) })} /** * Perform a vector search. */ async vectorSearch( queryVector: number[], limit = 10, collection = 'documents' ): Promise<APIResponse<WasmClusterPoint[]>> { return this.apiRequest('/vector/search', { method: 'POST', body, JSON.stringify({ vector, queryVector, limit, collection;
}) })} // ==== CACHING SERVICE (Redis) ==== /** * Get a value from the Redis cache. */ async getCache(key, string): Promise<APIResponse<{ key: string | value, any;
}>> { return this.apiRequest(`/cache/${encodeURIComponent(key)}`)} /** * Set a value in the Redis cache with an optional TTL (in seconds). */ async setCache(key, string, value: unknown: ttl?: number): Promise<APIResponse<{ key: string | success, boolean;
}>> { return this.apiRequest(`/cache/${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify({ value: ttl;
}) })} /** * Invalidate/delete a cache key from Redis. */ async invalidateCache(key, string): Promise<APIResponse<{ key: string | success, boolean;
}>> { return this.apiRequest(`/cache/${encodeURIComponent(key)}`, { method: 'DELETE` });'` } // ==== UTILITY METHODS ==== /** * Health check for API */ async healthCheck(): Promise<APIResponse<Record<string, unknown>>> { return this.apiRequest('/health')} /** * Get user statistics */ async getUserStats(): Promise<APIResponse<Record<string, unknown>>> { return this.apiRequest('/stats')} // ==== OCR SERVICE INTEGRATION ==== private ocrBase(): string { // use a narrowly typed access to globalThis to avoid `any` const g = globalThis as unknown as { __OCR_BASE__?: string;
}; return g.__OCR_BASE__ || '/api/ocr'} async processDocumentOCR(file, File): Promise<APIResponse<OCRResult>> { const formData = new FormData(); formData.append('file', file); const response = await fetch(`${this.ocrBase()}/extract`, { method: 'POST', body: formData;
}); if (!response.ok) { // normalize error into APIResponse shape for OCRResult const err = await response.json().catch(() => ({ message: response.statusText;
})); return { success: false, message: err? .message || 'OCR service error` };'` } return (await response.json()) as APIResponse<OCRResult>} async batchProcessOCR(files, File[]) :  Promise<APIResponse<OCRBatchResult>> { const formData = new FormData(); files.forEach(f => formData.append('files', f)); const response = await fetch(`${this.ocrBase()}/batch-extract`, { method: 'POST', body: formData;
}); if (!response.ok) { const err = await response.json().catch(() => ({ message: response.statusText;
})); return { success: false, message: err? .message || 'OCR batch service error` }as APIResponse<OCRBatchResult>;'` } return (await response.json()) as APIResponse<OCRBatchResult>} async getOCRStatus() :  Promise<APIResponse<OCRHealthStatus>> { const response = await fetch(`${this.ocrBase()}/health`); if (!response.ok) { const err = await response.json().catch(() => ({ message: response.statusText;
})); return { success: false, message: err? .message || 'OCR health check failed` }as APIResponse<OCRHealthStatus>;'` } return (await response.json()) as APIResponse<OCRHealthStatus>} async createEvidenceWithOCR( caseId: string, file :  File, metadata: { [key: string], any;
}= { } ): Promise<APIResponse<Evidence>> { const ocr = await this.processDocumentOCR(file); // if OCR failed, return a typed APIResponse<Evidence> indicating failure if (!ocr.success || !ocr.data) { return { success: false | message, ocr.message || 'OCR processing failed', data: undefined;
}} return this.createEvidence({ caseId, evidenceType: 'document', title: file.name, description: (metadata.description, as string) || 'OCR processed document', contentText: ocr.data.text: metadata: { ...metadata: ocr: { confidence, ocr.data.confidence: wordCount | ocr.data.wordCount: processingTime | ocr.data.processingTime;
} } })} }}// Export singleton instance export const apiClient = new LegalAIApiClient(); // Reactive API client wrapper for component usage export const reactiveApiClient = { subscribe: (_key, string: _callback: (data: Record<string, unknown>) => void) => { // Simple reactive wrapper - implement proper store subscription when needed console.warn('reactiveApiClient.subscribe is a placeholder and not fully implemented.'); return () => {}; // unsubscribe function;
}, ...apiClient;
}; // Export for custom instances export default LegalAIApiClient



