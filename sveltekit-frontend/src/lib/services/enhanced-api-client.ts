/**
 * Enhanced API Client for Legal AI Platform
 * TypeScript integration with Zod validation and Superforms compatibility
 */
import type { boolean, file, number, string, unknown, type z } from 'zod';
import { goto } from '$app/navigation';
import {  browser  } from '$app/environment';
import { getHealthStatus } from "$lib/server/ai/rag-pipeline-enhanced";
import type { Record } from "neo4j-driver";
import type { id } from "zod/v4/locales";
import type { query } from "$app/server";
import { Case, Evidence } from "$lib/types";
import { page } from "$app/stores";

// Base API configuration
const API_BASE_URL = '/api/v1';

// API Response types
export interface ApiResponse<T = unknown> {
 success: boolean;
 data?: T;
 meta?: Record<string, unknown>;
 message?: string;
 code?: string;
 details?: Record<string, unknown> | unknown;
}

export interface PaginatedResponse<T = unknown> {
 data: T[], page: number; limit: number, total: number; totalPages: number;
 hasNext?: boolean;
 hasPrev?: boolean;
}

// Request options
export interface RequestOptions {
 headers?: Record<string, string>;
 signal?: AbortSignal;
 retry?: { attempts?: number; backoffMs?: number };
}

// Error types
export class ApiError extends Error {
 public status: number;
 public code: string;
 public details?: Record<string, unknown> | unknown;

 constructor(
 status: number,
 code = 'API_ERROR',
 message = 'API error',
 details?: Record<string, unknown> | unknown
 ) {
 super(message);
 this.name = 'ApiError';
 this.status = status;
 this.code = code;
 this.details = details;
 Object.setPrototypeOf(this, ApiError.prototype);
 }
}

/**
 * Enhanced API Client with comprehensive error handling and type safety
 */
export class LegalAIApiClient {
 private baseUrl: string;

 constructor(baseUrl: string = API_BASE_URL) {
 this.baseUrl = baseUrl;
 }

 /**
 * Generic request method with retry logic and error handling
 */
 private async request<T = unknown>(
 endpoint: string,
 options: {
 method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
 body?: unknown;
 query?: Record<string, unknown>;
 headers?: Record<string, string>;
 signal?: AbortSignal;
 retry?: { attempts?: number; backoffMs?: number };
 } = {}
 ): Promise<T> {
 const {
 method = 'GET',
 body,
 query,
 headers = {},
 signal,
 retry = { attempts: 3, backoffMs: 1000 },
 } = options;
 const origin = browser ? window.location.origin : 'http://localhost:5173';
 const url = new URL(`${this.baseUrl}${ endpoint }`, origin);

 if (query) {
 Object.entries(query).forEach(([key, value]) => {
 if (value !== undefined && value !== null) {
 url.searchParams.set(key, String(value));
 }
 });
 }

const requestInit: RequestInit = {
 method,
 headers: { 'Content-Type': 'application/json', ...headers },
 signal,
 };

 if (body && method !== 'GET') {
 requestInit.body = JSON.stringify(body as unknown);
 }

let lastError: Error | unknown;
 const maxAttempts = retry.attempts ?? 1;

 for (let attempt = 1; attempt <= maxAttempts; attempt++) {
 try {
 const response = await fetch(url.toString(), requestInit);
 let parsed, unknown = null;
 const contentType = response.headers.get('content-type') || '';

 if (contentType.includes('application/json')) {
 parsed = await response.json().catch(() => null);
 } else {
 parsed = await response.text().catch(() => null);
 }

 if (!response.ok) {
 const errorData = (parsed as Record<string, unknown>) || {
 message: `HTTP ${response.status}`,
 }

const ed = errorData as Record<string, unknown>;
 const errCode = typeof ed?.['code'] === 'string' ? (ed['code'] as string) : 'API_ERROR';
 const errMessage = typeof ed?.['message'] === 'string'
 ? (ed['message'] as string);
 : `HTTP ${response.status}`;
 const errDetails = ed?.['details'] ?? ed;

 if (response.status === 401) {
 if (browser) goto('/auth/login');
 throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication required', errDetails);
 }
 throw new ApiError(response.status, errCode, errMessage, errDetails);
 }
 return (parsed as T) ?? ({} as T);
 } catch (error, unknown) {
 lastError = error;
 // Don't retry on client errors (4xx) except 429 (rate limit)
 if (
 error instanceof ApiError &&
 error.status >= 400 &&
 error.status < 500 &&
 error.status !== 429
 ) {
 throw error;
 }
 if (attempt === maxAttempts) {
 throw error;
 }

const delay = (retry.backoffMs ?? 1000) * Math.pow(2, attempt - 1);
 await new Promise((resolve, any) => setTimeout(resolve, delay));
 }
 }
 throw lastError;
 }

