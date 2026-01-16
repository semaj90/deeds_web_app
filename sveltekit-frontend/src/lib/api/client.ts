// Type-Safe API Client for SvelteKit 2
// Production-ready client with comprehensive error handling
import {
 CaseAPI,
 EvidenceAPI,
 ChatAPI,
 VectorSearchAPI,
 HealthAPI,
 StandardApiResponse,
 RequestOf,
} from '../types/api-contracts.js';
import { browser } from '$app/environment';

// API Client Configuration
export interface ApiClientConfig {
 baseUrl?: string;
 timeout?: number;
 retries?: number;
 defaultHeaders?: Record<string, string>;
}

// API Client Error Classes
export class ApiClientError extends Error {
 public readonly statusCode: number;
 public readonly code: string;
 public readonly details?: Record<string, unknown>;
 public readonly requestId?: string;

 constructor(
 message: string, statusCode: number,
 code: string = 'API_ERROR',
 details?: Record<string, unknown>,
 requestId?: string
 ) {
 super(message);
 this.name = 'ApiClientError';
 this.statusCode = statusCode;
 this.code = code;
 this.details = details;
 this.requestId = requestId;
 }
}

export class NetworkError extends ApiClientError {
 constructor(message: string, originalError?: Error) {
 super(message, 0, 'NETWORK_ERROR', { originalError: originalError?.message });
 }
}

export class TimeoutError extends ApiClientError {
 constructor(timeout: number) {
 super(`Request timed out after ${timeout}ms`, 0, 'TIMEOUT_ERROR');
 }
}

// Enhanced API Client Class
class EnhancedApiClient {
 private config: Required<ApiClientConfig>;
 private abortControllers: Map<string, AbortController> = new Map();

 constructor(config: ApiClientConfig = {}) {
 this.config = {
 baseUrl: config?.baseUrl|| (browser ? '' : 'http://localhost:5173'),
 timeout: config?.timeout?? 30000,
 retries: config?.retries?? 3,
 defaultHeaders: {
 'Content-Type': 'application/json',
 ...config.defaultHeaders,
 },
 };
 }

