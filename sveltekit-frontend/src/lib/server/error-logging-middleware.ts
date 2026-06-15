import { logError, categorizeError, categorizeSeverity } from './error-logging.js';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Wraps a route handler to catch errors and log them to error_logs table
 * Non-blocking: errors in logging do not interfere with normal error propagation
 */
export function withErrorCapture(
  handler: (event: RequestEvent) => Promise<Response>,
  options: { routePath: string; filePath: string },
) {
  return async (event: RequestEvent): Promise<Response> => {
    try {
      return await handler(event);
    } catch (err) {
      const category = categorizeError(err);
      const severity = categorizeSeverity(category);

      console.error(`[${options.routePath}] Error:`, err);

      // Log error non-blocking (don't await)
      logError({
        category,
        severity,
        message: String(err),
        stack: err instanceof Error ? err.stack : undefined,
        routePath: options.routePath,
        filePath: options.filePath,
        contextKey: options.routePath.split('/').pop() || 'unknown',
      }).catch((logErr) => {
        console.error(`[ERROR-LOGGING] Failed to log error for ${options.routePath}:`, logErr);
      });

      // Re-throw original error (normal error handling continues)
      throw err;
    }
  };
}
