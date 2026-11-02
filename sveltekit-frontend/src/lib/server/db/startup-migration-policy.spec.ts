import { describe, expect, it } from 'vitest';
import { shouldRunStartupMigrations } from './startup-migration-policy.js';

describe('shouldRunStartupMigrations', () => {
  it('does not run migrations in development', () => {
    expect(shouldRunStartupMigrations(true, { RUN_STARTUP_MIGRATIONS: 'true' })).toBe(false);
  });

  it('defaults to skipping migrations in production', () => {
    expect(shouldRunStartupMigrations(false, {})).toBe(false);
  });

  it('requires explicit production opt-in', () => {
    expect(shouldRunStartupMigrations(false, { RUN_STARTUP_MIGRATIONS: 'true' })).toBe(true);
  });

  it('honors the existing skip override', () => {
    expect(shouldRunStartupMigrations(false, {
      RUN_STARTUP_MIGRATIONS: 'true',
      SKIP_MIGRATIONS: 'true',
    })).toBe(false);
  });
});