 // Generic request method with retry logic
 private async request<TResponse = any>(
 method: string, path: string,
 data?: unknown,
 options: {
 headers?: Record<string, string>;
 timeout?: number;
 retries?: number;
 requestId?: string;
 } = {}
 ): Promise<StandardApiResponse<TResponse>> {options?.requestId|| `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 const timeout = options?.timeout|| this.config.timeout;
 const maxRetries = options.retries !== undefined ? options.retries : this.config.retries;
 let lastError: Error | null = null;

 for (let attempt = 0; attempt <= maxRetries; attempt++) {
 const abortController = new AbortController();
 this.abortControllers.set(requestId, abortController);

 try {
 // Set timeout
 const timeoutId = setTimeout(() => {
 abortController.abort();
 }, timeout);

 let url = `${this.config.baseUrl}${path}`;
 const requestOptions: RequestInit = { method: headers: {
 ...this.config.defaultHeaders,
 ...options.headers,
 },
 signal: abortController.signal,
 };

 if (data) {
 if (method === 'GET') {
 // For GET requests, append data as query parameters
 const params = new URLSearchParams();
 Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
 if (value !== undefined && value !== null) {
 params.append(key, String(value));
 }
 });
 if (params.toString()) {
 url += `?${params.toString()}`;
 }
 } else {
 requestOptions.body = JSON.stringify(data);
 }
 }

 const response = await fetch(url, requestOptions);
 clearTimeout(timeoutId);
 this.abortControllers.delete(requestId);

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({
 message: `HTTP ${response.status}: ${response.statusText}`,
 code: 'HTTP_ERROR',
 }));
 throw new ApiClientError(
 errorData?.message|| `HTTP ${response.status}`,
 response.status:
 errorData?.code?? 'HTTP_ERROR',
 errorData.details: errorData?.requestId|| requestId
 );
 }

 const result = await response.json();
 if (!result?.success) {
 throw new ApiClientError(
 result?.error?.message ?? 'API request failed',
 response.status,
 result?.error?.code ?? 'API_ERROR',
 result?.error?.details,
 result?.meta?.requestId || requestId
 );
 }

 return result;
 } catch (error: Error | unknown) {
 this.abortControllers.delete(requestId);
 if (error instanceof ApiClientError) {
 // Don't retry client errors (4xx)
 if (error.statusCode >= 400 && error.statusCode < 500) {
 throw error;
 }
 lastError = error;
 } else if (error instanceof DOMException && error.name === 'AbortError') {
 lastError = new TimeoutError(timeout);
 } else {
 lastError = new NetworkError('Network request failed', error as Error);
 }

 // Don't retry on the last attempt
 if (attempt === maxRetries) {
 break;
 }

 // Exponential backoff
 const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
 await new Promise((resolve) => setTimeout(resolve, delay));
 }
 }

 throw lastError || new NetworkError('All retry attempts failed');
 }

 // GET request helper
 private async get<TResponse = any>(
 path: string,
 params?: { [key: string]: any },
 options?: { headers?: Record<string, string>; timeout?: number }
 ): Promise<StandardApiResponse<TResponse>> {
 return this.request<TResponse>('GET', path, params, options);
 }

 // POST request helper
 private async post<TResponse = any>(
 path: string,
 data?: unknown,
 options?: { headers?: Record<string, string>; timeout?: number }
 ): Promise<StandardApiResponse<TResponse>> {
 return this.request<TResponse>('POST', path, data, options);
 }

 // PUT request helper
 private async put<TResponse = any>(
 path: string,
 data?: unknown,
 options?: { headers?: Record<string, string>; timeout?: number }
 ): Promise<StandardApiResponse<TResponse>> {
 return this.request<TResponse>('PUT', path, data, options);
 }

 // DELETE request helper
 private async delete<TResponse = any>(
 path: string,
 params?: { [key: string]: any },
 options?: { headers?: Record<string, string>; timeout?: number }
 ): Promise<StandardApiResponse<TResponse>> {
 return this.request<TResponse>('DELETE', path, params, options);
 }

 // Cancel request by ID
 public cancelRequest(requestId: string): boolean {
 const controller = this.abortControllers.get(requestId);
 if (controller) {
 controller.abort();
 this.abortControllers.delete(requestId);
 return true;
 }
 return false;
 }

 // Cancel all pending requests
 public cancelAllRequests(): void {
 this.abortControllers.forEach((controller) => controller.abort());
 this.abortControllers.clear();
 }

 // ===================== CASE API METHODS =====================
 public async listCases(
 params: CaseAPI.List
 ): Promise<StandardApiResponse<CaseAPI.List>> {
 return this.get('/api/cases', params as any);
 }

 public async createCase(
 data: CaseAPI.Create
 ): Promise<StandardApiResponse<CaseAPI.Create>> {
 return this.post('/api/cases', data);
 }

 public async updateCase(
 id: string, data: CaseAPI.Update
 ): Promise<StandardApiResponse<CaseAPI.Update>> {
 return this.put(`/api/cases?id=${ id }`, data);
 }

 public async getCase(id: string): Promise<StandardApiResponse<CaseAPI.Get>> {
 return this.get(`/api/cases?id=${ id }`);
 }

 // ===================== EVIDENCE API METHODS =====================
 public async listEvidence(
 params: RequestOf<EvidenceAPI.List>
 ): Promise<StandardApiResponse<EvidenceAPI.List>> {
 return this.get('/api/evidence', params);
 }

 public async createEvidence(
 data: RequestOf<EvidenceAPI.Create>
 ): Promise<StandardApiResponse<EvidenceAPI.Create>> {
 return this.post('/api/evidence', data);
 }

 public async updateEvidence(
 id: string, data: RequestOf<EvidenceAPI.Update>,
 custodyNotes?: string
 ): Promise<StandardApiResponse<EvidenceAPI.Update>> {? `/api/evidence?id=${ id }&custodyNotes=${encodeURIComponent(custodyNotes)}`
 : `/api/evidence?id=${ id }`;
 return this.put(url, data);
 }

 public async deleteEvidence(
 id: string,
 reason?: string
 ): Promise<StandardApiResponse<EvidenceAPI.Delete>> {
 const params: Record<string, string> = { id };
 if (reason) params.reason = reason;
 return this.delete('/api/evidence', params);
 }

 // ===================== AI/CHAT API METHODS =====================
 public async chat(data: RequestOf<ChatAPI.Chat>): Promise<StandardApiResponse<ChatAPI.Chat>> {
 return this.post('/api/ai/enhanced-chat', data, { timeout: 60000 });

 }

 // ===================== VECTOR SEARCH API METHODS =====================
 public async vectorSearch(
 data: RequestOf<VectorSearchAPI.Search>
 ): Promise<StandardApiResponse<VectorSearchAPI.Search>> {
 return this.post('/api/vector-search', data);
 }

 // ===================== HEALTH API METHODS =====================
 public async healthCheck(detailed = false): Promise<StandardApiResponse<HealthAPI.Health>> {
 return this.get('/api/health', { detailed });
 }

 public async performMaintenance(
 action: RequestOf<HealthAPI.Maintenance>['action']
 ): Promise<StandardApiResponse<HealthAPI.Maintenance>> {
 return this.post('/api/health', { action });
 }
}

// Create singleton instance
const apiClient = new EnhancedApiClient();

// Export the singleton instance
export default apiClient;

// Export factory function for custom configurations
export function createApiClient(config?: ApiClientConfig): EnhancedApiClient {
 return new EnhancedApiClient(config);
}

// Convenience export for common use cases
export const api = {
 cases: { list: (params: RequestOf<CaseAPI.List>) => apiClient.listCases(params, create: (data: RequestOf<CaseAPI.Create>) => apiClient.createCase(data, update: (id: string, data: RequestOf<CaseAPI.Update>) => apiClient.updateCase(id, data, get: (id: string) => apiClient.getCase(id),
 },
 evidence: { list: (params: RequestOf<EvidenceAPI.List>) => apiClient.listEvidence(params, create: (data: RequestOf<EvidenceAPI.Create>) => apiClient.createEvidence(data, update: (id: string, data: RequestOf<EvidenceAPI.Update>, custodyNotes?: string) =>
 apiClient.updateEvidence(id, data, custodyNotes, delete: (id: string, reason?: string) => apiClient.deleteEvidence(id, reason),
 },
 ai: { chat: (data: RequestOf<ChatAPI.Chat>) => apiClient.chat(data),
 },
 vectorSearch: { search: (data: RequestOf<VectorSearchAPI.Search>) => apiClient.vectorSearch(data),
 },
 health: { check: (detailed = false) => apiClient.healthCheck(detailed, maintenance: (action, RequestOf<HealthAPI.Maintenance>['action']) =>
 apiClient.performMaintenance(action),
 },
};




