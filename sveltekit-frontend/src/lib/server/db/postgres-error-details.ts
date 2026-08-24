import { DrizzleQueryError } from 'drizzle-orm/errors';

/**
 * Drizzle wraps the real driver exception in `.cause` (see
 * DrizzleQueryError's own source) specifically so callers can recover it.
 * `console.error(err.message)` alone only ever prints "Failed query" plus
 * the query text — never the actual Postgres error code/detail/hint, which
 * is what distinguishes ECONNREFUSED / 57P01 admin_shutdown /
 * 53300 too_many_connections / 42P01 undefined_table / 42703 undefined_column
 * / 25P02 transaction_aborted / 40P01 deadlock_detected from each other.
 * Log this instead of `err.message` at any Drizzle catch boundary you're
 * trying to diagnose.
 */
export function postgresErrorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof DrizzleQueryError)) {
    return { drizzleMessage: error instanceof Error ? error.message : String(error) };
  }
  const cause = error.cause as
    | (Error & {
        code?: string;
        severity?: string;
        detail?: string;
        hint?: string;
        schema?: string;
        table?: string;
        column?: string;
        constraint?: string;
      })
    | undefined;
  return {
    drizzleMessage: error.message,
    postgresMessage: cause?.message,
    code: cause?.code,
    severity: cause?.severity,
    detail: cause?.detail,
    hint: cause?.hint,
    schema: cause?.schema,
    table: cause?.table,
    column: cause?.column,
    constraint: cause?.constraint,
    causeName: cause?.name,
  };
}
