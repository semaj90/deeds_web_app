import { describe, expect, it } from 'vitest';

import { classifyTemporalProofDatabaseSafetyV1 } from './temporal-proof-database-safety.js';

describe('TemporalProofDatabaseSafetyV1', () => {
  it('rejects the known localhost proxy even with explicit disposable confirmation', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@127.0.0.1:5434/legal_ai_db',
      explicitDisposableConfirmation: true,
    })).toMatchObject({ allowed: false, reason: 'KNOWN_PROXY_TARGET_REJECTED' });

    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@localhost:5434/legal_ai_db',
      explicitDisposableConfirmation: true,
    })).toMatchObject({ allowed: false, reason: 'KNOWN_PROXY_TARGET_REJECTED' });
  });

  it('rejects the canonical legal_ai_db identity even through another route', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://legal_admin:secret@172.18.0.21:5432/legal_ai_db',
      explicitDisposableConfirmation: true,
    })).toEqual({
      allowed: false,
      reason: 'KNOWN_CANONICAL_DATABASE_REJECTED',
      target: '172.18.0.21:5432/legal_ai_db',
    });

    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://legal_admin:secret@some-alias:6543/legal_ai_db',
      explicitDisposableConfirmation: true,
    })).toMatchObject({ allowed: false, reason: 'KNOWN_CANONICAL_DATABASE_REJECTED' });
  });

  it('requires an explicit disposable proof confirmation', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@127.0.0.1:55432/atlas_proof',
      explicitDisposableConfirmation: false,
    })).toEqual({
      allowed: false,
      reason: 'EXPLICIT_DISPOSABLE_CONFIRMATION_REQUIRED',
      target: null,
    });
  });

  it('admits a different PostgreSQL target only after explicit disposable confirmation', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@127.0.0.1:55432/atlas_proof',
      explicitDisposableConfirmation: true,
    })).toEqual({
      allowed: true,
      reason: 'ALLOWED_EXPLICIT_DISPOSABLE_TARGET',
      target: '127.0.0.1:55432/atlas_proof',
    });
  });

  it('rejects missing, malformed, non-Postgres, and database-less URLs', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({ databaseUrl: undefined, explicitDisposableConfirmation: true }).reason)
      .toBe('DATABASE_URL_REQUIRED');
    expect(classifyTemporalProofDatabaseSafetyV1({ databaseUrl: 'not a url', explicitDisposableConfirmation: true }).reason)
      .toBe('DATABASE_URL_INVALID');
    expect(classifyTemporalProofDatabaseSafetyV1({ databaseUrl: 'redis://localhost:6379/0', explicitDisposableConfirmation: true }).reason)
      .toBe('DATABASE_URL_INVALID');
    expect(classifyTemporalProofDatabaseSafetyV1({ databaseUrl: 'postgresql://localhost:55432', explicitDisposableConfirmation: true }).reason)
      .toBe('DATABASE_URL_INVALID');
  });
});
