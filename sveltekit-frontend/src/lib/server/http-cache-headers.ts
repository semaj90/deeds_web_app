import type { RequestEvent } from "@sveltejs/kit";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * HTTP Cache Headers Utility
 */

export interface CacheConfig {
    maxAge?: number; // seconds
    staleWhileRevalidate?: number; // seconds
    staleIfError?: number; // seconds
    mustRevalidate?: boolean;
    noCache?: boolean;
    private?: boolean;
}

export const CACHE_STRATEGIES = {
    STATIC_CONTENT: {
	maxAge: 3600, staleWhileRevalidate: 86400, staleIfError: 604800, private: false },
	VECTOR_SEARCH: {
	maxAge: 1800, staleWhileRevalidate: 3600, staleIfError: 7200, private: false },
	AI_RESPONSES: {
	maxAge: 900, staleWhileRevalidate: 1800, private: true },
	DOCUMENT_SUMMARIES: {
	maxAge: 3600, staleWhileRevalidate: 7200, private: false },
	USER_DATA: {
	maxAge: 300, staleWhileRevalidate: 600, private: true, mustRevalidate: true },
	REALTIME: {
	maxAge: 60, mustRevalidate: true, private: true },
	IMMUTABLE: {
	maxAge: 31536000, private: false }
} as const;

function generateCacheControlHeader(config: CacheConfig): string {
    const parts: string[] = [];
    if (config.noCache) {
        parts.push('no-cache');
    } else {
        parts.push(config.private ? 'private' : 'public');
        if (config.maxAge !== undefined) parts.push(`max-age=${config.maxAge}`);
        if (config.staleWhileRevalidate !== undefined) parts.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
        if (config.staleIfError !== undefined) parts.push(`stale-if-error=${config.staleIfError}`);
        if (config.mustRevalidate) parts.push('must-revalidate');
    }
    return parts.join(', ');
}

function generateETag(content: unknown): string {
    const crypto =  require('crypto');
    const hash = crypto.createHash('sha256')
        .update(typeof content === 'string' ? content : JSON.stringify(content))
        .digest('hex');
    return `"${hash.substring(0, 16)}"`;
}

export function applyCacheHeaders(
    response: Response,
    strategy: keyof typeof CACHE_STRATEGIES | CacheConfig,
    options: { content?: unknown; generateETag?: boolean; lastModified?: Date } = {}
): Response {
    const config = typeof strategy === 'string' ? CACHE_STRATEGIES[strategy] : strategy;
    const headers = new Headers(response.headers);

    headers.set('Cache-Control', generateCacheControlHeader(config));
    headers.set('Vary', 'Accept, Accept-Encoding, Authorization');

    if (options.generateETag && options.content) {
        headers.set('ETag', generateETag(options.content));
    }
    if (options.lastModified) {
        headers.set('Last-Modified', options.lastModified.toUTCString());
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

export function cachedJson(
    data: any,
    strategy: keyof typeof CACHE_STRATEGIES | CacheConfig,
    options: { status?: number; generateETag?: boolean; lastModified?: Date } = {}
): Response {
    const jsonString = JSON.stringify(data);
    const response = new Response(jsonString, {
        status: options.status ?? 200,
        headers: { 'Content-Type': 'application/json' }
    });

    return applyCacheHeaders(response, strategy, {
        content: data,
        generateETag: options.generateETag ?? true,
        lastModified: options.lastModified
    });
}

export function checkConditionalHeaders(
    request: Request,
    etag?: string,
    lastModified?: Date
): {
	isNotModified: boolean; shouldSend304: boolean } {
    const ifNoneMatch = request.headers.get('If-None-Match');
    const ifModifiedSince = request.headers.get('If-Modified-Since');
    let isNotModified = false;

    if (ifNoneMatch && etag) {
        const clientETags = ifNoneMatch.split(',').map(tag => tag.trim());
        isNotModified = clientETags.includes(etag) || clientETags.includes('*');
    } else if (ifModifiedSince && lastModified) {
        const clientDate = new Date(ifModifiedSince);
        const resourceDate = new Date(lastModified);
        // Resource is not modified if it's older than or equal to client's date
        // (Removing ms precision for comparison)
        isNotModified = Math.floor(resourceDate.getTime() / 1000) <= Math.floor(clientDate.getTime() / 1000);
    }

    return { isNotModified, shouldSend304: isNotModified };
}

export function notModifiedResponse(etag?: string, lastModified?: Date): Response {
    const headers = new Headers();
    if (etag) headers.set('ETag', etag);
    if (lastModified) headers.set('Last-Modified', lastModified.toUTCString());
    return new Response(null, { status: 304, headers });
}

export function clearCacheHeaders(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.delete('Cache-Control');
    headers.delete('ETag');
    headers.delete('Last-Modified');
    headers.delete('Expires');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}
