// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { values, insert } = vi.hoisted(() => {
  const values = vi.fn(async () => undefined);
  return { values, insert: vi.fn(() => ({ values })) };
});

vi.mock('./db/client.js', () => ({ db: { insert } }));
vi.mock('./db/schema-postgres.js', () => ({ errorLogs: {} }));

import { logError } from './error-logging.js';

beforeEach(() => {
  values.mockClear();
  insert.mockClear();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('logError database readiness guard', () => {
  it('skips the error_logs row for a Postgres startup window', async () => {
    await logError({ category: 'database_error', severity: 'ERROR', message: 'the database system is starting up' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('skips recovery-mode and connection-refused transients', async () => {
    await logError({ category: 'database_error', severity: 'ERROR', message: 'the database system is in recovery mode' });
    await logError({ category: 'database_error', severity: 'ERROR', message: 'connect ECONNREFUSED 127.0.0.1:5434' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('still records an ordinary database error', async () => {
    await logError({ category: 'database_error', severity: 'ERROR', message: 'relation "foo" does not exist' });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('never filters non-database categories', async () => {
    await logError({ category: 'validation_error', severity: 'WARNING', message: 'the database system is starting up' });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
