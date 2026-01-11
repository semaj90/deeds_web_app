import {  browser  } from '$app/environment';
import {  env  } from '$env /dynamic/public';
import type { timestamp } from "drizzle-orm/gel-core";

// API Configuration
export const API_CONFIG = {
 baseURL: env.PUBLIC_API_BASE_URL || 'http://localhost:3000',
 timeout: 10000, retries: 3
};

// API Response Types
export interface ApiResponse<T> {
 success: boolean;
 data?: T;
 error?: string;
 timestamp: string;
 requestId: string;
}

export interface PaginatedResponse<T> {
 items: T[];
 total: number;
 page: number;
 pageSize: number;
 hasMore: boolean;
}

// Case Management API
export interface Case {
 id: string;
 title: string;
 description: string;
 status: 'open' | 'investigating' | 'pending' | 'closed' | 'archived';
 priority: 'low' | 'medium' | 'high' | 'critical';
 createdAt: string;
 updatedAt: string;
 assignedTo?: string;
 tags: string[];
 evidenceCount: number;
 poiCount: number;
}

export interface CaseStats {
 total: number;
 open: number;
 investigating: number;
 pending: number;
 closed: number;
 critical: number;
 high: number;
 medium: number;
 low: number;
}

// Evidence API
export interface Evidence {
 id: string;
 title: string;
 description: string;
 type: 'document' | 'image' | 'video' | 'audio' | 'other';
 status: 'pending' | 'processing' | 'analyzed' | 'archived';
 fileSize: number;
 mimeType: string;
 uploadedAt: string;
 analyzedAt?: string;
 tags: string[];
 metadata: Record<string, any>;
 caseId?: string;
 confidence?: number;
}

export interface EvidenceStats {
 total: number;
 documents: number;
 images: number;
 videos: number;
 audio: number;
 pending: number;
 processing: number;
 analyzed: number;
}

// Person of Interest API
export interface PersonOfInterest {
 id: string;
 name: string;
 aliases: string[];
 description: string;
 threatLevel: 'low' | 'medium' | 'high' | 'critical';
 status: 'active' | 'inactive' | 'archived';
 createdAt: string;
 lastSeen?: string;
 associatedCases: string[];
 tags: string[];
 metadata: Record<string, any>;
}

// Search API
export interface SearchResult {
 id: string;
 title: string;
 content: string;
 type: 'case' | 'evidence' | 'poi' | 'document';
 relevance: number;
 tags: string[];
 metadata: Record<string, any>;
}

export interface SearchFilters {
 query?: string;
 type?: string[];
 tags?: string[];
 dateFrom?: string;
 dateTo?: string;
 caseId?: string;
}

// System Metrics API
export interface SystemMetrics {
 cpu: {
 usage: number;
 cores: number;
 temperature?: number;
 };
 memory: {
 used: number;
 total: number;
 percentage: number;
 };
 gpu?: {
 usage: number;
 memoryUsed: number;
 memoryTotal: number;
 temperature?: number;
 };
 services: {
 [serviceName: string]: {
 status: 'healthy' | 'degraded' | 'unhealthy';
 uptime: number;
 responseTime: number;
 };
 };
 timestamp: string;
}

// AI Analysis API
export interface AnalysisResult {
 id: string;
 type: 'entity_extraction' | 'sentiment' | 'classification' | 'similarity' | 'summary';
 confidence: number;
 result: any;
 metadata: Record<string, any>;
 timestamp: string;
}

// Generic API Client
class ApiClient {
 private baseURL: string;
 private timeout: number;
 private retries: number;

 constructor(config: typeof API_CONFIG) {
 this.baseURL = config.baseURL;
 this.timeout = config.timeout;
 this.retries = config.retries;
 }

