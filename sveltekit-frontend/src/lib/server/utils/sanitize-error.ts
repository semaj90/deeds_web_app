import { dev } from '$app/environment';

/**
 * Sanitize error messages for API responses.
 * In dev: returns full error message for debugging.
 * In prod: returns generic message to prevent information leakage.
 */
export function sanitizeError(err: unknown): string {
  if (dev) {
    return err instanceof Error ? err.message : String(err);
  }
  return 'An internal error occurred';
}

/**
 * Create a sanitized JSON error response.
 * Logs the full error server-side, returns safe message to client.
 */
export function errorResponse(
  err: unknown,
  status: number = 500,
  context?: string
): Response {
  const message = err instanceof Error ? err.message : String(err);
  if (context) {
    console.error(`[${context}]`, message);
  }
  return new Response(
    JSON.stringify({ error: sanitizeError(err) }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}