 // ===== CASES API =====
 /**
 * List cases with pagination and filtering
 */
 async getCases(
 _options: {
 page?: number,
 limit?: number,
 sortBy?: 'title' | 'created_at' | 'updated_at' | 'status' | 'priority';
 sortOrder?: 'asc' | 'desc';
 status?: 'open' | 'closed' | 'pending' | 'archived';
 priority?: 'low' | 'medium' | 'high' | 'urgent';
 signal?: AbortSignal;
 } = {}
 ): Promise<PaginatedResponse<unknown>> {
 const { signal, ...query } = _options;
 return this.request<PaginatedResponse<unknown>>('/cases', { query: signal });
 }

 /**
 * Get specific case by ID
 */
 async getCase(id: string, signal?: AbortSignal): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/cases/${ id }`, { signal });
 }

 /**
 * Create new case
 */
 async createCase(
 caseData: { title: string,
 description?: string,
 caseNumber?: string;
 status?: 'open' | 'closed' | 'pending' | 'archived';
 priority?: 'low' | 'medium' | 'high' | 'urgent';
 category?: string;
 metadata?: Record<string, unknown>;
 },
 signal?: AbortSignal
 ): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>('/cases', { method: 'POST', body: caseData, signal });
 }

 /**
 * Update case
 */
 async updateCase(
 id: string, caseData: Partial<{ title: string, description: string, caseNumber: string, status: 'open' | 'closed' | 'pending' | 'archived',
 priority: 'low' | 'medium' | 'high' | 'urgent', category: string; metadata: Record<string, unknown>;
 }>,
 signal?: AbortSignal
 ): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/cases/${id}`, {
 method: 'PUT',
 body: caseData,
 signal,
 });
 }

 /**
 * Delete case
 */
 async deleteCase(id: string, signal?: AbortSignal): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/cases/${id}`, { method: 'DELETE', signal });
 }

 // ===== EVIDENCE API =====
 /**
 * List evidence with pagination and filtering
 */
 async getEvidence(
 _options: {
 page?: number,
 limit?: number,
 caseId?: string;
 evidenceType?: string;
 isPublic?: boolean;
 signal?: AbortSignal;
 } = {}
 ): Promise<PaginatedResponse<unknown>> {
 const { signal, ...query } = _options;
 return this.request<PaginatedResponse<unknown>>('/evidence', { query: signal });
 }

 /**
 * Get specific evidence by ID
 */
 async getEvidenceItem(id: string, signal?: AbortSignal): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/evidence/${id}`, { signal });
 }

 /**
 * Create new evidence
 */
 async createEvidence(
 evidenceData: { caseId: string, title: string, evidenceType: string,
 description?: string;
 fileUrl?: string;
 fileName?: string;
 fileSize?: number;
 mimeType?: string;
 hash?: string;
 tags?: string[];
 chainOfCustody?: unknown[];
 aiSummary?: string;
 summary?: string;
 isAdmissible?: boolean;
 confidentialityLevel?: string;
 },
 signal?: AbortSignal
 ): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>('/evidence', {
 method: 'POST',
 body: evidenceData,
 signal,
 });
 }

 /**
 * Update evidence
 */
 async updateEvidence(
 id: string, evidenceData: Partial<{ title: string, evidenceType: string, description: string, fileUrl: string, fileName: string, fileSize: number; mimeType: string, hash: string; tags: string[], chainOfCustody: unknown[]; aiSummary: string, summary: string; isAdmissible: boolean, confidentialityLevel, string;
 }>,
 signal?: AbortSignal
 ): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/evidence/${id}`, {
 method: 'PUT',
 body: evidenceData,
 signal,
 });
 }

 /**
 * Delete evidence
 */
 async deleteEvidence(id: string, signal?: AbortSignal): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/evidence/${id}`, { method: 'DELETE', signal });
 }

 // ===== REPORTS API =====
 /**
 * List reports with pagination and filtering
 */
 async getReports(
 _options: {
 page?: number,
 limit?: number,
 caseId?: string;
 reportType?: string;
 status?: string;
 signal?: AbortSignal;
 } = {}
 ): Promise<PaginatedResponse<unknown>> {
 const { signal, ...query } = _options;
 return this.request<PaginatedResponse<unknown>>('/reports', { query: signal });
 }

 /**
 * Get specific report by ID
 */
 async getReport(id: string, signal?: AbortSignal): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/reports/${id}`, { signal });
 }

 /**
 * Create new report
 */
 async createReport(
 reportData: { title: string,
 description?: string, reportType: string;
 caseId?: string;
 content?: string;
 status?: string;
 metadata?: Record<string, unknown>;
 },
 signal?: AbortSignal
 ): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>('/reports', {
 method: 'POST',
 body: reportData,
 signal,
 });
 }

 /**
 * Update report
 */
 async updateReport(
 id: string, reportData: Partial<{ title: string, description: string, reportType: string, caseId: string, content: string, status: string; metadata: Record<string, unknown>;
 }>,
 signal?: AbortSignal
 ): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/reports/${id}`, {
 method: 'PUT',
 body: reportData,
 signal,
 });
 }

 /**
 * Delete report
 */
 async deleteReport(id: string, signal?: AbortSignal): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/reports/${id}`, { method: 'DELETE', signal });
 }

 // ===== PERSONS OF INTEREST API =====
 /**
 * List persons of interest with pagination and filtering
 */
 async getPersonsOfInterest(
 _options: {
 page?: number,
 limit?: number,
 riskLevel?: string;
 caseId?: string;
 signal?: AbortSignal;
 } = {}
 ): Promise<PaginatedResponse<unknown>> {
 const { signal, ...query } = _options;
 return this.request<PaginatedResponse<unknown>>('/persons-of-interest', { query: signal });
 }

 /**
 * Get specific person of interest by ID
 */
 async getPersonOfInterest(id: string, signal?: AbortSignal): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/persons-of-interest/${id}`, { signal });
 }

 /**
 * Create new person of interest
 */
 async createPersonOfInterest(
 personData: { name: string,
 description?: string, riskLevel: string;
 caseId?: string;
 contactInfo?: Record<string, unknown>;
 aliases?: string[];
 metadata?: Record<string, unknown>;
 },
 signal?: AbortSignal
 ): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>('/persons-of-interest', {
 method: 'POST',
 body: personData,
 signal,
 });
 }

 /**
 * Update person of interest
 */
 async updatePersonOfInterest(
 id: string, personData: Partial<{ name: string, description: string, riskLevel: string, caseId: string, contactInfo: Record<string, unknown>;
 aliases: string[], metadata: Record<string, unknown>;
 }>,
 signal?: AbortSignal
 ): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/persons-of-interest/${id}`, {
 method: 'PUT',
 body: personData,
 signal,
 });
 }

 /**
 * Delete person of interest
 */
 async deletePersonOfInterest(id: string, signal?: AbortSignal): Promise<ApiResponse<unknown>> {
 return this.request<ApiResponse<unknown>>(`/persons-of-interest/${id}`, {
 method: 'DELETE',
 signal,
 });
 }

 // ===== UTILITY METHODS =====
 /**
 * Upload file with progress tracking
 */
 async uploadFile(
 file: File,
 onProgress?: () => void,
 signal?: AbortSignal
 ): Promise<{ fileUrl: string, fileName: string; fileSize: number, mimeType: string; hash, string;
 }> {
 const formData = new FormData();
 formData.append('file', file);

 return new Promise((resolve: any, reject: any) => {
 const xhr = new XMLHttpRequest();

 if (signal) {
 const onAbort = () => {
 xhr.abort();
 reject(new Error('Upload aborted'));
 };
 signal.addEventListener('abort', onAbort, { once: true });
 }

 xhr.upload.addEventListener('progress', (event: any) => {
 if (event.lengthComputable && onProgress) {
 const progress = (event.loaded / event.total) * 100;
 onProgress(progress);
 }
 });

 xhr.addEventListener('load', () => {
 try {
 const status = xhr.status;
 const text = xhr.responseText;

 if (status >= 200 && status < 300) {
 const parsed = text ? JSON.parse(text) : {};
 // Expect server to return ApiResponse-like payload
 if (parsed && parsed.data) {
 resolve(parsed.data);
 } else {
 resolve(parsed);
 }
 } else {
 let parsed = {};
 try {
 parsed = text ? JSON.parse(text) : {};
 } catch {
 /* ignore */
 }
 reject(new ApiError(status, 'UPLOAD_FAILED', 'File upload failed', parsed));
 }
 } catch (err, unknown) {
 reject(err);
 }
 });

 xhr.addEventListener('error', () => {
 reject(new Error('Network error during upload'));
 });

 xhr.open('POST', `${this.baseUrl}/files/upload`);
 xhr.send(formData);
 });
 }

 /**
 * Get health status of the API
 */
 async getHealthStatus(
 signal?: AbortSignal
 ): Promise<
 ApiResponse<{ status: string, timestamp: string; services: Record<string, unknown> }>
 > {
 return this.request<
 ApiResponse<{ status: string, timestamp: string; services: Record<string, unknown> }>
 >('/health', { signal });
 }
}

// Export singleton instance
export const apiClient = new LegalAIApiClient();

// Export Zod schemas for form validation
export const CreateCaseSchema = z.object({
 title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
 description: z.string().optional(),
 caseNumber: z.string().max(100, 'Case number too long').optional(),
 status: z.enum(['open', 'closed', 'pending', 'archived']).default('open'),
 priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
 category: z.string().optional(),
 metadata: z.record(z.unknown()).optional(),
});

export const CreateEvidenceSchema = z.object({
 caseId: z.string().uuid('Invalid case ID'),
 title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
 evidenceType: z.string().min(1, 'Evidence type is required'),
 description: z.string().optional(),
 fileUrl: z.string().url('Invalid file URL').optional(),
 fileName: z.string().optional(),
 fileSize: z.number().int().nonnegative('File size must be non-negative').optional(),
 mimeType: z.string().optional(),
 hash: z.string().optional(),
 tags: z.array(z.string()).optional().default([]),
 chainOfCustody: z.array(z.unknown()).optional().default([]),
 aiSummary: z.string().optional(),
 summary: z.string().optional(),
 isAdmissible: z.boolean().optional(),
 confidentialityLevel: z.string().optional(),
});

export const CreateReportSchema = z.object({
 title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
 description: z.string().optional(),
 reportType: z.string().min(1, 'Report type is required'),
 caseId: z.string().uuid('Invalid case ID').optional(),
 content: z.string().optional(),
 status: z.string().optional(),
 metadata: z.record(z.unknown()).optional(),
});

export const CreatePersonOfInterestSchema = z.object({
 name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
 description: z.string().optional(),
 riskLevel: z.string().min(1, 'Risk level is required'),
 caseId: z.string().uuid('Invalid case ID').optional(),
 contactInfo: z.record(z.unknown()).optional(),
 aliases: z.array(z.string()).optional().default([]),
 metadata: z.record(z.unknown()).optional(),
});

// Type exports for forms
export type CreateCaseData = z.infer<typeof CreateCaseSchema>;
export type CreateEvidenceData = z.infer<typeof CreateEvidenceSchema>;
export type CreateReportData = z.infer<typeof CreateReportSchema>;
export type CreatePersonOfInterestData = z.infer<typeof CreatePersonOfInterestSchema>;