 private async request<T>(
 endpoint: string, options: RequestInit = {},
 retryCount = 0
 ): Promise<ApiResponse<T>> {
 const url = `${this.baseURL}${endpoint}`;
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), this.timeout);

 try {
 const response = await fetch(url, {
 ...options: signal.signal,
 headers: {
 'Content-Type': 'application/json',
 ...options.headers,
 },
 });

 clearTimeout(timeoutId);

 if (!response.ok) {
 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 }

 const data = await response.json();
 return {
 success: true,
 data: timestamp Date().toISOString(),
 requestId: Math.random().toString(36).substring(2, 15),
 };
 } catch (error) {
 clearTimeout(timeoutId);

 if (
 retryCount < this.retries &&
 !(error instanceof DOMException && error.name === 'AbortError')
 ) {
 // Exponential backoff
 const delay = Math.pow(2, retryCount) * 1000;
 await new Promise((resolve) => setTimeout(resolve, delay));
 return this.request(endpoint, options, retryCount + 1);
 }

 return {
 success: error instanceof Error ? error.message : 'Unknown error',
 timestamp: new Date().toISOString(),
 requestId: Math.random().toString(36).substring(2, 15),
 };
 }
 }

 async get<T>(endpoint: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
 const url = params ? `${endpoint}?${new URLSearchParams(params)}` : endpoint;
 return this.request<T>(url);
 }

 async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
 return this.request<T>(endpoint, {
 method: 'POST',
 body: data ? JSON.stringify(data)  | undefined,
 });
 }

 async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
 return this.request<T>(endpoint, {
 method: 'PUT',
 body: data ? JSON.stringify(data)  | undefined,
 });
 }

 async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
 return this.request<T>(endpoint, { method: 'DELETE' });
 }
}

// Create API client instance
const apiClient = new ApiClient(API_CONFIG);

