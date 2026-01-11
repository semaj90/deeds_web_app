/**
 * lib/server/error-brain/middleware.ts
 *
 * PHASE 21: Error-brain middleware and guards
 *
 * Enforces isolation:
 * - Adds X-Error-Brain header
 * - Checks feature flags
 * - Prevents cross-context contamination
 */

import { error, type RequestEvent } from '@sveltejs/kit';
import { isErrorBrainEnabled } from './feature-flags.js';

/**
 * Guard: Ensure error-brain is enabled
 *
 * Throws 503 if disabled
 */
export function requireErrorBrain(event: RequestEvent): void {
 if (!isErrorBrainEnabled()) {
 throw error(503, 'Error-brain system is disabled');
 }
}

/**
 * Add standard error-brain headers to response
 */
export function addErrorBrainHeaders(headers: Headers): void {
 headers.set('X-Error-Brain', '1');
 headers.set('X-Content-Type-Options', 'nosniff');
 headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
}

/**
 * Create isolated error response (never leaks to user-facing routes)
 */
export function createErrorBrainResponse(
 data: unknown,
 status = 200,
 additionalHeaders: Record<string, string> = {}
): Response {
 const headers = new Headers({
 'Content-Type': 'application/json',
 ...additionalHeaders,
 });

 addErrorBrainHeaders(headers);

 return new Response(JSON.stringify(data), {
 status,
 headers,
 });
}

/**
 * Validate request is internal (not from public clients)
 *
 * Checks for internal auth token or localhost origin
 */
export function validateInternalRequest(event: RequestEvent): boolean {
 const authToken = event.request.headers.get('X-Error-Brain-Token');
 const expectedToken = process.env.ERROR_BRAIN_AUTH_TOKEN;

 // If token is configured, require it
 if (expectedToken) {
 return authToken === expectedToken;
 }

 // Otherwise, allow localhost only
 const origin = event.request.headers.get('origin') || '';
 const isLocalhost =
 origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('[::1]');

 return isLocalhost;
}


