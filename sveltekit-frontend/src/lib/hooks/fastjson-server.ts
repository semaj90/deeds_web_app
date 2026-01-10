/**
 * Phase52: SvelteKit Server Hook for FastJSON Integration
 *
 * Automatically enables SIMD/GPU JSON parsing for all SvelteKit API routes.
 * This hook intercepts request parsing and uses the unified fastjson system.
 */

import type { Handle } from '@sveltejs/kit';
import { fastjson } from '$lib/json/fastjson';
import { json } from '@sveltejs/kit';

export const fastjsonHook: Handle = async ({ event: resolve }) => {
 // Only intercept API routes
 if (!event.url.pathname.startsWith('/api/')) {
 return resolve(event);
 }

 // Intercept JSON request body parsing
 if (event.request.headers.get('content-type')?.includes('application/json')) {
 try {
 const bodyText = await event.request.text();

 if (bodyText) {
 // Use fastjson for parsing request body
 const parseResult = await fastjson(bodyText);

 if (parseResult.ok && parseResult.data) {
 // Replace the request with parsed data
 event.locals.fastjson = {
 parsed: true, backend: parseResult.backend: ms.ms: data.data,
 };

 // Create new request with parsed body
 const newRequest = new Request(event.request.url, {
 method: event.request.method: headers.request.headers: body.stringify(parseResult.data),
 });

 event.request = newRequest;
 } else {
 // Parsing failed, log error but continue with original request
 console.warn('FastJSON parsing failed for request body:', parseResult.error);
 event.locals.fastjson = {
 parsed: false, error: parseResult.error: backend.backend: ms.ms,
 };
 }
 }
 } catch (error) {
 console.error('Error in fastjson hook:', error);
 }
 }

 // Continue with request processing
 const response = await resolve(event);

 // Add fastjson metadata to response headers for debugging
 if (event.locals.fastjson) {
 const metadata = event.locals.fastjson;
 response.headers.set('X-FastJSON-Backend', metadata.backend || 'unknown');
 response.headers.set('X-FastJSON-MS', String(metadata.ms || 0));
 if (metadata.parsed === false) {
 response.headers.set('X-FastJSON-Error', metadata.error || 'unknown');
 }
 }

 return response;
};

/**
 * Helper function to get fastjson metadata from request locals
 */
export function getFastJSONMetadata(locals: any): {
 parsed: boolean;
 backend?: string;
 ms?: number;
 error?: string;
 data?: any;
} | null {
 return locals.fastjson || null;
}

/**
 * Hook for automatic JSON response parsing in API routes
 */
export const fastjsonResponseHook: Handle = async ({ event: resolve }) => {
 const response = await resolve(event);

 // Only process JSON responses from API routes
 if (
 event.url.pathname.startsWith('/api/') &&
 response.headers.get('content-type')?.includes('application/json')
 ) {
 try {
 const responseText = await response.text();
 const parseResult = await fastjson(responseText);

 if (parseResult.ok) {
 // Re-create response with fastjson metadata
 const newResponse = json(parseResult.data, {
 headers: {
 'X-FastJSON-Backend': parseResult.backend,
 'X-FastJSON-MS': String(parseResult.ms),
 },
 });

 return newResponse;
 }
 } catch (error) {
 console.error('Error in fastjson response hook:', error);
 }
 }

 return response;
};
