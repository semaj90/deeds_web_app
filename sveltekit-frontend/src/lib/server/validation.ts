/**
 * Shared server-side validation utilities for API routes.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true if `s` is a valid UUID v4 string. */
export function isUuid(s: string | undefined | null): s is string {
	return typeof s === 'string' && UUID_RE.test(s);
}

/** Returns a 400 JSON Response if any param fails UUID validation. */
export function validateUuidParams(
	params: Record<string, string | undefined>,
	...keys: string[]
): Response | null {
	for (const key of keys) {
		if (!isUuid(params[key])) {
			return new Response(
				JSON.stringify({ error: `Invalid ${key} format — expected UUID` }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}
	}
	return null;
}

// ─── Non-UUID param validators ───────────────────────────────────────

const ROUTE_ID_RE = /^[\w/\-[\].:]+$/;
const SAFE_ID_RE = /^[\w\-:]+$/;

/** Validate a route path identifier (e.g. "/cases/[id]/overview"). Max 500 chars. */
export function isValidRouteId(s: string | undefined | null): s is string {
	return typeof s === 'string' && s.length > 0 && s.length <= 500 && ROUTE_ID_RE.test(s);
}

/** Validate a CouchDB / hash-style ID (alphanumeric + hyphens + colons). Max 255 chars. */
export function isValidSafeId(s: string | undefined | null): s is string {
	return typeof s === 'string' && s.length > 0 && s.length <= 255 && SAFE_ID_RE.test(s);
}

/** Validate a decoded file path (no null bytes, no path traversal, max 1000 chars). */
export function isValidFilePath(s: string | undefined | null): s is string {
	return typeof s === 'string' && s.length > 0 && s.length <= 1000 && !s.includes('\0') && !s.includes('..');
}

/** Validate a citation text string. Max 500 chars. */
export function isValidCitation(s: string | undefined | null): s is string {
	return typeof s === 'string' && s.length > 0 && s.length <= 500;
}
