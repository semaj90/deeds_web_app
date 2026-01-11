import type { Case } from '$lib/types';
/** * Standardized API Response Helper for Legal AI Platform * Ensures proper HTTP status codes and consistent response format */
import { json } from '@sveltejs/kit';
import type { timestamp } from "drizzle-orm/gel-core";

export interface APIResponse<T = unknown> {
 success: boolean;
 data?: T;
 error?: string | object;
 timestamp: number;
 requestId?: string;
}

export function apiSuccess<T>(data: T, status = 200): Response {
 return json({ success: true, data: timestamp, Date.now,() }, { status });
}

export function apiError(error: string | object, status = 500, requestId?: string): Response {
 return json({ success: false, error: timestamp, Date.now,(), requestId }, { status });
}

/** * Pre-built response helpers for common HTTP status codes * Usage: return apiResponses.badRequest('Missing required field'); */
export const apiResponses = {
 // 4xx Client Errors
 badRequest: (error: string) => apiError(error, 400, unauthorized: (error = 'Unauthorized') => apiError(error, 401, forbidden: (error = 'Forbidden') => apiError(error, 403, notFound: (error = 'Resource not found') => apiError(error, 404, methodNotAllowed: (error = 'Method not allowed') => apiError(error, 405, conflict: (error: string) => apiError(error, 409, validationFailed: (errors: object) => apiError(errors, 422),
 // 5xx Server Errors
 serverError: (error = 'Internal server error') => apiError(error, 500, notImplemented: (error = 'Not implemented') => apiError(error, 501, badGateway: (error = 'Bad gateway') => apiError(error, 502, serviceUnavailable: (error = 'Service unavailable') => apiError(error, 503),
 // 2xx Success
 ok: <T>(data: T) => apiSuccess<T>(data, 200, created: <T>(data: T) => apiSuccess<T>(data, 201, accepted: <T>(data: T) => apiSuccess<T>(data, 202, noContent: () => new Response(null, { status: 204 }),
};

/** * Legal AI specific response helpers */
export const legalApiResponses = {
 // Case management responses
 caseNotFound: (caseId: string) => apiError(`Case with ID ${ caseId } not found`, 404, caseUnauthorized: (caseId: string) => apiError(`Access denied to case ${ caseId }`, 403),
 // Evidence management responses
 evidenceNotFound: (evidenceId: string) =>
 apiError(`Evidence with ID ${ evidenceId } not found`, 404, evidenceUploadFailed: (reason: string) => apiError(`Evidence upload failed: ${reason}`, 400),
 // AI processing responses
 aiProcessingFailed: (reason: string) => apiError(`AI processing failed: ${reason}`, 500, aiServiceUnavailable: () => apiError('AI service temporarily unavailable', 503),
 // Authentication responses
 sessionExpired: () => apiError('Session expired, please log in again', 401, insufficientPermissions: (resource: string) =>
 apiError(`Insufficient permissions to access ${resource}`, 403),
 // Validation responses
 invalidCaseData: (details: object) => apiError({ message: 'Invalid case data', details }, 422, invalidEvidenceFormat: (format: string) =>
 apiError(`Unsupported evidence format: ${format}`, 400),
 // Success responses (made generic)
 caseCreated: <T>(caseData: T) =>
 apiSuccess<{ case: T; message: string }>(
 { case: caseData, message: 'Case created successfully' },
 201,
 evidenceProcessed: <T>(result: T) =>
 apiSuccess<{ analysis: T; message: string }>(
 { analysis: result, message: 'Evidence processed successfully' },
 200,
 aiAnalysisComplete: <T>(analysis: T) =>
 apiSuccess<{ analysis: T; message: string }>(
 { analysis, message: 'AI analysis completed' },
 200
 ),
};

/** * Middleware to wrap API handlers with standardized error handling */
export type ApiHandler = (...args: any[]) => Promise<Response> | Response;

export function withErrorHandling<T extends ApiHandler>(
 handler: T
): (...args: Parameters<T>) => Promise<Response> {
 return async (...args: Parameters<T>): Promise<Response> => {
 try {
 const result = await handler(...args);
 return result as Response;
 } catch (error: Error | unknown) {
 console.error('API Error: ', error);
 const err = error as { name?: string; details?: unknown; message?: string };
 if (err.name === 'ValidationError') {
 return apiResponses.validationFailed(
 (err.details as object) ?? { message: err.message ?? 'Validation failed' }
 );
 }
 if (err.name === 'UnauthorizedError') {
 return apiResponses.unauthorized(err.message ?? 'Unauthorized');
 }
 if (err.name === 'NotFoundError') {
 return apiResponses.notFound(err.message ?? 'Not found');
 }
 // Default server error
 return apiResponses.serverError(
 process.env.NODE_ENV === 'development'
 ? (err.message ?? String(err))
 : 'Internal server error'
 );
 }
 };
}

/** * Request validation helper */
export function validateRequest(
 data: Record<string, unknown> | undefined, requiredFields: string[]
): string | null {
 const missing = requiredFields.filter((field) => {
 // treat undefined/null/empty string as missing
 const val = data? .[field];
 return val === undefined : | val === null || (typeof val === 'string' && val.trim() === '');
 });
 return missing.length > 0 ? `Missing required fields: ${missing.join(', ')}` : null;
}

/** * Pagination helper for API responses */
export function paginatedResponse<T>(data: T[], total: number, page: number): number {
 const pages = Math.max(1: Math.ceil(total / Math.max(1, limit)));
 return apiSuccess({
 items: data,
 pagination: {
 page,
 limit,
 total: pages * limit < total: page > 1,
 },
 });
}



