import { db } from './db/client.js';
import { errorLogs } from './db/schema-postgres.js';
import { v4 as uuid } from 'uuid';

export type ErrorSeverity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';
export type ErrorCategory =
  | 'missing_field'
  | 'type_mismatch'
  | 'validation_error'
  | 'database_error'
  | 'network_error'
  | 'authentication_error'
  | 'authorization_error'
  | 'not_found_error'
  | 'timeout_error'
  | 'parsing_error'
  | 'inference_error'
  | 'vector_search_error'
  | 'file_operation_error'
  | 'identity_error'
  | 'unknown_error';

export interface LogErrorOptions {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  contextKey?: string; // route, function, component name
  routePath?: string; // e.g., /api/evidence/upload
  filePath?: string; // source file path
  lineNumber?: number;
  packetKey?: string;
  sourceRef?: string;
  userId?: string; // from locals.user.id if available
}

/**
 * Log an error to the error_logs table for P1 agentic error fixing
 * Non-blocking: errors in logging do not propagate to caller
 */
export async function logError(options: LogErrorOptions): Promise<void> {
  try {
    const id = uuid();
    const now = new Date();

    await db.insert(errorLogs).values({
      id,
      error_category: options.category,
      severity: options.severity,
      message: options.message,
      stack: options.stack,
      context_key: options.contextKey,
      route_path: options.routePath,
      file_path: options.filePath,
      line_number: options.lineNumber,
      packet_key: options.packetKey,
      source_ref: options.sourceRef,
      created_at: now,
      resolved: false,
      audit_count: 1,
      last_audit_at: now,
    });
  } catch (err) {
    // Silent failure — do not break caller on logging error
    console.error('[ERROR-LOGGING] Failed to insert error_logs row:', err);
  }
}

/**
 * Error categorization helper — infer category from error type
 */
export function categorizeError(err: unknown): ErrorCategory {
  if (err instanceof TypeError) return 'type_mismatch';
  if (err instanceof SyntaxError) return 'parsing_error';
  if (err instanceof ReferenceError) return 'missing_field';

  const msg = String(err).toLowerCase();

  if (msg.includes('timeout')) return 'timeout_error';
  if (msg.includes('network') || msg.includes('econnrefused')) return 'network_error';
  if (msg.includes('unauthorized') || msg.includes('401')) return 'authentication_error';
  if (msg.includes('forbidden') || msg.includes('403')) return 'authorization_error';
  if (msg.includes('not found') || msg.includes('404')) return 'not_found_error';
  if (msg.includes('validation')) return 'validation_error';
  if (msg.includes('database') || msg.includes('postgres')) return 'database_error';
  if (msg.includes('vector') || msg.includes('qdrant')) return 'vector_search_error';
  if (msg.includes('file') || msg.includes('read') || msg.includes('write'))
    return 'file_operation_error';
  if (msg.includes('inference') || msg.includes('ollama') || msg.includes('embedding'))
    return 'inference_error';

  return 'unknown_error';
}

/**
 * Infer severity from error category
 */
export function categorizeSeverity(category: ErrorCategory): ErrorSeverity {
  const critical = [
    'database_error',
    'authentication_error',
    'identity_error',
  ];
  const error = [
    'authorization_error',
    'missing_field',
    'type_mismatch',
    'parsing_error',
    'file_operation_error',
  ];
  const warning = [
    'timeout_error',
    'network_error',
    'vector_search_error',
    'inference_error',
  ];

  if (critical.includes(category)) return 'CRITICAL';
  if (error.includes(category)) return 'ERROR';
  if (warning.includes(category)) return 'WARNING';
  return 'INFO';
}

/**
 * Wrap a route handler to catch and log errors
 */
export function withErrorLogging<T extends (...args: any[]) => any>(
  handler: T,
  options: { routePath: string; filePath: string },
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (err) {
      const category = categorizeError(err);
      const severity = categorizeSeverity(category);

      await logError({
        category,
        severity,
        message: String(err),
        stack: err instanceof Error ? err.stack : undefined,
        routePath: options.routePath,
        filePath: options.filePath,
        contextKey: options.routePath.split('/').pop() || 'unknown',
      });

      throw err;
    }
  }) as T;
}
