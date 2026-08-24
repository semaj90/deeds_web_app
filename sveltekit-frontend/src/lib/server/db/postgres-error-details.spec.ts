import { describe, expect, it } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { postgresErrorDetails } from './postgres-error-details.js';

describe('postgresErrorDetails', () => {
  it('unwraps the driver cause from a DrizzleQueryError', () => {
    const cause = Object.assign(new Error('relation "analysis_jobs" does not exist'), {
      code: '42P01',
      severity: 'ERROR',
      detail: undefined,
      hint: undefined,
      schema: 'public',
      table: undefined,
      column: undefined,
      constraint: undefined,
    });
    const err = new DrizzleQueryError('Failed query: SELECT 1', [], cause);
    const details = postgresErrorDetails(err);
    expect(details.code).toBe('42P01');
    expect(details.postgresMessage).toBe('relation "analysis_jobs" does not exist');
    expect(details.drizzleMessage).toContain('Failed query');
  });

  it('falls back to the plain message for a non-Drizzle error', () => {
    const details = postgresErrorDetails(new Error('ECONNREFUSED'));
    expect(details.drizzleMessage).toBe('ECONNREFUSED');
    expect(details.code).toBeUndefined();
  });
});