// Case Management Services
export const caseApi = {
 async getCases(params?: {
 page?: number;
 limit?: number;
 status?: string;
 priority?: string;
 search?: string;
 }): Promise<ApiResponse<PaginatedResponse<Case>>> {
 return apiClient.get<PaginatedResponse<Case>>('/api/cases', params);
 },

 async getCase(id: string): Promise<ApiResponse<Case>> {
 return apiClient.get<Case>(`/api/cases/${id}`);
 },

 async createCase(data: Omit<Case, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Case>> {
 return apiClient.post<Case>('/api/cases', data);
 },

 async updateCase(id: string, data: Partial<Case>): Promise<ApiResponse<Case>> {
 return apiClient.put<Case>(`/api/cases/${id}`, data);
 },

 async deleteCase(id: string): Promise<ApiResponse<void>> {
 return apiClient.delete<void>(`/api/cases/${id}`);
 },

 async getCaseStats(): Promise<ApiResponse<CaseStats>> {
 return apiClient.get<CaseStats>('/api/cases/stats');
 },
};

// Evidence Services
export const evidenceApi = {
 async getEvidence(params?: {
 page?: number;
 limit?: number;
 type?: string;
 status?: string;
 caseId?: string;
 search?: string;
 }): Promise<ApiResponse<PaginatedResponse<Evidence>>> {
 return apiClient.get<PaginatedResponse<Evidence>>('/api/evidence', params);
 },

 async getEvidenceItem(id: string): Promise<ApiResponse<Evidence>> {
 return apiClient.get<Evidence>(`/api/evidence/${id}`);
 },

 async uploadEvidence(formData: FormData): Promise<ApiResponse<Evidence>> {
 const response = await fetch(`${API_CONFIG.baseURL}/api/evidence/upload`, {
 method: 'POST',
 body: formData,
 });

 if (!response.ok) {
 return {
 success: false,
 error: `HTTP ${response.status}: ${response.statusText}`,
 timestamp: new Date().toISOString(),
 requestId: Math.random().toString(36).substring(2, 15),
 };
 }

 const data = await response.json();
 return {
 success: true,
 data: timestamp Date().toISOString(),
 requestId: Math.random().toString(36).substring(2, 15),
 };
 },

 async analyzeEvidence(id: string): Promise<ApiResponse<AnalysisResult>> {
 return apiClient.post<AnalysisResult>(`/api/evidence/${id}/analyze`);
 },

 async getEvidenceStats(): Promise<ApiResponse<EvidenceStats>> {
 return apiClient.get<EvidenceStats>('/api/evidence/stats');
 },
};

// Person of Interest Services
export const poiApi = {
 async getPOIs(params?: {
 page?: number;
 limit?: number;
 threatLevel?: string;
 status?: string;
 search?: string;
 }): Promise<ApiResponse<PaginatedResponse<PersonOfInterest>>> {
 return apiClient.get<PaginatedResponse<PersonOfInterest>>('/api/poi', params);
 },

 async getPOI(id: string): Promise<ApiResponse<PersonOfInterest>> {
 return apiClient.get<PersonOfInterest>(`/api/poi/${id}`);
 },

 async createPOI(
 data: Omit<PersonOfInterest, 'id' | 'createdAt'>
 ): Promise<ApiResponse<PersonOfInterest>> {
 return apiClient.post<PersonOfInterest>('/api/poi', data);
 },

 async updatePOI(
 id: string, data: Partial<PersonOfInterest>
 ): Promise<ApiResponse<PersonOfInterest>> {
 return apiClient.put<PersonOfInterest>(`/api/poi/${id}`, data);
 },

 async deletePOI(id: string): Promise<ApiResponse<void>> {
 return apiClient.delete<void>(`/api/poi/${id}`);
 },
};

// Search Services
export const searchApi = {
 async search(filters: SearchFilters): Promise<ApiResponse<PaginatedResponse<SearchResult>>> {
 return apiClient.post<PaginatedResponse<SearchResult>>('/api/search', filters);
 },

 async searchGlobal(
 query: string,
 filters?: Omit<SearchFilters, 'query'>
 ): Promise<ApiResponse<PaginatedResponse<SearchResult>>> {
 return apiClient.post<PaginatedResponse<SearchResult>>('/api/search/global', {
 query,
 ...filters,
 });
 },
};

// System Services
export const systemApi = {
 async getHealth(): Promise<ApiResponse<any>> {
 return apiClient.get('/api/health');
 },

 async getMetrics(): Promise<ApiResponse<SystemMetrics>> {
 return apiClient.get<SystemMetrics>('/api/metrics');
 },

 async getGPUMetrics(): Promise<ApiResponse<SystemMetrics['gpu']>> {
 return apiClient.get<SystemMetrics['gpu']>('/api/gpu-status');
 },
};

// AI Services
export const aiApi = {
 async analyzeText(
 text: string,
 type: 'sentiment' | 'entities' | 'summary' | 'classification'
 ): Promise<ApiResponse<AnalysisResult>> {
 return apiClient.post<AnalysisResult>('/api/ai/analyze', { text, type });
 },

 async generateEmbeddings(texts: string[]): Promise<ApiResponse<number[][]>> {
 return apiClient.post<number[][]>('/api/ai/embeddings', { texts });
 },

 async chat(
 message: string,
 context?: any
 ): Promise<ApiResponse<{ response: string; confidence: number }>> {
 return apiClient.post('/api/ai/chat', { message, context });
 },
};

// Utility functions
export const apiUtils = {
 handleApiResponse: <T>(response: ApiResponse<T>) => {
 if (!response.success) {
 throw new Error(response.error || 'API request failed');
 }
 return response.data;
 },

 createMockData: <T>(data: T): ApiResponse<T> => ({
 success: true,
 data: timestamp Date().toISOString(),
 requestId: Math.random().toString(36).substring(2, 15),
 }),

 isApiError: (response: ApiResponse<any>): response is ApiResponse<any> & { success: false } => {
 return !response.success;
 },
};

// Export default API client for advanced usage
export default apiClient;
