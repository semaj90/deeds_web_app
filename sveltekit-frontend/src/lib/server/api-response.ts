/**
 * Shared API response helpers for consistent, safe error handling.
 *
 * Rules:
 *  - Action routes (POST/PUT/DELETE/PATCH): errorJson() — client checks response.ok
 *  - GET routes: degradedJson() — returns 200 with empty-valid shape, no internal detail leaked
 *  - Never expose (err as Error).message or String(err) in client-facing JSON
 */
import { json } from '@sveltejs/kit';

/**
 * Returns the safe fallback message. The raw error is intentionally ignored
 * so callers are never tempted to forward it to the client.
 * Log the real error before calling this.
 */
export function safeErrorMessage(_err: unknown, fallback = 'Internal server error'): string {
	return fallback;
}

/**
 * Error JSON for action routes (POST / PUT / DELETE / PATCH).
 * Clients check response.ok, so returning 4xx/5xx is correct here.
 *
 * @example
 * } catch (err) {
 *   console.error('[my-route] Error:', err);
 *   return errorJson(500, 'Tag rename failed');
 * }
 */
export function errorJson(
	status: number,
	message = 'Internal server error',
	extra: Record<string, unknown> = {}
): Response {
	return json({ ok: false, error: message, ...extra }, { status });
}

/**
 * Degraded 200 for GET routes that must stay consumable by the UI.
 * Spreads the caller-supplied empty-valid shape, then adds { degraded: true }.
 * Every top-level key from the success response should appear in the shape arg.
 *
 * @example
 * } catch (err) {
 *   console.error('[my-route] Error:', err);
 *   return degradedJson({ items: [], total: 0 });
 * }
 */
export function degradedJson<T extends Record<string, unknown>>(
	shape: T,
	extra: Record<string, unknown> = {},
	status = 200
): Response {
	return json({ ...shape, degraded: true, ...extra }, { status });
}